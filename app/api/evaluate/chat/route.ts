import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { EVALUATION_CHAT_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { getPrompt } from "@/lib/ai/get-prompt";
import { getDb } from "@/db/client";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

const chatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

// Read-only Q&A about an already-produced evaluation — "why did you conclude X". Does not touch
// the stored evaluation; the user reviews the conversation and, only if they choose to, feeds it
// back into /api/evaluate as reviewerFeedback to actually correct the evaluation.
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  try {
    const { applicationId, messages, mode } = (await request.json()) as {
      applicationId?: number;
      messages: Array<{ role: "user" | "assistant"; text: string }>;
      mode?: "pre" | "post";
    };
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר" }, { status: 503 });

    const isPost = mode === "post";
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.pre_evaluation_json, a.post_evaluation_json, a.interview_summary,
             c.full_name, c.cv_extracted_text, c.recruiter_opinion,
             j.title, j.client, j.description, j.must_requirements, j.preferred_requirements,
             j.technologies job_technologies, j.min_years, j.professional_emphasis, j.personality_emphasis
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });
    const relevantEvaluation = isPost ? row.post_evaluation_json : row.pre_evaluation_json;
    if (!relevantEvaluation) return Response.json({ error: "טרם קיימת הערכה לדון עליה" }, { status: 422 });

    const instructions = await getPrompt("evaluation_chat", EVALUATION_CHAT_INSTRUCTIONS);

    // Pre-interview mode never includes the interview summary — it may be material reused from a
    // different job (see the raw-material reuse feature), unrelated to this evaluation.
    const interviewLine = isPost ? `\n\nסיכום ראיון מקצועי: ${row.interview_summary || "טרם התקיים"}` : "";
    const context = `דרישות המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.job_technologies}\nשנות ניסיון: ${row.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${row.professional_emphasis}\nדגשים אישיותיים: ${row.personality_emphasis}\n\nמועמד: ${row.full_name}\nחוות דעת מגייס: ${row.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים - טקסט מלא שחולץ:\n${String(row.cv_extracted_text ?? "").slice(0, 120000)}${interviewLine}\n\nההערכה שכבר הופקה (${isPost ? "לאחר ראיון" : "ראשונית"}):\n${JSON.stringify(relevantEvaluation)}`;

    const historyText = messages.map((m) => `${m.role === "user" ? "שאלה" : "תשובה קודמת"}: ${m.text}`).join("\n\n");
    const input = `${context}\n\n--- השיחה עם המשתמש ---\n${historyText}`;

    const result = await generateStructured<{ reply: string }>({
      operation: "evaluation_chat",
      instructions,
      input,
      schemaName: "evaluation_chat",
      jsonSchema: chatSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "שיח הבהרה על הערכת AI",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ reply: result.data.reply });
  } catch (error) {
    console.error("evaluate/chat error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
