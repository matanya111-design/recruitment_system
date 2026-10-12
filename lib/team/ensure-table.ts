import { getDb } from "@/db/client";
import { sql } from "drizzle-orm";

// team_members/team_meetings are dynamically migrated (not in the Drizzle schema) rather than via a
// normal migration file — this idempotent setup runs on demand from any route that touches them,
// same pattern this table has always used.
export async function ensureTeamMembersTable() {
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
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo_key TEXT`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo_content_type TEXT`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ`);
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
