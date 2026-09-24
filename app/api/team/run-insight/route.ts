/**
 * Single endpoint that runs full team member insight (job match + analysis) in one AI call,
 * saves to DB, and returns. Even if the client disconnects, server completes.
 */
import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";
import { TEAM_INSIGHT_INSTRUCTIONS } from "@/lib/ai/team-prompts";
import { getPrompt } from "@/lib/ai/get-prompt";

const insightSchema = {
  type: "object", additionalProperties: false,
  required: ["matches", "analysis", "strengths", "gaps", "growth_recommendation", "next_steps"],
  properties: {
    matches: { type: "array", items: { type: "object", additionalProperties: false, required: ["job_title","client","fit_score","reason"], properties: { job_title:{type:"string"}, client:{type:"string"}, fit_score:{type:"integer"}, reason:{type:"string"} } } },
    analysis: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    growth_recommendation: { type: "string" },
    next_steps: { type: "array", items: { type: "string" } },
  },
} as const;

type InsightResult = {
  matches: Array<{ job_title: string; client: string; fit_score: number; reason: string }>;
  analysis: string;
  strengths: string[];
  gaps: string[];
  growth_recommendation: string;
  next_steps: string[];
};

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  if (!isAiConfigured())
    return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const { memberId } = (await request.json()) as { memberId: number };
  if (!memberId) return Response.json({ error: "חסר memberId" }, { status: 400 });

  const db = getDb();

  type QR = { rows: Record<string, unknown>[] };
  const toRows = (r: unknown): Record<string, unknown>[] => {
    try { return (r as QR).rows ?? []; } catch { return []; }
  };

  // Ensure team_meetings exists before querying it
  await db.execute(sql`CREATE TABLE IF NOT EXISTS team_meetings (id BIGSERIAL PRIMARY KEY, member_id BIGINT NOT NULL, meeting_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), raw_transcript TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', action_items JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  const [memberRow, meetingRows, jobRows] = await Promise.all([
    db.execute(sql`SELECT id, name, notes FROM team_members WHERE id=${memberId}`),
    db.execute(sql`SELECT summary, meeting_date FROM team_meetings WHERE member_id=${memberId} ORDER BY meeting_date DESC LIMIT 10`).catch(() => ({ rows: [] })),
    db.execute(sql`SELECT id, title, client, technologies FROM jobs WHERE archived=false ORDER BY updated_at DESC LIMIT 20`),
  ]);

  const member = toRows(memberRow)[0];
  if (!member) return Response.json({ error: "עובד לא נמצא" }, { status: 404 });

  const meetings = toRows(meetingRows);
  const jobs = toRows(jobRows);

  const allSummaries = meetings.map(m => `[${String(m.meeting_date ?? "").slice(0,10)}] ${m.summary}`).join("\n\n");
  const context = `${member.notes || ""}\n\nסיכומי פגישות:\n${allSummaries || "אין עדיין"}`.trim();
  const jobsList = jobs.map(j => `- ${j.title} ב-${j.client}`).join("\n");

  try {
    const instructions = await getPrompt("team_insight", TEAM_INSIGHT_INSTRUCTIONS);

    const result = await generateStructured<InsightResult>({
      operation: "team_insight",
      instructions,
      input: `עובד: ${member.name}\n\nפרופיל וסיכומי פגישות:\n${context}\n\nמשרות פעילות:\n${jobsList}`,
      schemaName: "team_insight",
      jsonSchema: insightSchema,
      reasoningEffort: "medium",
    });

    const insight = result.data;

    // Save to DB regardless of client state
    await db.execute(sql`UPDATE team_members SET ai_insight=${JSON.stringify(insight)}, ai_insight_updated_at=NOW() WHERE id=${memberId}`);

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "סקירת AI — התאמת משרות + ניתוח עובד",
      subjectType: "team_member",
      subjectId: memberId,
      subjectLabel: String(member.name),
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ insight });
  } catch (err) {
    console.error("run-insight error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "שגיאה בניתוח AI" }, { status: 500 });
  }
}
