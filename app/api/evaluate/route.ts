import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { EVALUATION_INSTRUCTIONS, POST_INTERVIEW_EVALUATION_INSTRUCTIONS, evaluationSchema } from "@/lib/ai/evaluation-prompt";
import { aiActivityLogs, applications, candidates, jobs, aiInstructions, evaluationRules } from "@/db/schema";
import { eq, and, eq as eqAlias } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { applicationId, reviewerFeedback } = (await request.json()) as { applicationId?: number; reviewerFeedback?: string };
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.id,a.status,a.interview_summary,a.evaluation_json previous_evaluation,a.evaluation_type previous_evaluation_type,
             c.cv_extracted_text,c.full_name,c.professional_title,c.company,c.years_experience,c.technologies,c.experience_summary,c.recruiter_opinion,
             j.title,j.client,j.description,j.must_requirements,j.preferred_requirements,j.technologies job_technologies,j.min_years,j.professional_emphasis,j.personality_emphasis
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false AND c.archived=false AND j.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });
    if (!row.cv_extracted_text) return Response.json({ error: "לא ניתן להעריך ללא טקסט שחולץ מקורות החיים" }, { status: 422 });

    const activeRulesRows = await db.select({ ruleText: evaluationRules.ruleText }).from(evaluationRules).where(eq(evaluationRules.active, true));
    const approvedRules = activeRulesRows.length ? `\n\nכללי כיול רוחביים שאושרו על ידי המשתמש:\n${activeRulesRows.map((r, i) => `${i + 1}. ${r.ruleText}`).join("\n")}` : "";

    const evaluationType = row.interview_summary ? "לאחר ראיון" : "ראשונית";
    const instructionKey = row.interview_summary ? "post_interview_evaluation" : "candidate_evaluation";
    const [savedInst] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, instructionKey));
    const baseInstructions = savedInst?.content ?? (evaluationType === "לאחר ראיון" ? POST_INTERVIEW_EVALUATION_INSTRUCTIONS : EVALUATION_INSTRUCTIONS);

    let previousCalibration = "";
    if (row.previous_evaluation_type === "ראשונית" && row.previous_evaluation) {
      try {
        const prev = JSON.parse(String(row.previous_evaluation)) as Record<string, unknown>;
        previousCalibration = `\n\nהערכה ראשונית קודמת - לכיול השינוי בלבד, אינה Evidence:\nציון: ${prev.score ?? "לא ידוע"}\nסיווג: ${prev.fit_label ?? "לא ידוע"}\nהמלצה: ${prev.recommendation ?? "לא ידוע"}\nשורה תחתונה: ${prev.bottom_line ?? "לא ידוע"}\nיש להסביר שינוי באמצעות מידע חדש מסיכום הראיון.`;
      } catch { previousCalibration = ""; }
    }

    const decisionStage = evaluationType === "לאחר ראיון"
      ? "שלב לאחר ראיון מקצועי. ההחלטה היא האם להעביר את המועמד ללקוח המגייס. במייל לגיוס חובה לכתוב שורה תחתונה חד-משמעית: להעביר ללקוח או לא להעביר ללקוח. אין לבקש מצוות הגיוס להחליט ואין להמליץ על ראיון שכבר בוצע."
      : "שלב סינון ראשוני לפני ראיון מקצועי. ההחלטה היא האם לזמן את המועמד לראיון מקצועי או לא. בשלב זה אסור להציע שינויים בקורות החיים או לכלול המלצות כאלה במייל לגיוס. חובה להחזיר cv_changes_needed=false ו-cv_change_recommendations כרשימה ריקה.";

    const feedback = String(reviewerFeedback ?? "").trim().slice(0, 12000);
    const feedbackSection = feedback ? `\n\nמשוב מקצועי של המשתמש על ההערכה הקודמת:\n${feedback}` : "";

    const input = `מקורות המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.job_technologies}\nשנות ניסיון: ${row.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${row.professional_emphasis}\nדגשים אישיותיים: ${row.personality_emphasis}\n\nמקורות המועמד:\nשם: ${row.full_name}\nתפקיד מקצועי בכרטיס: ${row.professional_title || "לא ידוע"}\nחברה: ${row.company}\nשנות ניסיון בכרטיס: ${row.years_experience ?? "לא ידוע"}\nטכנולוגיות בכרטיס: ${row.technologies}\nתקציר בכרטיס: ${row.experience_summary}\n\nחוות דעת מגייס - מקור משני ולא מאומת:\n${row.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים - טקסט מלא שחולץ:\n${String(row.cv_extracted_text).slice(0, 120000)}\n\nסיכום ראיון מקצועי:\n${row.interview_summary || "טרם התקיים או לא הוזן"}${previousCalibration}${feedbackSection}`;

    const result = await generateStructured<Record<string, unknown>>({
      operation: "evaluate",
      instructions: `${baseInstructions}${approvedRules}\n\nהשלב הנוכחי מחייב: ${decisionStage}`,
      input,
      schemaName: "candidate_evaluation",
      jsonSchema: evaluationSchema,
      reasoningEffort: "medium",
    });

    const evaluation = result.data;

    // Enforce pre-interview constraints
    if (evaluationType === "ראשונית") {
      evaluation.cv_changes_needed = false;
      evaluation.cv_change_recommendations = [];
      if (typeof evaluation.recruitment_email === "string") {
        evaluation.recruitment_email = evaluation.recruitment_email.replace(/\n*שינויים מומלצים בקורות החיים[\s\S]*$/u, "").trim();
      }
    }

    const needsClarification = evaluationType === "ראשונית" && (
      /בירור|גבולי/.test(String(evaluation.recommendation ?? "")) ||
      /בירור|גבולי/.test(String(evaluation.fit_label ?? ""))
    );

    await db.update(applications).set({
      score: Number(evaluation.score),
      recommendation: String(evaluation.fit_label),
      evaluationType,
      evaluationDate: new Date(),
      evaluationJson: evaluation,
      evaluationFeedback: feedback,
      proposedEngineRule: feedback && evaluation.generalizable_feedback ? String(evaluation.proposed_engine_rule ?? "") : "",
      engineRuleStatus: feedback && evaluation.generalizable_feedback && evaluation.proposed_engine_rule ? "ממתין לאישור" : "ללא הצעה",
      nextAction: evaluationType === "לאחר ראיון" ? "קבלת החלטה ועדכון סטטוס" : "תיאום או ביצוע ראיון מקצועי",
      updatedAt: new Date(),
    }).where(eq(applications.id, applicationId));

    if (needsClarification) {
      await db.execute(sql`UPDATE applications SET status=CASE WHEN status IN ('חדש','בבדיקה') THEN 'דורש בירור' ELSE status END WHERE id=${applicationId}`);
    }

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: feedback ? "עדכון הערכה לפי משוב מקצועי" : evaluationType === "לאחר ראיון" ? "הערכת מועמד לאחר ראיון" : "הערכת מועמד ראשונית",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ evaluation, evaluationType, usage: result.usage });
  } catch (error) {
    console.error("Evaluate error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "הערכת המועמד נכשלה" }, { status: 500 });
  }
}
