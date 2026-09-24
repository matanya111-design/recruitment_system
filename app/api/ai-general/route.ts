import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { GENERAL_AI_INSTRUCTIONS } from "@/lib/ai/prompts";
import { getPrompt } from "@/lib/ai/get-prompt";
import { getDb } from "@/db/client";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (r as { rows: Row[] }).rows;

// Every table in the system, not just jobs/candidates — the user explicitly asked for this tool to
// be able to answer literally anything about the backend (prompts, AI usage/cost, users, audit
// trail, team), not just the recruiting pipeline. Aggregates (COUNT/SUM) are always computed
// separately from the row lists, so "how many X" answers stay correct even where a list is capped
// for prompt size on a table that could grow large (activity/audit logs).
async function buildFullSystemContext(db: ReturnType<typeof getDb>): Promise<string> {
  const [jobRows, candRows, appRows, jobStatsRows, candStatsRows, appStatsRows] = await Promise.all([
    db.execute(sql`SELECT id, title, client, status, description, must_requirements, preferred_requirements, technologies, min_years, professional_emphasis, personality_emphasis, hiring_manager_emphasis, archived, created_at, updated_at FROM jobs ORDER BY updated_at DESC`),
    db.execute(sql`SELECT id, full_name, professional_title, company, years_experience, technologies, experience_summary, recruiter_opinion, cv_extraction_status, archived, created_at FROM candidates ORDER BY updated_at DESC`),
    db.execute(sql`
      SELECT a.id, c.full_name, j.title job_title, j.client, a.status,
             (LENGTH(a.interview_summary)>0) has_interview_summary,
             a.recommendation, a.evaluation_type, a.evaluation_date,
             a.pre_recommendation, a.pre_human_decision, a.pre_human_decision_date,
             a.pre_evaluation_json->>'ai_recommendation' pre_ai_recommendation,
             a.post_recommendation, a.post_human_decision, a.post_human_decision_date,
             a.post_evaluation_json->>'ai_recommendation' post_ai_recommendation,
             a.next_action, a.proposed_engine_rule, a.engine_rule_status, a.archived, a.updated_at
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      ORDER BY a.updated_at DESC
    `),
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE archived=false)::int active, COUNT(*) FILTER (WHERE archived=true)::int archived FROM jobs`),
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE archived=false)::int active, COUNT(*) FILTER (WHERE archived=true)::int archived FROM candidates`),
    db.execute(sql`SELECT COUNT(*) FILTER (WHERE archived=false)::int active, COUNT(*) FILTER (WHERE archived=true)::int archived FROM applications`),
  ]);

  // team_members/team_meetings are created lazily on first use of "ניהול צוות" — may not exist yet.
  let teamData: Row[] = [];
  let meetingData: Row[] = [];
  try {
    const [teamRows, meetingRows] = await Promise.all([
      db.execute(sql`SELECT id, name, notes, role, client, naya_start_date, next_step_summary, target_job_ids, ai_insight, ai_insight_updated_at, created_at FROM team_members ORDER BY name`),
      db.execute(sql`SELECT tm.member_id, m.name member_name, tm.meeting_date, tm.summary, tm.action_items FROM team_meetings tm JOIN team_members m ON m.id=tm.member_id ORDER BY tm.meeting_date DESC LIMIT 300`),
    ]);
    teamData = rowsOf(teamRows);
    meetingData = rowsOf(meetingRows);
  } catch { /* tables may not exist yet */ }

  const [instRows, activityStatsRows, activityByModelRows, recentActivityRows, userRows, auditStatsRows, recentAuditRows] = await Promise.all([
    db.execute(sql`SELECT key, title, description, content, is_custom, updated_at FROM ai_instructions ORDER BY key`),
    db.execute(sql`SELECT COUNT(*)::int total, COALESCE(SUM(estimated_cost_usd),0)::float total_cost, COALESCE(SUM(input_tokens+output_tokens),0)::bigint total_tokens FROM ai_activity_logs`),
    db.execute(sql`SELECT model, COUNT(*)::int count, COALESCE(SUM(estimated_cost_usd),0)::float cost FROM ai_activity_logs GROUP BY model ORDER BY count DESC`),
    db.execute(sql`SELECT action_type, subject_label, model, estimated_cost_usd, created_at FROM ai_activity_logs ORDER BY created_at DESC LIMIT 50`),
    db.execute(sql`SELECT email, role, created_at FROM app_users ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END, email`),
    db.execute(sql`SELECT COUNT(*)::int total FROM audit_logs`),
    db.execute(sql`SELECT actor_email, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50`),
  ]);

  const jobsData = rowsOf(jobRows), candsData = rowsOf(candRows), appsData = rowsOf(appRows);
  const jobStats = rowsOf(jobStatsRows)[0] as { active: number; archived: number };
  const candStats = rowsOf(candStatsRows)[0] as { active: number; archived: number };
  const appStats = rowsOf(appStatsRows)[0] as { active: number; archived: number };
  const instData = rowsOf(instRows);
  const activityStats = rowsOf(activityStatsRows)[0] as { total: number; total_cost: number; total_tokens: number };
  const activityByModel = rowsOf(activityByModelRows);
  const recentActivity = rowsOf(recentActivityRows);
  const usersData = rowsOf(userRows);
  const auditTotal = (rowsOf(auditStatsRows)[0] as { total: number }).total;
  const recentAudit = rowsOf(recentAuditRows);

  return `נתוני מערכת מלאים — כל הטבלאות:

=== משרות === (סה"כ פעילות: ${jobStats.active}, בארכיון: ${jobStats.archived})
${jobsData.map(j=>`- [#${j.id}]${j.archived?" (בארכיון)":""} ${j.title} · ${j.client} · סטטוס: ${j.status} · דרישות חובה: ${String(j.must_requirements||"").slice(0,150)} · טכנולוגיות: ${j.technologies}${j.hiring_manager_emphasis?` · דגשי מנהל מגייס: ${j.hiring_manager_emphasis}`:""}`).join("\n") || "(אין משרות)"}

=== מועמדים (כרטיסים) === (סה"כ פעילים: ${candStats.active}, בארכיון: ${candStats.archived})
${candsData.map(c=>`- [#${c.id}]${c.archived?" (בארכיון)":""} ${c.full_name} · ${c.professional_title||"תפקיד לא ידוע"} · ${c.company||""} · ${c.years_experience??"?"} שנות ניסיון · טכנולוגיות: ${c.technologies} · חילוץ קו"ח: ${c.cv_extraction_status}`).join("\n") || "(אין מועמדים)"}

=== מועמדויות (שיוך מועמד↔משרה) === (סה"כ פעילות: ${appStats.active}, בארכיון: ${appStats.archived})
${appsData.map(a=>`- [#${a.id}]${a.archived?" (בארכיון)":""} ${a.full_name} ← ${a.job_title} (${a.client}) · סטטוס: ${a.status} · המלצה נוכחית: ${a.recommendation||"טרם הוערך"} · סיכום ראיון: ${a.has_interview_summary?"יש":"אין"} · לפני ראיון - המלצת AI: ${a.pre_ai_recommendation??"-"} / החלטת מגייס: ${a.pre_human_decision||"-"} · אחרי ראיון - המלצת AI: ${a.post_ai_recommendation??"-"} / החלטת מגייס: ${a.post_human_decision||"-"} · פעולה הבאה: ${a.next_action||"-"}${a.engine_rule_status && a.engine_rule_status!=="ללא הצעה"?` · כלל שנלמד: ${a.engine_rule_status}`:""}`).join("\n") || "(אין מועמדויות)"}

=== צוות פנימי (עובדי NAYA, נפרד לגמרי ממועמדים) === (סה"כ עובדים: ${teamData.length}, מתוכם עם סקירת AI שהופקה: ${teamData.filter(t=>t.ai_insight_updated_at).length})
${teamData.map(t => {
  const insight = t.ai_insight as { matches?: unknown[]; strengths?: string[]; gaps?: string[]; growth_recommendation?: string } | null;
  return `- [#${t.id}] ${t.name}${t.role?` (${t.role})`:""}${t.client?` · אצל ${t.client}`:""}${t.naya_start_date?` · הצטרף לנאיה: ${t.naya_start_date}`:""}${t.next_step_summary?` · להמשך: ${t.next_step_summary}`:""} · סקירת AI: ${t.ai_insight_updated_at ? `בוצעה — ${insight?.matches?.length ?? 0} התאמות משרה, המלצת קידום: ${insight?.growth_recommendation||"-"}` : "טרם בוצעה"}`;
}).join("\n") || "(אין עובדים רשומים)"}

=== פגישות 1:1 עם עובדי צוות === (מוצגות עד 300 האחרונות)
${meetingData.map(m=>`- ${m.member_name} · ${new Date(String(m.meeting_date)).toLocaleDateString("he-IL")} · ${String(m.summary||"").slice(0,200)}`).join("\n") || "(אין פגישות רשומות)"}

=== פרומפטי AI (הוראות שמנחות כל פעולת AI במערכת, טאב "הוראות AI") === (סה"כ: ${instData.length})
${instData.map(i=>`- ${i.key} | "${i.title}" | ${i.description} | ${i.is_custom?"נערך ידנית":"ברירת מחדל"} | עודכן: ${new Date(String(i.updated_at)).toLocaleDateString("he-IL")}\n  תוכן מלא: ${String(i.content).replace(/\n+/g," ").slice(0,1200)}`).join("\n") || "(אין פרומפטים)"}

=== פעילות ועלויות AI === (סה"כ קריאות: ${activityStats.total}, עלות כוללת: $${activityStats.total_cost.toFixed(4)}, טוקנים: ${activityStats.total_tokens})
פילוח לפי מודל: ${activityByModel.map(m=>`${m.model}: ${m.count} קריאות, $${Number(m.cost).toFixed(4)}`).join(" · ") || "-"}
50 הפעולות האחרונות:
${recentActivity.map(a=>`- ${a.action_type} · ${a.subject_label} · ${a.model} · $${Number(a.estimated_cost_usd).toFixed(5)} · ${new Date(String(a.created_at)).toLocaleDateString("he-IL")}`).join("\n") || "(אין פעילות)"}

=== משתמשי המערכת (הרשאות גישה) === (סה"כ: ${usersData.length})
${usersData.map(u=>`- ${u.email} (${u.role})`).join("\n") || "(אין משתמשים)"}

=== יומן ביקורת (audit log) === (סה"כ רשומות: ${auditTotal}, מוצגות 50 האחרונות)
${recentAudit.map(a=>`- ${a.actor_email} · ${a.action} · ${a.entity_type}${a.entity_id?` #${a.entity_id}`:""} · ${new Date(String(a.created_at)).toLocaleDateString("he-IL")}`).join("\n") || "(אין רשומות ביקורת)"}`;
}

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  try {
    const body = (await request.json()) as {
      query?: string;
      systemPrompt?: string;
      teamMemberId?: number;
    };

    if (!isAiConfigured())
      return Response.json({ error: "מנוע ה-AI טרם הוגדר" }, { status: 503 });

    const db = getDb();

    let instructions: string;
    let input: string;
    let actionType: string;

    if (body.teamMemberId) {
      // Team member job matching (legacy path — the current UI drives this via /api/team/run-insight
      // instead, but kept working for any direct caller).
      const memberRows = await db.execute(sql`SELECT * FROM team_members WHERE id=${body.teamMemberId}`);
      const member = rowsOf(memberRows)[0];
      if (!member) return Response.json({ error: "חבר צוות לא נמצא" }, { status: 404 });
      const activeJobRows = await db.execute(sql`SELECT title, client, technologies FROM jobs WHERE archived=false ORDER BY updated_at DESC`);
      const activeJobs = rowsOf(activeJobRows);

      instructions = `אתה עוזר לחיפוש משרות מתאימות לחבר צוות. בהינתן פרופיל ורשימת משרות פעילות, זהה התאמות ופרט בעברית טבעית. הצג עד 3 משרות מתאימות ביותר עם הסבר קצר לכל אחת. אם אין התאמות טובות, אמור זאת ישירות.`;
      input = `חבר צוות: ${member.name}\nסיכום: ${member.notes || "לא הוזן"}\n\nמשרות פעילות:\n${activeJobs.map(j=>`- ${j.title} ב-${j.client} | טכנולוגיות: ${j.technologies}`).join("\n")}`;
      actionType = "חיפוש משרות לחבר צוות";
    } else {
      instructions = body.systemPrompt || await getPrompt("general_ai", GENERAL_AI_INSTRUCTIONS);
      const context = await buildFullSystemContext(db);
      input = `${context}\n\nשאלת המשתמש: ${body.query}`;
      actionType = "שאילתת AI כללית";
    }

    const result = await generateStructured<{ reply: string }>({
      operation: "general_ai",
      instructions,
      input,
      schemaName: "general_reply",
      jsonSchema: replySchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType,
      subjectType: "general",
      subjectLabel: body.query?.slice(0, 80) ?? "team-match",
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ reply: result.data.reply });
  } catch (error) {
    console.error("ai-general error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
