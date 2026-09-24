import path from "path";
import { readFileSync } from "fs";

// tsx doesn't auto-load .env.local
try {
  const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()]) process.env[key.trim()] = rest.join("=").trim();
  }
} catch { /* .env.local optional */ }

import { getDb } from "@/db/client";
import { generateStructured, isAiConfigured } from "@/lib/ai/provider";
import { TEAM_EXTRACT_PROFILE_INSTRUCTIONS } from "@/lib/ai/team-prompts";
import { sql } from "drizzle-orm";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes", "role", "client", "nayaStartDate", "nextStepSummary"],
  properties: {
    name: { type: "string" },
    notes: { type: "string" },
    role: { type: "string" },
    client: { type: "string" },
    nayaStartDate: { type: "string" },
    nextStepSummary: { type: "string" },
  },
} as const;

type Extracted = { name: string; notes: string; role: string; client: string; nayaStartDate: string; nextStepSummary: string };

async function main() {
  if (!isAiConfigured()) throw new Error("AI provider not configured");
  const db = getDb();
  const rows = await db.execute(sql`SELECT id, name, notes FROM team_members ORDER BY name`);
  const members = (rows as unknown as { rows: Array<{ id: number; name: string; notes: string }> }).rows;

  for (const m of members) {
    if (!m.notes?.trim()) {
      console.log(`- ${m.name}: אין הערות, מדלג`);
      continue;
    }
    try {
      const result = await generateStructured<Extracted>({
        operation: "team_extract_profile_backfill",
        instructions: TEAM_EXTRACT_PROFILE_INSTRUCTIONS,
        input: `שם: ${m.name}\n\nפרופיל קיים (רק חלץ ממנו את השדות המבוקשים, אל תשנה אותו):\n${m.notes}`,
        schemaName: "team_profile_extraction",
        jsonSchema: schema,
        reasoningEffort: "medium",
      });
      const d = result.data;
      await db.execute(sql`
        UPDATE team_members
        SET role=${d.role || ""}, client=${d.client || ""}, naya_start_date=${d.nayaStartDate || null}, next_step_summary=${d.nextStepSummary || ""}
        WHERE id=${m.id}
      `);
      console.log(`✓ ${m.name}: role="${d.role || "-"}" client="${d.client || "-"}" start="${d.nayaStartDate || "-"}" next="${d.nextStepSummary || "-"}"`);
    } catch (err) {
      console.error(`✗ ${m.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
