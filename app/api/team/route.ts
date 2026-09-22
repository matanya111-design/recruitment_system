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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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
  const rows = await db.execute(sql`SELECT id, name, notes, target_job_ids, actions, created_at FROM team_members ORDER BY name`);
  const members = (rows as unknown as { rows: Record<string, unknown>[] }).rows.map(r => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    targetJobIds: r.target_job_ids as number[],
    actions: r.actions as string[],
    createdAt: r.created_at,
  }));
  return Response.json({ members });
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const body = (await request.json()) as { name: string; notes: string; targetJobIds: number[]; actions: string[] };
  if (!body.name?.trim()) return Response.json({ error: "שם חסר" }, { status: 400 });
  const db = getDb();
  await db.execute(sql`
    INSERT INTO team_members (name, notes, target_job_ids, actions)
    VALUES (${body.name.trim()}, ${body.notes ?? ""}, ${JSON.stringify(body.targetJobIds ?? [])}, ${JSON.stringify(body.actions ?? [])})
  `);
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  await ensureTable();
  const body = (await request.json()) as { id: number; name: string; notes: string; targetJobIds: number[]; actions: string[] };
  if (!body.id) return Response.json({ error: "חסר id" }, { status: 400 });
  const db = getDb();
  await db.execute(sql`
    UPDATE team_members SET name=${body.name}, notes=${body.notes ?? ""}, target_job_ids=${JSON.stringify(body.targetJobIds ?? [])}, actions=${JSON.stringify(body.actions ?? [])}, updated_at=NOW()
    WHERE id=${body.id}
  `);
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


