import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";
import { TEAM_MEETING_SUMMARY_INSTRUCTIONS } from "@/lib/ai/team-prompts";
import { getPrompt } from "@/lib/ai/get-prompt";

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
    action: "summarize" | "save";
    memberId: number;
    meetingId?: number;
    transcript?: string;
    summary?: string;
    actionItems?: string[];
    meetingDate?: string;
    memberName?: string;
  };

  const db = getDb();

  // ─── AI: summarize transcript ───────────────────────────────────────────────
  if (body.action === "summarize") {
    if (!isAiConfigured())
      return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (!body.transcript || body.transcript.trim().length < 30)
      return Response.json({ error: "יש להדביק תמלול של לפחות 30 תווים" }, { status: 400 });

    const result = await generateStructured<{ summary: string; action_items: string[]; insights: string }>({
      operation: "team_meeting_summary",
      instructions: await getPrompt("team_meeting_summary", TEAM_MEETING_SUMMARY_INSTRUCTIONS),
      input: `תמלול/הערות הפגישה:\n${body.transcript}`,
      schemaName: "meeting_summary",
      jsonSchema: meetingSummarySchema,
      reasoningEffort: "medium",
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
