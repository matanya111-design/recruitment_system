import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { EVALUATION_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { aiActivityLogs, evaluationRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Lightweight schema — no recruitment_email/cv_changes/questions for bulk scan
const scanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["gate_status", "score", "fit_label", "bottom_line", "strengths", "gaps"],
  properties: {
    gate_status: { type: "string", enum: ["עבר את שער ההתאמה", "לא רלוונטי לתפקיד"] },
    score: { type: "integer" },
    fit_label: { type: "string", enum: ["מתאים", "מתאים חלקית", "גבולי", "לא מתאים", "לא רלוונטי לתפקיד"] },
    bottom_line: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
  },
} as const;

type ScanResult = { gate_status: string; score: number; fit_label: string; bottom_line: string; strengths: string[]; gaps: string[] };

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  const { jobId } = (await request.json()) as { jobId?: number };
  if (!jobId) return Response.json({ error: "חסר מזהה משרה" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const db = getDb();

  // Load job
  const jobRows = await db.execute(sql`
    SELECT id,title,client,description,must_requirements,preferred_requirements,
           technologies,min_years,professional_emphasis,personality_emphasis
    FROM jobs WHERE id=${jobId} AND archived=false
  `);
  const job = (jobRows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (!job) return Response.json({ error: "המשרה לא נמצאה" }, { status: 404 });

  // All non-archived candidates that have an extracted CV text
  const candRows = await db.execute(sql`
    SELECT id,full_name,professional_title,company,years_experience,technologies,
           experience_summary,recruiter_opinion,cv_extracted_text
    FROM candidates
    WHERE archived=false AND cv_extracted_text IS NOT NULL AND length(cv_extracted_text) > 100
    ORDER BY id
  `);
  const allCandidates = (candRows as unknown as { rows: Array<Record<string, unknown>> }).rows;

  if (allCandidates.length === 0) return Response.json({ results: [], total: 0, scanned: 0 });

  // Calibration rules
  const activeRulesRows = await db.select({ ruleText: evaluationRules.ruleText }).from(evaluationRules).where(eq(evaluationRules.active, true));
  const approvedRules = activeRulesRows.length
    ? `\n\nכללי כיול רוחביים שאושרו על ידי המשתמש:\n${activeRulesRows.map((r, i) => `${i + 1}. ${r.ruleText}`).join("\n")}`
    : "";

  const scanInstructions = `${EVALUATION_INSTRUCTIONS}${approvedRules}\n\nהשלב הנוכחי: סינון ראשוני מהיר. החזר gate_status, score, fit_label, bottom_line, strengths (2-4 נקודות חוזק קצרות), gaps (2-4 פערים קצרים). ללא שאלות, מייל גיוס או המלצות לשיפור קורות חיים.`;

  const jobDescription = `שם: ${job.title}\nלקוח: ${job.client}\nתיאור: ${job.description}\nדרישות חובה: ${job.must_requirements}\nדרישות יתרון: ${job.preferred_requirements}\nטכנולוגיות: ${job.technologies}\nשנות ניסיון: ${job.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${job.professional_emphasis}\nדגשים אישיותיים: ${job.personality_emphasis}`;

  // Evaluate in parallel batches of 5 to avoid overloading the proxy
  const BATCH = 5;
  const matches: Array<{ candidateId: number; name: string; score: number; fit_label: string; bottom_line: string; strengths: string[]; gaps: string[]; alreadyLinked: boolean; archivedApplicationId: number | null }> = [];
  let totalCost = 0;
  let totalInput = 0, totalOutput = 0;
  let model = "";

  // Track active and archived application IDs for this job
  const linkedRows = await db.execute(sql`
    SELECT candidate_id, id, archived FROM applications WHERE job_id=${jobId}
  `);
  const linkedIds = new Set<number>();
  const archivedAppById = new Map<number, number>(); // candidateId -> applicationId
  for (const row of (linkedRows as unknown as { rows: Array<{ candidate_id: number; id: number; archived: boolean }> }).rows) {
    if (!row.archived) linkedIds.add(Number(row.candidate_id));
    else archivedAppById.set(Number(row.candidate_id), Number(row.id));
  }

  for (let i = 0; i < allCandidates.length; i += BATCH) {
    const batch = allCandidates.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (cand) => {
        const input = `מקורות המשרה:\n${jobDescription}\n\nמקורות המועמד:\nשם: ${cand.full_name}\nתפקיד: ${cand.professional_title || "לא ידוע"}\nחברה: ${cand.company}\nשנות ניסיון: ${cand.years_experience ?? "לא ידוע"}\nטכנולוגיות: ${cand.technologies}\nתקציר: ${cand.experience_summary}\n\nחוות דעת מגייס (משני):\n${cand.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים:\n${String(cand.cv_extracted_text).slice(0, 80000)}`;

        const result = await generateStructured<ScanResult>({
          operation: "scan_candidate",
          instructions: scanInstructions,
          input,
          schemaName: "scan_result",
          jsonSchema: scanSchema,
          reasoningEffort: "medium",
        });
        return { cand, result };
      })
    );

    for (const settled of batchResults) {
      if (settled.status !== "fulfilled") continue;
      const { cand, result } = settled.value;
      totalInput += result.usage.input;
      totalOutput += result.usage.output;
      model = result.model;
      totalCost += estimateCost(result.model, result.usage);

      if (result.data.score >= 60) {
        const candId = Number(cand.id);
        matches.push({
          candidateId: candId,
          name: String(cand.full_name),
          score: result.data.score,
          fit_label: result.data.fit_label,
          bottom_line: result.data.bottom_line,
          strengths: result.data.strengths ?? [],
          gaps: result.data.gaps ?? [],
          alreadyLinked: linkedIds.has(candId),
          archivedApplicationId: archivedAppById.get(candId) ?? null,
        });
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  await db.insert(aiActivityLogs).values({
    actionType: "סריקת מועמדים למשרה",
    subjectType: "job",
    subjectId: jobId,
    subjectLabel: `${job.title} · ${job.client} — ${allCandidates.length} מועמדים נסרקו`,
    model: model || "unknown",
    inputTokens: totalInput,
    cachedInputTokens: 0,
    outputTokens: totalOutput,
    estimatedCostUsd: String(totalCost),
  });

  return Response.json({ results: matches, total: matches.length, scanned: allCandidates.length });
}
