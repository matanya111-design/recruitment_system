import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

const meetingSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "action_items", "insights"],
  properties: {
    summary: { type: "string" },
    action_items: { type: "array", items: { type: "string" } },
    insights: { type: "string" },
  },
} as const;

const jobMatchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "analysis"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["job_title", "client", "fit_score", "reason"],
        properties: {
          job_title: { type: "string" },
          client: { type: "string" },
          fit_score: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
        },
      },
    },
    analysis: { type: "string" },
  },
} as const;

async function ensureTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_meetings (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL,
      meeting_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_transcript TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      action_items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const url = new URL(request.url);
  const memberId = Number(url.searchParams.get("memberId"));
  if (!memberId) return Response.json({ error: "חסר memberId" }, { status: 400 });
  const db = getDb();
  const result = await db.execute(sql`SELECT id, member_id, meeting_date, summary, action_items, created_at FROM team_meetings WHERE member_id=${memberId} ORDER BY meeting_date DESC`);
  const meetings = (result as unknown as { rows: Record<string, unknown>[] }).rows.map(r => ({
    id: r.id, memberId: r.member_id, meetingDate: r.meeting_date,
    summary: r.summary, actionItems: r.action_items as string[], createdAt: r.created_at,
  }));
  return Response.json({ meetings });
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();

  const body = (await request.json()) as {
    action: "summarize" | "save" | "match-jobs" | "analyze";
    memberId: number;
    meetingId?: number;
    transcript?: string;
    summary?: string;
    actionItems?: string[];
    meetingDate?: string;
    memberName?: string;
    memberNotes?: string;
    jobs?: Array<{ id: number; title: string; client: string; description?: string; technologies?: string[] }>;
  };

  const db = getDb();

  // ─── AI: summarize transcript ───────────────────────────────────────────────
  if (body.action === "summarize") {
    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (!body.transcript || body.transcript.trim().length < 30)
      return Response.json({ error: "יש להדביק תמלול של לפחות 30 תווים" }, { status: 400 });

    const result = await generateStructured<{ summary: string; action_items: string[]; insights: string }>({
      operation: "team_meeting_summary",
      instructions: `אתה מסייע לניהול שיחות אחד על אחד עם עובדים. בהינתן תמלול או הערות מפגישה, צור:
- summary: סיכום תמציתי של הפגישה — מה עלה, איפה העובד, תחושות, יעדים. עברית טבעית, פסקאות קצרות.
- action_items: רשימת משימות קונקרטיות שעלו מהפגישה (כל פריט = פעולה ספציפית).
- insights: תובנות על העובד — חוזקות, אתגרים, מוטיבציה, כיוון מקצועי. 2-3 משפטים.`,
      input: `תמלול/הערות הפגישה:\n${body.transcript}`,
      schemaName: "meeting_summary",
      jsonSchema: meetingSummarySchema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "סיכום פגישת צוות",
      subjectType: "team_member",
      subjectLabel: body.memberName ?? "עובד",
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ draft: result.data });
  }

  // ─── Save meeting to DB ───────────────────────────────────────────────────
  if (body.action === "save") {
    if (!body.memberId) return Response.json({ error: "חסר memberId" }, { status: 400 });
    const date = body.meetingDate ? new Date(body.meetingDate) : new Date();
    await db.execute(sql`
      INSERT INTO team_meetings (member_id, meeting_date, raw_transcript, summary, action_items)
      VALUES (${body.memberId}, ${date}, ${body.transcript ?? ""}, ${body.summary ?? ""}, ${JSON.stringify(body.actionItems ?? [])})
    `);
    return Response.json({ ok: true }, { status: 201 });
  }

  // ─── AI: match jobs ───────────────────────────────────────────────────────
  if (body.action === "match-jobs") {
    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (!body.jobs?.length)
      return Response.json({ error: "אין משרות במאגר" }, { status: 400 });

    const jobsList = body.jobs.map(j => `- ${j.title} ב-${j.client}${j.technologies?.length ? ` | טכנולוגיות: ${j.technologies.join(", ")}` : ""}`).join("\n");
    const input = `פרופיל העובד:\nשם: ${body.memberName}\n\nסיכום מצטבר מהפגישות:\n${body.memberNotes || "לא הוזן"}\n\nמשרות פעילות במאגר:\n${jobsList}`;

    const result = await generateStructured<{ matches: Array<{ job_title: string; client: string; fit_score: number; reason: string }>; analysis: string }>({
      operation: "team_job_match",
      instructions: `אתה מסייע לחיפוש משרות מתאימות לעובד בחברה, על סמך פרופיל ופגישות אישיות. 
העבר עד 3 משרות המתאימות ביותר עם ציון התאמה (0-100) והסבר קצר. 
ב-analysis כתוב תובנה על הפרופיל המקצועי של העובד ביחס למשרות שיש. 
אם אין התאמה טובה — אמור זאת ישירות.`,
      input,
      schemaName: "team_job_match",
      jsonSchema: jobMatchSchema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "התאמת משרות לעובד",
      subjectType: "team_member",
      subjectLabel: body.memberName ?? "עובד",
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ result: result.data });
  }

  // ─── AI: analyze member ───────────────────────────────────────────────────
  if (body.action === "analyze") {
    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const analyzeSchema = {
      type: "object", additionalProperties: false,
      required: ["strengths", "gaps", "growth_recommendation", "next_steps"],
      properties: {
        strengths: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
        growth_recommendation: { type: "string" },
        next_steps: { type: "array", items: { type: "string" } },
      },
    } as const;

    const result = await generateStructured<{ strengths: string[]; gaps: string[]; growth_recommendation: string; next_steps: string[] }>({
      operation: "team_member_analysis",
      instructions: `אתה מסייע למנהל לנתח עובד בצוות על סמך פגישות 1:1. 
צור ניתוח מעשי: חוזקות, פערים/אתגרים, המלצת קידום מקצועי, וצעדים הבאים. עברית טבעית.`,
      input: `עובד: ${body.memberName}\n\nסיכומי פגישות:\n${body.memberNotes || "אין סיכומים עדיין"}`,
      schemaName: "member_analysis",
      jsonSchema: analyzeSchema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "ניתוח פרופיל עובד",
      subjectType: "team_member",
      subjectLabel: body.memberName ?? "עובד",
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ analysis: result.data });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  const { meetingId } = (await request.json()) as { meetingId: number };
  if (!meetingId) return Response.json({ error: "חסר meetingId" }, { status: 400 });
  const db = getDb();
  await db.execute(sql`DELETE FROM team_meetings WHERE id=${meetingId}`);
  return Response.json({ ok: true });
}
