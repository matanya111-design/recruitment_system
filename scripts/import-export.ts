/**
 * Import a full JSON export from tech-candidate-manager into the local DB.
 * Usage: tsx scripts/import-export.ts <path-to-json>
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "fs";
import path from "path";

// Load .env.local
try {
  const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()])
      process.env[key.trim()] = rest.join("=").trim();
  }
} catch { /* optional */ }

const jsonPath = process.argv[2];
if (!jsonPath) { console.error("Usage: tsx scripts/import-export.ts <path-to-json>"); process.exit(1); }

const exportData = JSON.parse(readFileSync(jsonPath, "utf8")) as {
  tables: {
    jobs: Record<string, unknown>[];
    candidates: Record<string, unknown>[];
    applications: Record<string, unknown>[];
    ai_activity_logs?: Record<string, unknown>[];
    ai_instructions?: Record<string, unknown>[];
    app_users?: Record<string, unknown>[];
    evaluation_rules?: Record<string, unknown>[];
  };
};

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  try { return new Date(String(v).replace(" ", "T") + (String(v).includes("T") ? "" : "Z")); }
  catch { return null; }
}

function parseTech(v: unknown): unknown {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(String(v || "[]")); } catch { return []; }
}

async function q(pool: Pool, args: { sql: string; params: unknown[] }) {
  return pool.query(args.sql, args.params);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  const { jobs, candidates, applications, ai_activity_logs, ai_instructions, app_users, evaluation_rules } = exportData.tables;

  let imported = { jobs: 0, candidates: 0, applications: 0, logs: 0, instructions: 0, users: 0, rules: 0 };
  let skipped = { jobs: 0, candidates: 0, applications: 0, logs: 0, instructions: 0, users: 0, rules: 0 };

  // ── Jobs ──────────────────────────────────────────────────────────────────
  for (const j of jobs ?? []) {
    try {
      await q(pool, {
        sql: `INSERT INTO jobs (id,title,client,status,description,must_requirements,preferred_requirements,technologies,min_years,professional_emphasis,personality_emphasis,internal_notes,archived,created_at,updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
              ON CONFLICT (id) DO NOTHING`,
        params: [
          j.id, j.title, j.client, j.status ?? "פעילה",
          j.description ?? "", j.must_requirements ?? "", j.preferred_requirements ?? "",
          JSON.stringify(parseTech(j.technologies)),
          j.min_years ?? null,
          j.professional_emphasis ?? "", j.personality_emphasis ?? "", j.internal_notes ?? "",
          Boolean(j.archived),
          parseDate(j.created_at) ?? new Date(),
          parseDate(j.updated_at) ?? new Date(),
        ],
      });
      imported.jobs++;
    } catch (e) { console.warn(`Skipped job ${j.id}: ${(e as Error).message}`); skipped.jobs++; }
  }

  // ── Candidates ────────────────────────────────────────────────────────────
  for (const c of candidates ?? []) {
    try {
      await q(pool, {
        sql: `INSERT INTO candidates (id,full_name,phone,email,linkedin_url,professional_title,company,years_experience,technologies,experience_summary,recruiter_opinion,cv_key,cv_filename,cv_content_type,cv_size,cv_pages,cv_extracted_text,cv_extraction_status,cv_uploaded_at,archived,created_at,updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
              ON CONFLICT (id) DO NOTHING`,
        params: [
          c.id, c.full_name, c.phone ?? "", c.email ?? "", c.linkedin_url ?? "",
          c.professional_title ?? "", c.company ?? "",
          c.years_experience ?? null,
          JSON.stringify(parseTech(c.technologies)),
          c.experience_summary ?? "", c.recruiter_opinion ?? "",
          c.cv_key ?? null, c.cv_filename ?? null, c.cv_content_type ?? null,
          c.cv_size ?? null, c.cv_pages ?? null,
          c.cv_extracted_text ?? "", c.cv_extraction_status ?? "לא הועלה",
          parseDate(c.cv_uploaded_at),
          Boolean(c.archived),
          parseDate(c.created_at) ?? new Date(),
          parseDate(c.updated_at) ?? new Date(),
        ],
      });
      imported.candidates++;
    } catch (e) { console.warn(`Skipped candidate ${c.id}: ${(e as Error).message}`); skipped.candidates++; }
  }

  // ── Applications ──────────────────────────────────────────────────────────
  for (const a of applications ?? []) {
    try {
      // Parse evaluation_json if it's a string
      let evalJson = a.evaluation_json;
      if (typeof evalJson === "string") {
        try { evalJson = JSON.parse(evalJson); } catch { evalJson = null; }
      }
      await q(pool, {
        sql: `INSERT INTO applications (id,candidate_id,job_id,status,interview_date,interview_summary,next_action,next_action_date,score,recommendation,evaluation_type,evaluation_date,evaluation_json,evaluation_feedback,proposed_engine_rule,engine_rule_status,archived,created_at,updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
              ON CONFLICT (id) DO NOTHING`,
        params: [
          a.id, a.candidate_id, a.job_id,
          a.status ?? "חדש",
          parseDate(a.interview_date),
          a.interview_summary ?? "", a.next_action ?? "",
          a.next_action_date ? String(a.next_action_date).split("T")[0] : null,
          a.score ?? null, a.recommendation ?? "טרם הוערך",
          a.evaluation_type ?? "ראשונית",
          parseDate(a.evaluation_date),
          evalJson ? JSON.stringify(evalJson) : null,
          a.evaluation_feedback ?? "", a.proposed_engine_rule ?? "",
          a.engine_rule_status ?? "ללא הצעה",
          Boolean(a.archived),
          parseDate(a.created_at) ?? new Date(),
          parseDate(a.updated_at) ?? new Date(),
        ],
      });
      imported.applications++;
    } catch (e) { console.warn(`Skipped application ${a.id}: ${(e as Error).message}`); skipped.applications++; }
  }

  // Fix sequences after explicit ID inserts
  await q(pool, { sql: `SELECT setval('jobs_id_seq', COALESCE((SELECT MAX(id) FROM jobs), 1))`, params: [] });
  await q(pool, { sql: `SELECT setval('candidates_id_seq', COALESCE((SELECT MAX(id) FROM candidates), 1))`, params: [] });
  await q(pool, { sql: `SELECT setval('applications_id_seq', COALESCE((SELECT MAX(id) FROM applications), 1))`, params: [] });

  // ── AI Activity Logs ──────────────────────────────────────────────────────
  for (const l of ai_activity_logs ?? []) {
    try {
      await q(pool, {
        sql: `INSERT INTO ai_activity_logs (id,action_type,subject_type,subject_id,subject_label,model,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,created_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        params: [
          l.id, l.action_type, l.subject_type ?? "", l.subject_id ?? null,
          l.subject_label ?? "", l.model,
          Number(l.input_tokens ?? 0), Number(l.cached_input_tokens ?? 0),
          Number(l.output_tokens ?? 0), String(l.estimated_cost_usd ?? "0"),
          parseDate(l.created_at) ?? new Date(),
        ],
      });
      imported.logs++;
    } catch { skipped.logs++; }
  }
  if ((ai_activity_logs ?? []).length > 0)
    await q(pool, { sql: `SELECT setval('ai_activity_logs_id_seq', COALESCE((SELECT MAX(id) FROM ai_activity_logs), 1))`, params: [] });

  // ── AI Instructions (custom only) ─────────────────────────────────────────
  for (const inst of ai_instructions ?? []) {
    if (!inst.is_custom) continue; // skip defaults — bootstrap handles those
    try {
      await q(pool, {
        sql: `INSERT INTO ai_instructions (key,title,description,content,is_custom,updated_at)
              VALUES ($1,$2,$3,$4,$5,$6)
              ON CONFLICT (key) DO UPDATE SET content=$4, is_custom=$5, updated_at=$6`,
        params: [inst.key, inst.title, inst.description, inst.content, true, parseDate(inst.updated_at) ?? new Date()],
      });
      imported.instructions++;
    } catch { skipped.instructions++; }
  }

  // ── App Users ─────────────────────────────────────────────────────────────
  for (const u of app_users ?? []) {
    try {
      await q(pool, {
        sql: `INSERT INTO app_users (email,role,created_at,updated_at)
              VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
        params: [String(u.email).toLowerCase().trim(), u.role ?? "user", parseDate(u.created_at) ?? new Date(), parseDate(u.updated_at) ?? new Date()],
      });
      imported.users++;
    } catch { skipped.users++; }
  }

  // ── Evaluation Rules ──────────────────────────────────────────────────────
  for (const r of evaluation_rules ?? []) {
    try {
      await q(pool, {
        sql: `INSERT INTO evaluation_rules (id,rule_text,source_application_id,active,created_at)
              VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        params: [r.id, r.rule_text, r.source_application_id ?? null, Boolean(r.active ?? true), parseDate(r.created_at) ?? new Date()],
      });
      imported.rules++;
    } catch { skipped.rules++; }
  }

  console.log("\n✅ Import complete:");
  console.log(`  Jobs:         ${imported.jobs} imported, ${skipped.jobs} skipped`);
  console.log(`  Candidates:   ${imported.candidates} imported, ${skipped.candidates} skipped`);
  console.log(`  Applications: ${imported.applications} imported, ${skipped.applications} skipped`);
  console.log(`  AI Logs:      ${imported.logs} imported, ${skipped.logs} skipped`);
  console.log(`  Instructions: ${imported.instructions} imported (custom only), ${skipped.instructions} skipped`);
  console.log(`  Users:        ${imported.users} imported, ${skipped.users} skipped`);
  console.log(`  Rules:        ${imported.rules} imported, ${skipped.rules} skipped`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
