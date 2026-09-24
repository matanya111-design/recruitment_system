import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { getPrompt } from "@/lib/ai/get-prompt";
import { PRE_RECRUITMENT_EMAIL_INSTRUCTIONS, POST_RECRUITMENT_EMAIL_INSTRUCTIONS, recruitmentEmailSchema } from "@/lib/ai/recruitment-email-prompt";
import { DISAGREEMENT_INSIGHT_INSTRUCTIONS, disagreementInsightSchema } from "@/lib/ai/disagreement-insight-prompt";
import { aiActivityLogs, applications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const PRE_DECISIONS = ["לזמן לראיון פנימי", "לא לקדם למשרה זו"];
const POST_DECISIONS = ["להעביר ללקוח", "לא להעביר ללקוח"];

// A meaningful disagreement is a clean contradiction between the AI's advisory recommendation and
// what the recruiter actually decided — not the ambivalent pre-interview "clarify first" middle
// ground, which isn't a real disagreement with either binary decision.
function isMeaningfulDisagreement(aiRecommendation: string, decision: string): boolean {
  if (!aiRecommendation || aiRecommendation === "בירור קצר לפני ראיון מומלץ") return false;
  return aiRecommendation !== decision;
}

// The recruiter's own decision — never the AI's — is what actually moves an application forward.
// Saving it here also drafts the recruitment email, strictly from the decision + reasoning given
// (never from the AI's own earlier recommendation), and merges it into the stored evaluation JSON
// so the existing email chat panel picks it up like before.
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { applicationId, mode, decision, reason } = (await request.json()) as {
      applicationId?: number;
      mode?: "pre" | "post";
      decision?: string;
      reason?: string;
    };
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (mode !== "pre" && mode !== "post") return Response.json({ error: "חסר שלב הערכה (mode)" }, { status: 400 });
    const isPost = mode === "post";
    const allowed = isPost ? POST_DECISIONS : PRE_DECISIONS;
    if (!decision || !allowed.includes(decision)) return Response.json({ error: "החלטה לא תקינה" }, { status: 400 });
    const reasonText = String(reason ?? "").trim();
    if (reasonText.length < 5) return Response.json({ error: "יש להזין נימוק להחלטה" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.pre_evaluation_json, a.post_evaluation_json, a.interview_summary,
             c.full_name, c.technologies,
             j.title, j.client
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });

    const evalColumn = isPost ? row.post_evaluation_json : row.pre_evaluation_json;
    const currentEvaluation = (typeof evalColumn === "string" ? JSON.parse(evalColumn) : evalColumn) as Record<string, unknown> | null;
    if (!currentEvaluation) return Response.json({ error: "יש להפיק קודם הערכה" }, { status: 422 });

    const instructionKey = isPost ? "post_recruitment_email" : "pre_recruitment_email";
    const instructions = await getPrompt(instructionKey, isPost ? POST_RECRUITMENT_EMAIL_INSTRUCTIONS : PRE_RECRUITMENT_EMAIL_INSTRUCTIONS);
    // Post-interview only: this email is archived long-term and must stand on its own as a full
    // record of the interview, so the AI needs the actual interview findings — not just the verdict.
    const interviewFindings = isPost
      ? `\n\nההערכה המקצועית שהופקה מהראיון (המקור למידע העובדתי על המועמד שיש לפרט במייל):\nתמצית: ${currentEvaluation.bottom_line ?? ""}\nתקציר מנהלים: ${currentEvaluation.executive_summary ?? ""}\nחוזקות: ${JSON.stringify(currentEvaluation.strengths ?? [])}\nפערים: ${JSON.stringify(currentEvaluation.gaps ?? [])}\nאי-ודאויות: ${JSON.stringify(currentEvaluation.uncertainties ?? [])}\n\nטכנולוגיות בפרופיל המועמד: ${JSON.stringify(row.technologies ?? [])}\n\nסיכום הראיון המקורי (לזיהוי אילו מהטכנולוגיות האלה עלו בפועל בראיון):\n${row.interview_summary || "לא הוזן"}`
      : "";
    const input = `מועמד: ${row.full_name}\nמשרה: ${row.title}\nלקוח: ${row.client}\n\nהחלטת המגייס: ${decision}\nנימוק המגייס (הבסיס היחיד למסקנה הסופית):\n${reasonText}${interviewFindings}`;

    const result = await generateStructured<{ recruitment_email: string }>({
      operation: instructionKey,
      instructions,
      input,
      schemaName: instructionKey,
      jsonSchema: recruitmentEmailSchema,
      reasoningEffort: "medium",
    });

    const updatedEvaluation = { ...currentEvaluation, recruitment_email: result.data.recruitment_email };
    const now = new Date();

    // Automatic, cautious learning signal: only when the recruiter's actual decision contradicts
    // the AI's own earlier advisory recommendation — the exact situation worth learning from. This
    // never writes to a prompt directly; it only proposes, going through the same review-before-merge
    // flow as manually-given reviewer feedback (see app/api/engine-rule/route.ts).
    const aiRecommendation = String(currentEvaluation.ai_recommendation ?? "");
    let insightFields: Record<string, unknown> = {};
    if (isMeaningfulDisagreement(aiRecommendation, decision)) {
      const targetKey = isPost ? "post_interview_evaluation" : "candidate_evaluation";
      const insightInput = `משרה: ${row.title} · ${row.client}\nמועמד: ${row.full_name}\n\nהמלצת ה-AI: ${aiRecommendation}\nנימוק ה-AI: ${currentEvaluation.ai_recommendation_reason ?? currentEvaluation.bottom_line ?? ""}\n\nההחלטה בפועל של המגייס: ${decision}\nנימוק המגייס:\n${reasonText}`;
      try {
        const insightResult = await generateStructured<{ generalizable_feedback: boolean; proposed_engine_rule: string; insight_summary: string }>({
          operation: "disagreement_insight",
          instructions: await getPrompt("disagreement_insight", DISAGREEMENT_INSIGHT_INSTRUCTIONS),
          input: insightInput,
          schemaName: "disagreement_insight",
          jsonSchema: disagreementInsightSchema,
          reasoningEffort: "medium",
        });
        if (insightResult.data.generalizable_feedback && insightResult.data.proposed_engine_rule) {
          const summary = insightResult.data.insight_summary?.trim();
          insightFields = {
            proposedEngineRule: summary ? `${summary}\n\nכלל מוצע: ${insightResult.data.proposed_engine_rule}` : insightResult.data.proposed_engine_rule,
            proposedEngineRuleKey: targetKey,
            engineRuleStatus: "ממתין לאישור",
          };
        }
        const insightCost = estimateCost(insightResult.model, insightResult.usage);
        await db.insert(aiActivityLogs).values({
          actionType: "זיהוי תובנה מאי-הסכמה עם המלצת AI",
          subjectType: "application",
          subjectId: applicationId,
          subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
          model: insightResult.model,
          inputTokens: insightResult.usage.input,
          cachedInputTokens: insightResult.usage.cached,
          outputTokens: insightResult.usage.output,
          estimatedCostUsd: String(insightCost),
        });
      } catch (insightError) {
        // This is a best-effort learning signal, not core to saving the decision — never fail the
        // whole request over it.
        console.error("disagreement insight error:", insightError);
      }
    }

    await db.update(applications).set({
      recommendation: decision,
      evaluationType: isPost ? "לאחר ראיון" : "ראשונית",
      ...(isPost
        ? { postEvaluationJson: updatedEvaluation, postRecommendation: decision, postHumanDecision: decision, postHumanDecisionReason: reasonText, postHumanDecisionDate: now }
        : { preEvaluationJson: updatedEvaluation, preRecommendation: decision, preHumanDecision: decision, preHumanDecisionReason: reasonText, preHumanDecisionDate: now }),
      ...insightFields,
      updatedAt: now,
    }).where(eq(applications.id, applicationId));

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "יצירת מייל גיוס לפי החלטת מגייס",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ ok: true, recruitmentEmail: result.data.recruitment_email });
  } catch (error) {
    console.error("evaluate/decision error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שמירת ההחלטה נכשלה" }, { status: 500 });
  }
}
