import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { CANDIDATE_SCAN_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { getPrompt } from "@/lib/ai/get-prompt";
import { normalizeStringArray } from "@/lib/ai/normalize";
import { aiActivityLogs, candidateScans } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";

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
type Pooled = {
  source: "candidate" | "team_member"; id: number; name: string; profileText: string; archived: boolean;
  // Carried through into the match payload so the client can show a profile hover-card with zero
  // extra fetches — these are already selected below, just not previously propagated.
  title: string; org: string; years: number | null; technologies: string[];
};

// GET ?jobId=X — returns the most recently saved scan for a job, with no AI call, so the results
// can be reopened later without re-running (and re-billing) the scan.
export async function GET(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  const jobId = Number(new URL(request.url).searchParams.get("jobId"));
  if (!jobId) return Response.json({ error: "חסר מזהה משרה" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(candidateScans).where(eq(candidateScans.jobId, jobId)).orderBy(desc(candidateScans.createdAt)).limit(1);
  if (!row) return Response.json({ error: "אין סריקה שמורה למשרה זו" }, { status: 404 });

  // resultsJson stores every scanned entry (including those below the score-60 display cutoff, kept
  // so the scan-chat endpoint can answer "why didn't X make the list") — the modal only ever shows
  // the ones that cleared the cutoff.
  const allEntries = (row.resultsJson as Array<{ included?: boolean }>) ?? [];
  const shown = allEntries.filter((m) => m.included !== false);
  return Response.json({ results: shown, scanned: row.scanned, createdAt: row.createdAt });
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  const { jobId } = (await request.json()) as { jobId?: number };
  if (!jobId) return Response.json({ error: "חסר מזהה משרה" }, { status: 400 });
  if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const db = getDb();

  // Load job
  const jobRows = await db.execute(sql`
    SELECT id,title,client,description,must_requirements,preferred_requirements,
           technologies,min_years,professional_emphasis,personality_emphasis,hiring_manager_emphasis
    FROM jobs WHERE id=${jobId} AND archived=false
  `);
  const job = (jobRows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (!job) return Response.json({ error: "המשרה לא נמצאה" }, { status: 404 });

  // Whole candidate pool — active AND archived, since an archived candidate may just be closed out
  // from a *different, unrelated* job and could still be a great fit for this one.
  const candRows = await db.execute(sql`
    SELECT id,full_name,professional_title,company,years_experience,technologies,
           experience_summary,recruiter_opinion,cv_extracted_text,archived
    FROM candidates
    WHERE cv_extracted_text IS NOT NULL AND length(cv_extracted_text) > 100
    ORDER BY id
  `);
  const candidateRows = (candRows as unknown as { rows: Array<Record<string, unknown>> }).rows;

  // Internal team members — potential internal moves, using their notes as a CV-equivalent profile.
  const teamRows = await db.execute(sql`
    SELECT id, name, notes, role, client FROM team_members WHERE notes IS NOT NULL AND length(notes) > 100 ORDER BY id
  `).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const teamMemberRows = (teamRows as unknown as { rows: Array<Record<string, unknown>> }).rows;

  const pool: Pooled[] = [
    ...candidateRows.map((cand): Pooled => ({
      source: "candidate",
      id: Number(cand.id),
      name: String(cand.full_name),
      archived: Boolean(cand.archived),
      profileText: `תפקיד: ${cand.professional_title || "לא ידוע"}\nחברה: ${cand.company}\nשנות ניסיון: ${cand.years_experience ?? "לא ידוע"}\nטכנולוגיות: ${cand.technologies}\nתקציר: ${cand.experience_summary}\n\nחוות דעת מגייס (משני):\n${cand.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים:\n${String(cand.cv_extracted_text).slice(0, 80000)}`,
      title: String(cand.professional_title || ""),
      org: String(cand.company || ""),
      years: cand.years_experience === null ? null : Number(cand.years_experience),
      technologies: Array.isArray(cand.technologies) ? cand.technologies as string[] : [],
    })),
    ...teamMemberRows.map((member): Pooled => ({
      source: "team_member",
      id: Number(member.id),
      name: String(member.name),
      archived: false,
      profileText: `פרופיל עובד פנימי (מועמד פוטנציאלי למעבר תפקיד, לא קורות חיים חיצוניים):\n${member.notes}`,
      title: String(member.role || ""),
      org: String(member.client || ""),
      years: null,
      technologies: [],
    })),
  ];

  if (pool.length === 0) return Response.json({ results: [], total: 0, scanned: 0 });

  const scanInstructions = await getPrompt("candidate_scan", CANDIDATE_SCAN_INSTRUCTIONS);

  const hiringManagerLine = job.hiring_manager_emphasis
    ? `\n⚠ דגשי מנהל מגייס בצד הלקוח - עדיפות עליונה, כמעט כדרישת חובה מיוחדת: ${job.hiring_manager_emphasis}`
    : "";
  const jobDescription = `שם: ${job.title}\nלקוח: ${job.client}\nתיאור: ${job.description}\nדרישות חובה: ${job.must_requirements}\nדרישות יתרון: ${job.preferred_requirements}\nטכנולוגיות: ${job.technologies}\nשנות ניסיון: ${job.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${job.professional_emphasis}\nדגשים אישיותיים: ${job.personality_emphasis}${hiringManagerLine}`;

  // Evaluate in parallel batches of 5 to avoid overloading the proxy
  const BATCH = 5;
  const allEvaluated: Array<{
    source: "candidate" | "team_member"; id: number; name: string; score: number; fit_label: string; bottom_line: string;
    strengths: string[]; gaps: string[]; alreadyLinked: boolean; archivedApplicationId: number | null; candidateArchived: boolean;
    title: string; org: string; years: number | null; technologies: string[]; included: boolean;
  }> = [];
  let totalCost = 0;
  let totalInput = 0, totalOutput = 0;
  let model = "";

  // Track active and archived application IDs for this job (candidates only — team members are
  // never directly linked; they go through the promote-to-candidate flow first).
  const linkedRows = await db.execute(sql`
    SELECT candidate_id, id, archived FROM applications WHERE job_id=${jobId}
  `);
  const linkedIds = new Set<number>();
  const archivedAppById = new Map<number, number>(); // candidateId -> applicationId
  for (const row of (linkedRows as unknown as { rows: Array<{ candidate_id: number; id: number; archived: boolean }> }).rows) {
    if (!row.archived) linkedIds.add(Number(row.candidate_id));
    else archivedAppById.set(Number(row.candidate_id), Number(row.id));
  }

  for (let i = 0; i < pool.length; i += BATCH) {
    const batch = pool.slice(i, i + BATCH);
    // Per-entry try/catch (not a bare Promise.allSettled) so a failed AI call still identifies WHICH
    // pool entry it was — otherwise that person would vanish from the results with no trace, and the
    // scan-chat couldn't even say "the evaluation for X failed" instead of just not knowing them.
    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        try {
          const input = `מקורות המשרה:\n${jobDescription}\n\nמקורות המועמד:\nשם: ${entry.name}\n\n${entry.profileText}`;
          const result = await generateStructured<ScanResult>({
            operation: "scan_candidate",
            instructions: scanInstructions,
            input,
            schemaName: "scan_result",
            jsonSchema: scanSchema,
            reasoningEffort: "medium",
          });
          return { entry, ok: true as const, result };
        } catch (err) {
          return { entry, ok: false as const, error: err instanceof Error ? err.message : "שגיאת AI" };
        }
      })
    );

    for (const settled of batchResults) {
      const { entry } = settled;
      if (!settled.ok) {
        allEvaluated.push({
          source: entry.source, id: entry.id, name: entry.name,
          score: 0, fit_label: "שגיאה בסריקה", bottom_line: `הערכת ה-AI עבור מועמד/ת זה נכשלה ולא הושלמה (${settled.error}) — יש להריץ סריקה מחדש כדי לקבל תוצאה עבורו/ה.`,
          strengths: [], gaps: [],
          alreadyLinked: entry.source === "candidate" && linkedIds.has(entry.id),
          archivedApplicationId: entry.source === "candidate" ? (archivedAppById.get(entry.id) ?? null) : null,
          candidateArchived: entry.source === "candidate" && entry.archived,
          title: entry.title, org: entry.org, years: entry.years, technologies: entry.technologies,
          included: false,
        });
        continue;
      }
      const { result } = settled;
      totalInput += result.usage.input;
      totalOutput += result.usage.output;
      model = result.model;
      totalCost += estimateCost(result.model, result.usage);

      allEvaluated.push({
        source: entry.source,
        id: entry.id,
        name: entry.name,
        score: result.data.score,
        fit_label: result.data.fit_label,
        bottom_line: result.data.bottom_line,
        strengths: normalizeStringArray(result.data.strengths),
        gaps: normalizeStringArray(result.data.gaps),
        alreadyLinked: entry.source === "candidate" && linkedIds.has(entry.id),
        archivedApplicationId: entry.source === "candidate" ? (archivedAppById.get(entry.id) ?? null) : null,
        candidateArchived: entry.source === "candidate" && entry.archived,
        title: entry.title,
        org: entry.org,
        years: entry.years,
        technologies: entry.technologies,
        included: result.data.score >= 60,
      });
    }
  }

  // Sort by score descending
  allEvaluated.sort((a, b) => b.score - a.score);
  const matches = allEvaluated.filter((m) => m.included);

  await db.insert(aiActivityLogs).values({
    actionType: "סריקת מועמדים למשרה",
    subjectType: "job",
    subjectId: jobId,
    subjectLabel: `${job.title} · ${job.client} — ${pool.length} נסרקו (מועמדים + עובדים)`,
    model: model || "unknown",
    inputTokens: totalInput,
    cachedInputTokens: 0,
    outputTokens: totalOutput,
    estimatedCostUsd: String(totalCost),
  });

  const [savedScan] = await db.insert(candidateScans).values({
    jobId,
    scanned: pool.length,
    resultsJson: allEvaluated,
  }).returning({ createdAt: candidateScans.createdAt });

  return Response.json({ results: matches, total: matches.length, scanned: pool.length, createdAt: savedScan?.createdAt ?? null });
}
