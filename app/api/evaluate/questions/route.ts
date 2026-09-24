import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { INTERVIEW_QUESTIONS_INSTRUCTIONS, interviewQuestionsSchema } from "@/lib/ai/evaluation-prompt";
import { getPrompt } from "@/lib/ai/get-prompt";
import { aiActivityLogs, applications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

type InterviewQuestion = { question: string; targets: string; what_to_verify: string };

// Follow-up, on-demand step after a pre-interview evaluation: up to 5 interview questions grounded
// in the evaluation already produced (core role + fit table) and the candidate's actual CV.
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { applicationId } = (await request.json()) as { applicationId?: number };
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.id, a.pre_evaluation_json, a.evaluation_type,
             c.full_name, c.cv_extracted_text,
             j.title, j.client, j.description, j.must_requirements, j.preferred_requirements, j.technologies job_technologies
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false AND c.archived=false AND j.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });

    const evaluation = row.pre_evaluation_json as Record<string, unknown> | null;
    if (!evaluation) {
      return Response.json({ error: "יש להפיק קודם הערכה לפני ראיון" }, { status: 422 });
    }

    const input = `דרישות המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.job_technologies}\n\nההערכה שכבר בוצעה למועמד:\nליבת המשרה: ${evaluation.core_role ?? ""}\nטבלת התאמה מול דרישות המשרה: ${JSON.stringify(evaluation.fit_table ?? [])}\nהחלטה: ${evaluation.decision ?? ""} — ${evaluation.decision_reason ?? ""}\n\nקורות חיים - טקסט מלא שחולץ:\n${String(row.cv_extracted_text ?? "").slice(0, 120000)}`;

    const result = await generateStructured<{ questions: InterviewQuestion[] }>({
      operation: "interview_questions",
      instructions: await getPrompt("interview_questions", INTERVIEW_QUESTIONS_INSTRUCTIONS),
      input,
      schemaName: "interview_questions",
      jsonSchema: interviewQuestionsSchema,
      reasoningEffort: "medium",
    });

    const updatedEvaluation = { ...evaluation, interview_questions: result.data.questions };
    await db.update(applications).set({
      preEvaluationJson: updatedEvaluation,
      // Only mirror into the shared "current status" column if it isn't currently showing a more
      // recent post-interview evaluation — never let this pre-interview action overwrite that.
      ...(row.evaluation_type !== "לאחר ראיון" ? { evaluationJson: updatedEvaluation } : {}),
      updatedAt: new Date(),
    }).where(eq(applications.id, applicationId));

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "הפקת שאלות לראיון",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ questions: result.data.questions });
  } catch (error) {
    console.error("Interview questions error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "יצירת השאלות נכשלה" }, { status: 500 });
  }
}
