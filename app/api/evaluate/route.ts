import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructuredStream, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { EVALUATION_INSTRUCTIONS, POST_INTERVIEW_EVALUATION_INSTRUCTIONS, preEvaluationSchema, postEvaluationSchema } from "@/lib/ai/evaluation-prompt";
import { aiActivityLogs, applications, candidates, jobs, aiInstructions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// Streamed as newline-delimited JSON: {"type":"delta","text":...} while the AI writes,
// then a single {"type":"done",...} or {"type":"error",...} to close.
function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
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
      SELECT a.id,a.status,a.interview_summary,a.pre_evaluation_json,a.pre_human_decision,a.pre_human_decision_reason,
             a.recommendation,a.pre_recommendation,a.post_recommendation,
             c.cv_extracted_text,c.full_name,c.professional_title,c.company,c.years_experience,c.technologies,c.experience_summary,c.recruiter_opinion,
             j.title,j.client,j.description,j.must_requirements,j.preferred_requirements,j.technologies job_technologies,j.min_years,j.professional_emphasis,j.personality_emphasis,j.hiring_manager_emphasis
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId} AND a.archived=false AND c.archived=false AND j.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });
    // An employee promoted to a candidate (see "קידום כמועמד") gets a full card profile — title,
    // company, years, technologies, experience summary — but never an uploaded CV. Evaluation must
    // still work from the card alone in that case; only block when there's neither source at all.
    const hasCv = Boolean(row.cv_extracted_text);
    const hasCardProfile = Boolean(String(row.experience_summary ?? "").trim());
    if (!hasCv && !hasCardProfile) return Response.json({ error: "לא ניתן להעריך ללא קורות חיים או תקציר ניסיון בכרטיס המועמד" }, { status: 422 });

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

    // Calibration context for a post-interview run: prefer the recruiter's actual pre-interview
    // decision (more authoritative) over the AI's earlier advisory recommendation, if one was saved.
    // Read from the pre-interview's own dedicated columns, independent of whatever ran most recently.
    let previousCalibration = "";
    if (isPost && (row.pre_human_decision || row.pre_evaluation_json)) {
      let calibrationLine = "";
      if (row.pre_human_decision) {
        calibrationLine = `החלטת המגייס לפני ראיון: ${row.pre_human_decision}\nנימוק המגייס: ${row.pre_human_decision_reason || "לא צוין"}`;
      } else if (row.pre_evaluation_json) {
        try {
          const prev = (typeof row.pre_evaluation_json === "string" ? JSON.parse(row.pre_evaluation_json) : row.pre_evaluation_json) as Record<string, unknown>;
          calibrationLine = `המלצת AI לפני ראיון (מגייס טרם החליט): ${prev.ai_recommendation ?? "לא ידוע"}\nנימוק ה-AI: ${prev.ai_recommendation_reason ?? "לא ידוע"}`;
        } catch { calibrationLine = ""; }
      }
      if (calibrationLine) previousCalibration = `\n\nהערכה/החלטה קודמת לפני ראיון - לכיול השינוי בלבד, אינה Evidence:\n${calibrationLine}\nיש להסביר שינוי באמצעות מידע חדש מסיכום הראיון.`;
    }

    // Only the post-interview prompt needs this situational framing — the pre-interview prompt is
    // already fully self-contained about the advisory recommendation it gives.
    const decisionStage = isPost
      ? "שלב לאחר ראיון מקצועי. זו המלצה בלבד לגבי העברה ללקוח - ההחלטה בפועל היא של המגייס. אין לבקש מצוות הגיוס להחליט ואין להמליץ על ראיון שכבר בוצע."
      : "";

    const feedback = String(reviewerFeedback ?? "").trim().slice(0, 12000);
    const feedbackSection = feedback ? `\n\nמשוב מקצועי של המשתמש על ההערכה הקודמת:\n${feedback}` : "";

    // Only include the interview summary for a real post-interview run. An application can carry
    // interview text reused from a *different* job (see the raw-material reuse feature) without a
    // real interview ever happening for this one — feeding that into a pre-interview evaluation
    // would mix in irrelevant context from an unrelated role.
    const interviewSection = isPost ? `\n\nסיכום ראיון מקצועי:\n${row.interview_summary || "טרם התקיים או לא הוזן"}` : "";

    const hiringManagerSection = row.hiring_manager_emphasis
      ? `\n\n⚠ דגשי מנהל מגייס בצד הלקוח - עדיפות עליונה, כמעט כדרישת חובה מיוחדת (גובר על דגשים מקצועיים/אישיותיים כלליים כשיש מתח ביניהם):\n${row.hiring_manager_emphasis}`
      : "";

    // No CV happens for a candidate created via "קידום עובד למועמד" (internal employee promoted to
    // candidate for an internal role) — there's no external CV file, only the card profile built
    // from their internal profile/meetings. Say so explicitly so the AI treats the card as the
    // primary source instead of reporting missing evidence as if a CV was skipped.
    const cvSection = hasCv
      ? `קורות חיים - טקסט מלא שחולץ:\n${String(row.cv_extracted_text).slice(0, 120000)}`
      : `קורות חיים: לא הועלה קובץ קורות חיים למועמד/ת זו (למשל עובד/ת פנימי/ת שקודמו למועמדות דרך המערכת) — יש להתבסס על פרטי הכרטיס שלמעלה (תפקיד, חברה, ותק, טכנולוגיות, תקציר ניסיון) ועל חוות דעת המגייס כמקורות העיקריים.`;

    const input = `מקורות המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.job_technologies}\nשנות ניסיון: ${row.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${row.professional_emphasis}\nדגשים אישיותיים: ${row.personality_emphasis}${hiringManagerSection}\n\nמקורות המועמד:\nשם: ${row.full_name}\nתפקיד מקצועי בכרטיס: ${row.professional_title || "לא ידוע"}\nחברה: ${row.company}\nשנות ניסיון בכרטיס: ${row.years_experience ?? "לא ידוע"}\nטכנולוגיות בכרטיס: ${row.technologies}\nתקציר בכרטיס: ${row.experience_summary}\n\nחוות דעת מגייס - מקור משני ולא מאומת:\n${row.recruiter_opinion || "לא הוזנה"}\n\n${cvSection}${interviewSection}${previousCalibration}${feedbackSection}`;

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

          // A fresh run invalidates whatever decision the recruiter previously made on *this same
          // stage* — that decision was made against the AI output being replaced right now, so
          // showing it as still "decided" would be misleading. Clear it and require a fresh decision
          // against the new comparison. This never touches the other stage's decision.
          const staleRecommendation = isPost ? row.post_recommendation : row.pre_recommendation;
          const clearSharedRecommendation = Boolean(staleRecommendation) && row.recommendation === staleRecommendation;

          // The AI only compares requirements to the candidate and gives an advisory recommendation
          // — it never decides. score/recommendation ("current status") and the pre/post recommendation
          // mirrors are populated only once the recruiter saves their own decision (see
          // /api/evaluate/decision), never here.
          try {
            await db.update(applications).set({
              evaluationType,
              evaluationDate: new Date(),
              evaluationJson: evaluation,
              // Dedicated pre/post slots — never overwritten by the other type, so each tab always
              // shows its own last result independently. Re-running also resets that stage's saved
              // decision, since it was made against the evaluation being replaced.
              ...(isPost
                ? { postEvaluationJson: evaluation, postEvaluationDate: new Date(), postHumanDecision: "", postHumanDecisionReason: "", postHumanDecisionDate: null, postRecommendation: "" }
                : { preEvaluationJson: evaluation, preEvaluationDate: new Date(), preHumanDecision: "", preHumanDecisionReason: "", preHumanDecisionDate: null, preRecommendation: "" }),
              ...(clearSharedRecommendation ? { recommendation: "" } : {}),
              evaluationFeedback: feedback,
              proposedEngineRule: feedback && evaluation.generalizable_feedback ? String(evaluation.proposed_engine_rule ?? "") : "",
              // Records which prompt produced the proposal, so approving it can append the rule
              // directly to that specific prompt's own text instead of a separate global list.
              proposedEngineRuleKey: feedback && evaluation.generalizable_feedback && evaluation.proposed_engine_rule ? instructionKey : "",
              engineRuleStatus: feedback && evaluation.generalizable_feedback && evaluation.proposed_engine_rule ? "ממתין לאישור" : "ללא הצעה",
              nextAction: isPost ? "סקירת ההשוואה וקבלת החלטה על העברה ללקוח" : "סקירת ההשוואה וקבלת החלטה על זימון לראיון",
              updatedAt: new Date(),
            }).where(eq(applications.id, applicationId));
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
