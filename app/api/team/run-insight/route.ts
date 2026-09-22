/**
 * Single endpoint that runs full team member insight (job match + analysis),
 * saves to DB, and returns. Even if the client disconnects, server completes.
 */
import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

const jobMatchSchema = {
  type: "object", additionalProperties: false,
  required: ["matches", "analysis"],
  properties: {
    matches: { type: "array", items: { type: "object", additionalProperties: false, required: ["job_title","client","fit_score","reason"], properties: { job_title:{type:"string"}, client:{type:"string"}, fit_score:{type:"integer",minimum:0,maximum:100}, reason:{type:"string"} } } },
    analysis: { type: "string" },
  },
} as const;

const analyzeSchema = {
  type: "object", additionalProperties: false,
  required: ["strengths","gaps","growth_recommendation","next_steps"],
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    growth_recommendation: { type: "string" },
    next_steps: { type: "array", items: { type: "string" } },
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  if (!process.env.OPENAI_API_KEY)
    return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const { memberId } = (await request.json()) as { memberId: number };
  if (!memberId) return Response.json({ error: "חסר memberId" }, { status: 400 });

  const db = getDb();

  // Load member + meetings + jobs in parallel
  const [memberRow, meetingRows, jobRows] = await Promise.all([
    db.execute(sql`SELECT id, name, notes FROM team_members WHERE id=${memberId}`),
    db.execute(sql`SELECT summary, meeting_date FROM team_meetings WHERE member_id=${memberId} ORDER BY meeting_date DESC LIMIT 10`).catch(() => ({ rows: [] } as { rows: Record<string, unknown>[] })),
    db.execute(sql`SELECT id, title, client, technologies FROM jobs WHERE archived=false ORDER BY updated_at DESC LIMIT 20`),
  ]);

  const member = (memberRow as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!member) return Response.json({ error: "עובד לא נמצא" }, { status: 404 });

  const meetings = (meetingRows as unknown as { rows: Record<string, unknown>[] }).rows;
  const jobs = (jobRows as unknown as { rows: Record<string, unknown>[] }).rows;

  const allSummaries = meetings.map(m => `[${String(m.meeting_date ?? "").slice(0,10)}] ${m.summary}`).join("\n\n");
  const context = `${member.notes || ""}\n\nסיכומי פגישות:\n${allSummaries || "אין עדיין"}`.trim();
  const jobsList = jobs.map(j => `- ${j.title} ב-${j.client}`).join("\n");

  // Run both AI operations in parallel on the server
  const [matchResult, analyzeResult] = await Promise.all([
    generateStructured<{ matches: Array<{job_title:string;client:string;fit_score:number;reason:string}>; analysis: string }>({
      operation: "team_job_match",
      instructions: `אתה מסייע לחיפוש משרות מתאימות לעובד בחברה, על סמך פרופיל ופגישות 1:1. העבר עד 3 משרות המתאימות ביותר עם ציון התאמה (0-100) והסבר קצר. ב-analysis כתוב תובנה על הפרופיל המקצועי ביחס למשרות. אם אין התאמה טובה — אמור זאת ישירות.`,
      input: `עובד: ${member.name}\n\nפרופיל וסיכומי פגישות:\n${context}\n\nמשרות פעילות:\n${jobsList}`,
      schemaName: "team_job_match",
      jsonSchema: jobMatchSchema,
      reasoningEffort: "low",
    }),
    generateStructured<{ strengths: string[]; gaps: string[]; growth_recommendation: string; next_steps: string[] }>({
      operation: "team_member_analysis",
      instructions: `אתה מסייע למנהל לנתח עובד בצוות על סמך פגישות 1:1. צור ניתוח מעשי: חוזקות, פערים/אתגרים, המלצת קידום מקצועי, וצעדים הבאים. עברית טבעית.`,
      input: `עובד: ${member.name}\n\nפרופיל וסיכומי פגישות:\n${context}`,
      schemaName: "member_analysis",
      jsonSchema: analyzeSchema,
      reasoningEffort: "low",
    }),
  ]);

  const insight = {
    matches: matchResult.data.matches,
    analysis: matchResult.data.analysis,
    strengths: analyzeResult.data.strengths,
    gaps: analyzeResult.data.gaps,
    growth_recommendation: analyzeResult.data.growth_recommendation,
    next_steps: analyzeResult.data.next_steps,
  };

  // Save to DB regardless of client state
  await db.execute(sql`UPDATE team_members SET ai_insight=${JSON.stringify(insight)}, ai_insight_updated_at=NOW() WHERE id=${memberId}`);

  const totalCost = estimateCost(matchResult.model, {
    input: matchResult.usage.input + analyzeResult.usage.input,
    cached: matchResult.usage.cached + analyzeResult.usage.cached,
    output: matchResult.usage.output + analyzeResult.usage.output,
  });
  await db.insert(aiActivityLogs).values({
    actionType: "סקירת AI — התאמת משרות + ניתוח עובד",
    subjectType: "team_member",
    subjectId: memberId,
    subjectLabel: String(member.name),
    model: matchResult.model,
    inputTokens: matchResult.usage.input + analyzeResult.usage.input,
    cachedInputTokens: matchResult.usage.cached + analyzeResult.usage.cached,
    outputTokens: matchResult.usage.output + analyzeResult.usage.output,
    estimatedCostUsd: String(totalCost),
  });

  return Response.json({ insight });
}
