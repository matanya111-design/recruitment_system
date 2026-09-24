import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { aiActivityLogs, candidates, applications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const profileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["professionalTitle", "company", "yearsExperience", "technologies", "experienceSummary", "recruiterOpinion"],
  properties: {
    professionalTitle: { type: "string" },
    company: { type: "string" },
    yearsExperience: { type: "integer" },
    technologies: { type: "array", items: { type: "string" } },
    experienceSummary: { type: "string" },
    recruiterOpinion: { type: "string" },
  },
} as const;

type ProfileResult = {
  professionalTitle: string;
  company: string;
  yearsExperience: number;
  technologies: string[];
  experienceSummary: string;
  recruiterOpinion: string;
};

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
  const { memberId, jobIds } = (await request.json()) as { memberId?: number; jobIds?: number[] };
  if (!memberId) return Response.json({ error: "חסר מזהה עובד" }, { status: 400 });
  if (!jobIds?.length) return Response.json({ error: "יש לבחור לפחות משרה אחת" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const db = getDb();

  // Load member + all their meetings
  const memberRows = await db.execute(sql`SELECT id, name, notes FROM team_members WHERE id=${memberId}`);
  const member = (memberRows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (!member) return Response.json({ error: "עובד לא נמצא" }, { status: 404 });

  const meetingRows = await db.execute(sql`
    SELECT summary, action_items FROM team_meetings WHERE member_id=${memberId} ORDER BY meeting_date DESC LIMIT 10
  `);
  const meetings = (meetingRows as unknown as { rows: Array<{ summary: string; action_items: unknown }> }).rows;

  const meetingSummaries = meetings.length
    ? meetings.map((m, i) => `פגישה ${i + 1}:\n${m.summary}`).join("\n\n")
    : "אין פגישות מתועדות.";

  // AI: build structured candidate profile from member knowledge
  const instructions = `אתה מסייע לבנות כרטיס מועמד מתוך מידע על עובד קיים בצוות.
חלץ פרטים מקצועיים מהפרופיל ומסיכומי הפגישות.
- professionalTitle: התפקיד הנוכחי של העובד.
- company: "עובד פנימי" (אם לא צוין אחרת).
- yearsExperience: שנות ניסיון רלוונטיות — הסק לפי המידע הזמין.
- technologies: טכנולוגיות שמוזכרות בפועל.
- experienceSummary: תקציר קצר ומקצועי בעברית בגוף שלישי — מה העובד עושה, מה הוא טוב בו.
- recruiterOpinion: חוות דעת המגייס — מה מרשים, מה לבדוק, למה מתאים להגשה. כתוב בגוף ראשון בעברית.`;

  const input = `שם: ${member.name}\n\nפרופיל:\n${member.notes || "לא הוזן"}\n\nסיכומי פגישות:\n${meetingSummaries}`;

  const result = await generateStructured<ProfileResult>({
    operation: "team_promote_to_candidate",
    instructions,
    input,
    schemaName: "team_member_candidate_profile",
    jsonSchema: profileSchema,
    reasoningEffort: "medium",
  });

  const profile = result.data;

  // Check if this member already has a candidate record (by name exact match — best-effort)
  const existingRows = await db.execute(sql`
    SELECT id FROM candidates WHERE full_name=${String(member.name)} AND archived=false LIMIT 1
  `);
  const existingCandidate = (existingRows as unknown as { rows: Array<{ id: number }> }).rows[0];

  let candidateId: number;

  if (existingCandidate) {
    // Reuse existing candidate record — update recruiter opinion if empty
    candidateId = Number(existingCandidate.id);
    await db.execute(sql`
      UPDATE candidates SET
        professional_title = CASE WHEN professional_title='' THEN ${profile.professionalTitle} ELSE professional_title END,
        company = CASE WHEN company='' THEN ${profile.company} ELSE company END,
        years_experience = CASE WHEN years_experience IS NULL THEN ${profile.yearsExperience} ELSE years_experience END,
        technologies = CASE WHEN technologies='[]'::jsonb THEN ${JSON.stringify(profile.technologies)}::jsonb ELSE technologies END,
        experience_summary = CASE WHEN experience_summary='' THEN ${profile.experienceSummary} ELSE experience_summary END,
        recruiter_opinion = CASE WHEN recruiter_opinion='' THEN ${profile.recruiterOpinion} ELSE recruiter_opinion END,
        updated_at = NOW()
      WHERE id=${candidateId}
    `);
  } else {
    // Create new candidate
    const [newCand] = await db.insert(candidates).values({
      fullName: String(member.name),
      professionalTitle: profile.professionalTitle,
      company: profile.company,
      yearsExperience: profile.yearsExperience,
      technologies: profile.technologies,
      experienceSummary: profile.experienceSummary,
      recruiterOpinion: profile.recruiterOpinion,
      cvExtractionStatus: "לא הועלה",
    }).returning({ id: candidates.id });
    candidateId = newCand.id;
  }

  // Link to each job (skip if already linked)
  const results: Array<{ jobId: number; applicationId: number; action: "created" | "skipped" }> = [];
  for (const jobId of jobIds) {
    const [existing] = await db.select({ id: applications.id }).from(applications)
      .where(and(eq(applications.candidateId, candidateId), eq(applications.jobId, jobId)));
    if (existing) {
      results.push({ jobId, applicationId: existing.id, action: "skipped" });
      continue;
    }
    const [app] = await db.insert(applications).values({
      candidateId,
      jobId,
      status: "חדש",
      nextAction: "בדיקת התאמה למשרה",
    }).returning({ id: applications.id });
    results.push({ jobId, applicationId: app.id, action: "created" });
  }

  const cost = estimateCost(result.model, result.usage);
  await db.insert(aiActivityLogs).values({
    actionType: "קידום עובד כמועמד",
    subjectType: "candidate",
    subjectId: candidateId,
    subjectLabel: `${member.name} · ${jobIds.length} משרות`,
    model: result.model,
    inputTokens: result.usage.input,
    cachedInputTokens: result.usage.cached,
    outputTokens: result.usage.output,
    estimatedCostUsd: String(cost),
  });

  return Response.json({ candidateId, results, profile });
  } catch (error) {
    console.error("promote-to-candidate error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "קידום המועמד נכשל" }, { status: 500 });
  }
}
