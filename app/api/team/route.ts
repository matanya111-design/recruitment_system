import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { sql } from "drizzle-orm";

async function ensureTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      target_job_ids JSONB NOT NULL DEFAULT '[]',
      actions JSONB NOT NULL DEFAULT '[]',
      ai_insight JSONB,
      ai_insight_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add columns to existing tables if missing
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS ai_insight JSONB`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS ai_insight_updated_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS client TEXT NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS naya_start_date DATE`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS next_step_summary TEXT NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT ''`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_meetings (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      meeting_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_transcript TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      action_items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const db = getDb();
  // last_meeting_date is computed, not stored — it's derived from team_meetings so it can't drift
  // out of sync with the actual timeline.
  const rows = await db.execute(sql`
    SELECT tm.id, tm.name, tm.notes, tm.target_job_ids, tm.actions, tm.ai_insight, tm.ai_insight_updated_at,
           tm.role, tm.client, tm.naya_start_date, tm.next_step_summary, tm.created_at,
           lm.last_meeting_date
    FROM team_members tm
    LEFT JOIN (SELECT member_id, MAX(meeting_date) last_meeting_date FROM team_meetings GROUP BY member_id) lm ON lm.member_id = tm.id
    ORDER BY tm.name
  `);
  const members = (rows as unknown as { rows: Record<string, unknown>[] }).rows.map(r => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    targetJobIds: r.target_job_ids as number[],
    actions: r.actions as string[],
    aiInsight: r.ai_insight ?? null,
    aiInsightUpdatedAt: r.ai_insight_updated_at ?? null,
    role: r.role ?? "",
    client: r.client ?? "",
    nayaStartDate: r.naya_start_date ?? null,
    nextStepSummary: r.next_step_summary ?? "",
    lastMeetingDate: r.last_meeting_date ?? null,
    createdAt: r.created_at,
  }));
  return Response.json({ members });
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const body = (await request.json()) as {
    name: string; notes: string; targetJobIds: number[]; actions: string[];
    role?: string; client?: string; nayaStartDate?: string | null; nextStepSummary?: string;
  };
  if (!body.name?.trim()) return Response.json({ error: "שם חסר" }, { status: 400 });
  const db = getDb();
  await db.execute(sql`
    INSERT INTO team_members (name, notes, target_job_ids, actions, role, client, naya_start_date, next_step_summary)
    VALUES (${body.name.trim()}, ${body.notes ?? ""}, ${JSON.stringify(body.targetJobIds ?? [])}, ${JSON.stringify(body.actions ?? [])},
            ${body.role ?? ""}, ${body.client ?? ""}, ${body.nayaStartDate || null}, ${body.nextStepSummary ?? ""})
  `);
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const body = (await request.json()) as {
    id: number; name?: string; notes?: string; targetJobIds?: number[]; actions?: string[]; aiInsight?: unknown;
    role?: string; client?: string; nayaStartDate?: string | null; nextStepSummary?: string;
  };
  if (!body.id) return Response.json({ error: "חסר id" }, { status: 400 });
  const db = getDb();
  if (body.aiInsight !== undefined) {
    // Dedicated insight save — only update ai_insight fields
    await db.execute(sql`UPDATE team_members SET ai_insight=${JSON.stringify(body.aiInsight)}, ai_insight_updated_at=NOW() WHERE id=${body.id}`);
  } else {
    await db.execute(sql`
      UPDATE team_members SET name=${body.name ?? ""}, notes=${body.notes ?? ""}, target_job_ids=${JSON.stringify(body.targetJobIds ?? [])}, actions=${JSON.stringify(body.actions ?? [])},
        role=${body.role ?? ""}, client=${body.client ?? ""}, naya_start_date=${body.nayaStartDate || null}, next_step_summary=${body.nextStepSummary ?? ""},
        updated_at=NOW()
      WHERE id=${body.id}
    `);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const body = (await request.json()) as { id: number; meetingId?: number };
  const db = getDb();
  if (body.meetingId) {
    await db.execute(sql`DELETE FROM team_meetings WHERE id=${body.meetingId}`);
    return Response.json({ ok: true });
  }
  if (!body.id) return Response.json({ error: "חסר id" }, { status: 400 });
  await db.execute(sql`DELETE FROM team_members WHERE id=${body.id}`);
  return Response.json({ ok: true });
}


