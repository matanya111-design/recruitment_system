import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructuredStream, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { EVALUATION_INSTRUCTIONS, POST_INTERVIEW_EVALUATION_INSTRUCTIONS, preEvaluationSchema, postEvaluationSchema } from "@/lib/ai/evaluation-prompt";
import { aiActivityLogs, applications, candidates, jobs, aiInstructions } from "@/db/schema";
import { eq, and, eq as eqAlias } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Streamed as newline-delimited JSON: {"type":"delta","text":...} while the AI writes,
// then a single {"type":"done",...} or {"type":"error",...} to close.
function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

// The pre-interview prompt deliberately has no numeric score (it decides between 3 categories,
// not a 0-100 fit percentage) — this maps the decision to a coded score so existing score-based
// UI (the fit ring, job-list high/reasonable-fit counts) keeps working without change.
function scoreForDecision(decision: string): number {
  if (decision === "לזמן לראיון פנימי") return 80;
  if (decision === "בירור קצר לפני ראיון") return 55;
  return 25;
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { applicationId, reviewerFeedback, mode } = (await request.json()) as { applicationId?: number; reviewerFeedback?: string; mode?: "pre" | "post" };
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.id,a.status,a.interview_summary,a.pre_evaluation_json,
             c.cv_extracted_text,c.full_name,c.professional_title,c.company,c.years_experience,c.technologies,c.experience_summary,c.recruiter_opinion,
             j.title,j.client,j.description,j.must_requirements,j.preferred_requirements,j.technologies job_technologies,j.min_years,j.professional_emphasis,j.personality_emphasis
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false AND c.archived=false AND j.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });
    if (!row.cv_extracted_text) return Response.json({ error: "לא ניתן להעריך ללא טקסט שחולץ מקורות החיים" }, { status: 422 });

    // Which evaluation to run is decided by the tab/button the user explicitly chose (mode), not by
    // whether interview text happens to exist — an application can carry reused interview material
    // from a different job (see the "load previous interview" feature) without ever having had a
    // real interview for *this* one, so presence of text alone must not force post-interview mode.
    const requestedMode = mode === "pre" || mode === "post" ? mode : null;
    const evaluationType = requestedMode
      ? (requestedMode === "post" ? "לאחר ראיון" : "ראשונית")
      : (row.interview_summary ? "לאחר ראיון" : "ראשונית"); // fallback for callers that don't send mode
    const isPost = evaluationType === "לאחר ראיון";
    if (isPost && !row.interview_summary) {
      return Response.json({ error: "אין סיכום ראיון שמור למועמדות זו — יש להשלים ולאשר אותו לפני הערכה לאחר ראיון" }, { status: 422 });
    }
    const instructionKey = isPost ? "post_interview_evaluation" : "candidate_evaluation";
    const [savedInst] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, instructionKey));
    const baseInstructions = savedInst?.content ?? (isPost ? POST_INTERVIEW_EVALUATION_INSTRUCTIONS : EVALUATION_INSTRUCTIONS);

    // Calibration context for a post-interview run: the pre-interview evaluation is read from its
    // own dedicated column, independent of whatever ran most recently overall.
    let previousCalibration = "";
    if (isPost && row.pre_evaluation_json) {
      try {
        const prev = (typeof row.pre_evaluation_json === "string" ? JSON.parse(row.pre_evaluation_json) : row.pre_evaluation_json) as Record<string, unknown>;
        previousCalibration = `\n\nהערכה ראשונית קודמת - לכיול השינוי בלבד, אינה Evidence:\nהחלטה קודמת: ${prev.decision ?? "לא ידוע"}\nנימוק: ${prev.decision_reason ?? "לא ידוע"}\nיש להסביר שינוי באמצעות מידע חדש מסיכום הראיון.`;
      } catch { previousCalibration = ""; }
    }

    // Only the post-interview prompt needs this situational framing — the pre-interview prompt is
    // already fully self-contained about what decision it makes.
    const decisionStage = isPost
      ? "שלב לאחר ראיון מקצועי. ההחלטה היא האם להעביר את המועמד ללקוח המגייס. במייל לגיוס חובה לכתוב שורה תחתונה חד-משמעית: להעביר ללקוח או לא להעביר ללקוח. אין לבקש מצוות הגיוס להחליט ואין להמליץ על ראיון שכבר בוצע."
      : "";

    const feedback = String(reviewerFeedback ?? "").trim().slice(0, 12000);
    const feedbackSection = feedback ? `\n\nמשוב מקצועי של המשתמש על ההערכה הקודמת:\n${feedback}` : "";

    // Only include the interview summary for a real post-interview run. An application can carry
    // interview text reused from a *different* job (see the raw-material reuse feature) without a
    // real interview ever happening for this one — feeding that into a pre-interview evaluation
    // would mix in irrelevant context from an unrelated role.
    const interviewSection = isPost ? `\n\nסיכום ראיון מקצועי:\n${row.interview_summary || "טרם התקיים או לא הוזן"}` : "";

    const input = `מקורות המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.job_technologies}\nשנות ניסיון: ${row.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${row.professional_emphasis}\nדגשים אישיותיים: ${row.personality_emphasis}\n\nמקורות המועמד:\nשם: ${row.full_name}\nתפקיד מקצועי בכרטיס: ${row.professional_title || "לא ידוע"}\nחברה: ${row.company}\nשנות ניסיון בכרטיס: ${row.years_experience ?? "לא ידוע"}\nטכנולוגיות בכרטיס: ${row.technologies}\nתקציר בכרטיס: ${row.experience_summary}\n\nחוות דעת מגייס - מקור משני ולא מאומת:\n${row.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים - טקסט מלא שחולץ:\n${String(row.cv_extracted_text).slice(0, 120000)}${interviewSection}${previousCalibration}${feedbackSection}`;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let finalResult: { data: Record<string, unknown>; model: string; usage: { input: number; cached: number; output: number } } | null = null;

          for await (const event of generateStructuredStream<Record<string, unknown>>({
            operation: "evaluate",
            instructions: `${baseInstructions}${decisionStage ? `\n\nהשלב הנוכחי מחייב: ${decisionStage}` : ""}`,
            input,
            schemaName: isPost ? "candidate_post_evaluation" : "candidate_pre_evaluation",
            jsonSchema: isPost ? postEvaluationSchema : preEvaluationSchema,
            reasoningEffort: "medium",
          })) {
            if (event.type === "delta") {
              controller.enqueue(ndjson({ type: "delta", text: event.text }));
            } else if (event.type === "error") {
              controller.enqueue(ndjson({ type: "error", message: event.message }));
              controller.close();
              return;
            } else {
              finalResult = event.result;
            }
          }

          if (!finalResult) {
            controller.enqueue(ndjson({ type: "error", message: "לא התקבל פלט מה-AI" }));
            controller.close();
            return;
          }

          const evaluation = finalResult.data;

          const score = isPost ? Number(evaluation.score) : scoreForDecision(String(evaluation.decision ?? ""));
          const recommendationText = String(evaluation.decision ?? "");
          const needsClarification = !isPost && evaluation.decision === "בירור קצר לפני ראיון";

          // A malformed/incomplete AI response (e.g. a missing or non-numeric score) must not reach
          // Postgres — writing NaN into an integer column fails with a raw driver error that would
          // otherwise leak straight to the client.
          if (!Number.isFinite(score)) {
            controller.enqueue(ndjson({ type: "error", message: "ה-AI החזיר תוצאה לא תקינה (ציון חסר או שגוי). נסה להריץ את ההערכה שוב." }));
            controller.close();
            return;
          }

          try {
            await db.update(applications).set({
              // "Current status" columns — reflect whichever type ran most recently, used by
              // dashboards/list views that need one status per application.
              score,
              recommendation: recommendationText,
              evaluationType,
              evaluationDate: new Date(),
              evaluationJson: evaluation,
              // Dedicated pre/post slots — never overwritten by the other type, so each tab always
              // shows its own last result independently.
              ...(isPost
                ? { postEvaluationJson: evaluation, postScore: score, postRecommendation: recommendationText, postEvaluationDate: new Date() }
                : { preEvaluationJson: evaluation, preScore: score, preRecommendation: recommendationText, preEvaluationDate: new Date() }),
              evaluationFeedback: feedback,
              proposedEngineRule: feedback && evaluation.generalizable_feedback ? String(evaluation.proposed_engine_rule ?? "") : "",
              // Records which prompt produced the proposal, so approving it can append the rule
              // directly to that specific prompt's own text instead of a separate global list.
              proposedEngineRuleKey: feedback && evaluation.generalizable_feedback && evaluation.proposed_engine_rule ? instructionKey : "",
              engineRuleStatus: feedback && evaluation.generalizable_feedback && evaluation.proposed_engine_rule ? "ממתין לאישור" : "ללא הצעה",
              nextAction: isPost ? "קבלת החלטה ועדכון סטטוס" : "תיאום או ביצוע ראיון מקצועי",
              updatedAt: new Date(),
            }).where(eq(applications.id, applicationId));

            if (needsClarification) {
              await db.execute(sql`UPDATE applications SET status=CASE WHEN status IN ('חדש','בבדיקה') THEN 'דורש בירור' ELSE status END WHERE id=${applicationId}`);
            }
          } catch (dbError) {
            // Never forward a raw driver/SQL error (query text + bound params) to the client.
            console.error("Evaluate DB write failed:", dbError);
            controller.enqueue(ndjson({ type: "error", message: "ההערכה הופקה אך שמירתה בבסיס הנתונים נכשלה. נסה שוב בעוד רגע." }));
            controller.close();
            return;
          }

          const cost = estimateCost(finalResult.model, finalResult.usage);
          await db.insert(aiActivityLogs).values({
            actionType: feedback ? "עדכון הערכה לפי משוב מקצועי" : isPost ? "הערכת מועמד לאחר ראיון" : "הערכת מועמד ראשונית",
            subjectType: "application",
            subjectId: applicationId,
            subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
            model: finalResult.model,
            inputTokens: finalResult.usage.input,
            cachedInputTokens: finalResult.usage.cached,
            outputTokens: finalResult.usage.output,
            estimatedCostUsd: String(cost),
          });

          controller.enqueue(ndjson({ type: "done", evaluation, evaluationType, usage: finalResult.usage }));
          controller.close();
        } catch (error) {
          console.error("Evaluate stream error:", error);
          controller.enqueue(ndjson({ type: "error", message: error instanceof Error ? error.message : "הערכת המועמד נכשלה" }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    console.error("Evaluate error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "הערכת המועמד נכשלה" }, { status: 500 });
  }
}
