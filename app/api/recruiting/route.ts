import { getDb } from "@/db/client";
import { requireAppIdentity, requireAdmin } from "@/lib/auth/identity";
import { writeAudit } from "@/lib/audit";
import { bootstrap } from "@/lib/auth/bootstrap";
import { sql, eq, and } from "drizzle-orm";
import { jobs, candidates, applications, aiActivityLogs, aiInstructions, appUsers } from "@/db/schema";
import { PROMPT_DEFAULTS } from "@/lib/ai/prompt-defaults";
import { instructionDefinitions } from "@/lib/ai/instructions";
import { deleteObject } from "@/lib/storage/client";

const DEFAULTS = PROMPT_DEFAULTS;
const TRIGGER_BY_KEY: Record<string, string> = Object.fromEntries(instructionDefinitions.map((d) => [d.key, d.trigger]));
const GROUP_BY_KEY: Record<string, string> = Object.fromEntries(instructionDefinitions.map((d) => [d.key, d.group]));

async function seedIfEmpty() {
  const db = getDb();
  const countResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM jobs`);
  const row = (countResult as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (Number((row as Record<string, unknown>).count ?? 0) > 0) return;

  const demoJobs = [
    ["Data Engineer","אלפא תעופה","פעילה","פיתוח והובלת תהליכי Data ארגוניים, אינטגרציות ומידול נתונים בסביבת Enterprise.","ניסיון בפיתוח ETL/ELT, עבודה משמעותית עם Spark ו-Python, SQL ברמה גבוהה וניסיון ב-Production.","עומק מעשי ב-Spark, אחריות מקצה לקצה ויכולת עבודה מול גורמים עסקיים וטכנולוגיים.",["Databricks","Spark","Python","SQL"]],
    ["Data Platforms Administrator","מדיקל מערכות","פעילה","אחריות תשתיתית על פלטפורמות Data וקלסטרים ארגוניים.","Linux חזק, התקנה וקינפוג של מערכות, ניסיון תפעולי ב-Kafka ופתרון תקלות Production.","Platform ownership ולא שימוש אפליקטיבי בלבד.",["Kafka","Linux","Ansible","Trino"]],
    ["Machine Learning Engineer","בנק דלתא","בהשהיה","העברת מודלי ML ל-Production ופיתוח תשתיות MLOps.","Python, Containers, Kubernetes, CI/CD וניסיון בפריסת שירותי מודלים.","יכולת פיתוח לצד הבנה תשתיתית ו-Production mindset.",["Python","Kubernetes","MLflow","GCP"]],
  ];
  for (const j of demoJobs) {
    await db.insert(jobs).values({
      title: j[0] as string, client: j[1] as string, status: j[2] as string,
      description: j[3] as string, mustRequirements: j[4] as string,
      professionalEmphasis: j[5] as string,
      technologies: j[6],
    });
  }

  const allJobs = await db.select({ id: jobs.id }).from(jobs).orderBy(jobs.id);
  const demoCandidates = [
    ["נועה לוין","FinCloud",7,["Python","PySpark","Kafka","AWS"],0,"מיועדת לראיון","2026-08-13T10:00",88,"מתאימה מאוד","ראיון מקצועי"],
    ["אורי ברק","InfraOps",9,["Linux","Kafka","Ansible","Kubernetes"],1,"דורש בירור",null,82,"מתאים בכפוף לבירור","בירור ניסיון Kafka תשתיתי"],
    ["מיכל כהן","VisionAI",5,["Python","MLflow","GCP","Docker"],2,"ראיון בוצע","2026-08-10",79,"מתאימה","החלטה לאחר ראיון"],
    ["רועי שלו","DataWorks",4,["SQL","Databricks","Airflow"],0,"בבדיקה",null,73,"מתאים בכפוף לבירור","השלמת הערכה"],
    ["דנה פרץ","Retail BI",3,["SQL","ETL","Azure"],0,"חדש",null,65,"התאמה חלקית","בדיקת קורות חיים"],
    ["יואב רז","CloudBase",4,["DevOps","Linux","Docker"],1,"בבדיקה","2026-08-14",58,"התאמה חלקית","ראיון מקצועי"],
    ["ליאור גל","WebStack",2,["Python","FastAPI","AWS"],2,"נדחה","2026-08-06",46,"לא מתאים",""],
    ["תמר ישראלי","GlobalPay",8,["Spark","Python","Hadoop","Kafka"],0,"הועברה ללקוח","2026-08-05",84,"מתאימה מאוד","מעקב מול לקוח"],
    ["עמית מור","Enterprise IT",6,["Linux","Elastic","Ansible"],1,"חדש",null,76,"מתאים","בדיקת קורות חיים"],
  ];
  for (const c of demoCandidates) {
    const [ins] = await db.insert(candidates).values({
      fullName: c[0] as string, company: c[1] as string,
      yearsExperience: c[2] as number, technologies: c[3],
      experienceSummary: `${c[0]} בעל/ת ניסיון מעשי בסביבות Data ו-Production.`,
    }).returning({ id: candidates.id });
    const jobIndex = c[4] as number;
    const jobId = allJobs[jobIndex]?.id;
    if (!jobId) continue;
    await db.insert(applications).values({
      candidateId: ins.id, jobId,
      status: c[5] as string,
      interviewDate: c[6] ? new Date(c[6] as string) : null,
      score: c[7] as number,
      recommendation: c[8] as string,
      nextAction: c[9] as string,
      evaluationDate: new Date(),
    });
  }
}

export async function GET(request: Request) {
  try {
    await bootstrap();
    const identity = await requireAppIdentity();
    if (identity instanceof Response) return identity;

    await seedIfEmpty();

    const db = getDb();

    // Auto-update next_action based on interview/evaluation state
    await db.execute(sql`
      UPDATE applications SET next_action=CASE
        WHEN LENGTH(TRIM(interview_summary))>0 AND evaluation_type<>'לאחר ראיון' THEN 'הפעלת הערכה סופית לאחר ראיון'
        WHEN LENGTH(TRIM(interview_summary))>0 AND evaluation_type='לאחר ראיון' THEN 'קבלת החלטה ועדכון סטטוס'
        WHEN evaluation_date IS NULL AND EXISTS (SELECT 1 FROM candidates c WHERE c.id=applications.candidate_id AND LENGTH(COALESCE(c.cv_extracted_text,''))>0) THEN 'הפעלת הערכת התאמה ראשונית'
        WHEN evaluation_date IS NOT NULL AND LENGTH(TRIM(interview_summary))=0 THEN 'תיאום או ביצוע ראיון מקצועי'
        ELSE next_action END
      WHERE next_action IN ('בדיקת קורות חיים','השלמת הערכה','אימות פרטי קורות חיים')
    `);

    type QR = { rows: Record<string, unknown>[] };
    const toRows = (r: unknown) => (r as QR).rows;

    const jobRows = toRows(await db.execute(sql`
      SELECT j.*, COUNT(CASE WHEN a.archived=false THEN 1 END)::int candidates_count,
        SUM(CASE WHEN a.recommendation IN ('מתאים','מתאימה','מתאים מאוד','מתאימה מאוד','לזמן לראיון פנימי','להעביר ללקוח') AND a.archived=false THEN 1 ELSE 0 END)::int high_fit_count,
        SUM(CASE WHEN (a.recommendation = 'בירור קצר לפני ראיון' OR (a.score BETWEEN 60 AND 74 AND a.recommendation NOT IN ('לא מתאים','לא מתאימה','לא רלוונטי לתפקיד','לא לקדם למשרה זו','לא להעביר ללקוח'))) AND a.archived=false THEN 1 ELSE 0 END)::int reasonable_fit_count
      FROM jobs j LEFT JOIN applications a ON a.job_id=j.id WHERE j.archived=false GROUP BY j.id ORDER BY j.updated_at DESC
    `));

    const candidateRows = toRows(await db.execute(sql`
      SELECT c.*,c.created_at candidate_created_at,a.updated_at application_updated_at,a.id application_id,a.job_id,a.status,a.interview_date,a.interview_summary,a.interview_raw_material,a.next_action,a.next_action_date,a.score,a.recommendation,a.evaluation_type,a.evaluation_date,a.evaluation_json,a.pre_evaluation_json,a.pre_evaluation_date,a.post_evaluation_json,a.post_evaluation_date,a.evaluation_feedback,a.proposed_engine_rule,a.proposed_engine_rule_key,a.engine_rule_status,LENGTH(COALESCE(c.cv_extracted_text,''))::int cv_text_length,j.title role,j.client
      FROM candidates c JOIN applications a ON a.candidate_id=c.id JOIN jobs j ON j.id=a.job_id
      WHERE c.archived=false AND a.archived=false AND j.archived=false ORDER BY a.updated_at DESC
    `));

    const archivedJobRows = toRows(await db.execute(sql`SELECT id,title,client,status,updated_at FROM jobs WHERE archived=true ORDER BY updated_at DESC`));
    const archivedAppRows = toRows(await db.execute(sql`
      SELECT a.id application_id,a.status,a.updated_at,a.evaluation_feedback,c.full_name,j.title role,j.client
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.archived=true AND c.archived=false AND j.archived=false ORDER BY a.updated_at DESC
    `));

    const aiActivityRows = await db.select().from(aiActivityLogs).orderBy(sql`created_at DESC`);

    const isAdmin = identity.role === "admin";
    const aiInstructionRows = isAdmin
      ? toRows(await db.execute(sql`SELECT key,title,description,content,is_custom,updated_at FROM ai_instructions`))
          .filter((row) => String(row.key) in TRIGGER_BY_KEY) // hide rows for prompts retired from instructionDefinitions (e.g. merged into another key)
          .map((row) => ({ ...row, trigger: TRIGGER_BY_KEY[String(row.key)] ?? "", group: GROUP_BY_KEY[String(row.key)] ?? "" }))
      : [];
    const appUserRows = isAdmin
      ? toRows(await db.execute(sql`SELECT email,role,created_at,updated_at FROM app_users ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END,email`))
      : [];

    return Response.json({
      jobs: jobRows,
      candidates: candidateRows,
      archivedJobs: archivedJobRows,
      archivedApplications: archivedAppRows,
      aiActivity: aiActivityRows,
      aiInstructions: aiInstructionRows,
      appUsers: appUserRows,
    });
  } catch (error) {
    console.error("GET /api/recruiting error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAppIdentity();
    if (identity instanceof Response) return identity;
    const db = getDb();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.entity === "job") {
      const [result] = await db.insert(jobs).values({
        title: String(body.title ?? ""),
        client: String(body.client ?? ""),
        status: String(body.status ?? "פעילה"),
        description: String(body.description ?? ""),
        mustRequirements: String(body.mustRequirements ?? ""),
        preferredRequirements: String(body.preferredRequirements ?? ""),
        technologies: body.technologies ?? [],
        minYears: body.minYears != null ? Number(body.minYears) : null,
        professionalEmphasis: String(body.professionalEmphasis ?? ""),
        personalityEmphasis: String(body.personalityEmphasis ?? ""),
        internalNotes: String(body.internalNotes ?? ""),
      }).returning({ id: jobs.id });
      await writeAudit({ actorEmail: identity.email, action: "create", entityType: "job", entityId: result.id, after: body });
      return Response.json({ id: result.id }, { status: 201 });
    }

    if (body.entity === "candidate") {
      const [cand] = await db.insert(candidates).values({
        fullName: String(body.fullName ?? ""),
        phone: String(body.phone ?? ""),
        email: String(body.email ?? ""),
        linkedinUrl: String(body.linkedinUrl ?? ""),
        professionalTitle: String(body.professionalTitle ?? ""),
        company: String(body.company ?? ""),
        yearsExperience: body.yearsExperience != null ? Number(body.yearsExperience) : null,
        technologies: body.technologies ?? [],
        experienceSummary: String(body.experienceSummary ?? ""),
      }).returning({ id: candidates.id });
      const [app] = await db.insert(applications).values({
        candidateId: cand.id,
        jobId: Number(body.jobId),
        status: String(body.status ?? "חדש"),
        nextAction: "בדיקת קורות חיים",
      }).returning({ id: applications.id });
      await writeAudit({ actorEmail: identity.email, action: "create", entityType: "candidate", entityId: cand.id });
      return Response.json({ id: cand.id, applicationId: app.id }, { status: 201 });
    }

    if (body.entity === "application") {
      const candidateId = Number(body.candidateId);
      const jobId = Number(body.jobId);
      const [existing] = await db.select({ id: applications.id }).from(applications)
        .where(and(eq(applications.candidateId, candidateId), eq(applications.jobId, jobId)));
      if (existing) return Response.json({ error: "המועמד כבר משויך למשרה הזאת" }, { status: 409 });
      const [app] = await db.insert(applications).values({
        candidateId, jobId, status: "חדש", nextAction: "בדיקת קורות חיים",
      }).returning({ id: applications.id });
      // Linking an archived candidate to a new job implies they're active again — otherwise the
      // new application would be invisible everywhere (lists filter on candidates.archived=false).
      await db.update(candidates).set({ archived: false, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
      return Response.json({ applicationId: app.id }, { status: 201 });
    }

    if (body.entity === "appUser") {
      const adminCheck = await requireAdmin();
      if (adminCheck instanceof Response) return adminCheck;
      const email = String(body.email ?? "").trim().toLowerCase();
      const role = String(body.role ?? "user") as "admin" | "user";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "כתובת מייל לא תקינה" }, { status: 400 });
      if (!["admin", "user"].includes(role)) return Response.json({ error: "תפקיד לא תקין" }, { status: 400 });
      await db.insert(appUsers).values({ email, role }).onConflictDoUpdate({ target: appUsers.email, set: { role, updatedAt: new Date() } });
      await writeAudit({ actorEmail: identity.email, action: "upsert_user", entityType: "app_user", entityId: email, after: { role } });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported entity" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/recruiting error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireAppIdentity();
    if (identity instanceof Response) return identity;
    const db = getDb();
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);

    if (body.entity === "application") {
      if (body.engineRuleDecision === "approve" || body.engineRuleDecision === "reject") {
        const [app] = await db.select({ proposedEngineRule: applications.proposedEngineRule, proposedEngineRuleKey: applications.proposedEngineRuleKey }).from(applications).where(eq(applications.id, id));
        if (!app?.proposedEngineRule) return Response.json({ error: "לא נמצאה הצעה רוחבית" }, { status: 404 });
        if (body.engineRuleDecision === "approve") {
          // Approving appends the learned rule directly to the specific prompt that produced it,
          // so the change is visible and editable right there in "הוראות AI" — not a separate,
          // invisible list applied behind the scenes.
          const targetKey = app.proposedEngineRuleKey || "candidate_evaluation";
          const [inst] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, targetKey));
          const baseContent = inst?.content ?? DEFAULTS[targetKey] ?? "";
          const updatedContent = `${baseContent}\n\nכלל שנלמד ואושר בעקבות משוב מקצועי:\n${app.proposedEngineRule}`;
          await db.update(aiInstructions).set({ content: updatedContent, isCustom: true, updatedAt: new Date() }).where(eq(aiInstructions.key, targetKey));
        }
        await db.update(applications).set({ engineRuleStatus: body.engineRuleDecision === "approve" ? "אושר ככלל קבוע" : "נדחה", updatedAt: new Date() }).where(eq(applications.id, id));
        await writeAudit({ actorEmail: identity.email, action: `engine_rule_${body.engineRuleDecision}`, entityType: "application", entityId: id });
        return Response.json({ ok: true });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const strFields: [string, keyof typeof applications.$inferInsert][] = [
        ["status", "status"], ["interviewSummary", "interviewSummary"],
        ["interviewRawMaterial", "interviewRawMaterial"],
        ["nextAction", "nextAction"], ["nextActionDate", "nextActionDate"],
        ["evaluationFeedback", "evaluationFeedback"],
      ];
      for (const [k, col] of strFields) if (k in body) updates[col] = body[k];
      if ("interviewDate" in body) updates.interviewDate = body.interviewDate ? new Date(body.interviewDate as string) : null;
      if ("archived" in body) updates.archived = Boolean(body.archived);
      if (Object.keys(updates).length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.update(applications).set(updates as any).where(eq(applications.id, id));
      }
      // Restoring an archived application implies the candidate is active again too — otherwise
      // list views that filter on candidates.archived=false would still hide it.
      if (body.archived === 0 || body.archived === false) {
        const [app] = await db.select({ candidateId: applications.candidateId }).from(applications).where(eq(applications.id, id));
        if (app) await db.update(candidates).set({ archived: false, updatedAt: new Date() }).where(eq(candidates.id, app.candidateId));
      }
      return Response.json({ ok: true });
    }

    if (body.entity === "candidate") {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const fields: [string, string][] = [
        ["fullName","fullName"],["phone","phone"],["email","email"],["linkedinUrl","linkedinUrl"],
        ["professionalTitle","professionalTitle"],["company","company"],
        ["yearsExperience","yearsExperience"],["experienceSummary","experienceSummary"],
        ["recruiterOpinion","recruiterOpinion"],
      ];
      for (const [k, col] of fields) if (k in body) updates[col] = body[k];
      if ("technologies" in body) updates.technologies = body.technologies;
      if ("archived" in body) updates.archived = Boolean(body.archived);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(candidates).set(updates as any).where(eq(candidates.id, id));
      return Response.json({ ok: true });
    }

    if (body.entity === "job") {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const fields: [string, string][] = [
        ["title","title"],["client","client"],["status","status"],["description","description"],
        ["mustRequirements","mustRequirements"],["preferredRequirements","preferredRequirements"],
        ["minYears","minYears"],["professionalEmphasis","professionalEmphasis"],
        ["personalityEmphasis","personalityEmphasis"],["internalNotes","internalNotes"],
      ];
      for (const [k, col] of fields) if (k in body) updates[col] = body[k];
      if ("technologies" in body) updates.technologies = body.technologies;
      if ("archived" in body) updates.archived = Boolean(body.archived);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(jobs).set(updates as any).where(eq(jobs.id, id));
      return Response.json({ ok: true });
    }

    if (body.entity === "aiInstruction") {
      const adminCheck = await requireAdmin();
      if (adminCheck instanceof Response) return adminCheck;
      const key = String(body.key ?? "");
      if (!(key in DEFAULTS)) return Response.json({ error: "סוג ההוראות אינו מוכר" }, { status: 400 });
      const content = body.reset ? DEFAULTS[key] : String(body.content ?? "").trim();
      if (content.length < 50) return Response.json({ error: "ההוראות קצרות מדי" }, { status: 400 });
      await db.update(aiInstructions).set({ content, isCustom: !body.reset, updatedAt: new Date() }).where(eq(aiInstructions.key, key));
      await writeAudit({ actorEmail: identity.email, action: body.reset ? "reset_instruction" : "update_instruction", entityType: "ai_instruction", entityId: key });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported entity" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/recruiting error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireAppIdentity();
    if (identity instanceof Response) return identity;
    const db = getDb();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.entity === "appUser") {
      const adminCheck = await requireAdmin();
      if (adminCheck instanceof Response) return adminCheck;
      const email = String(body.email ?? "").trim().toLowerCase();
      if (email === identity.email) return Response.json({ error: "לא ניתן למחוק את המשתמש שלך" }, { status: 400 });
      await db.delete(appUsers).where(eq(appUsers.email, email));
      await writeAudit({ actorEmail: identity.email, action: "delete_user", entityType: "app_user", entityId: email });
      return Response.json({ ok: true });
    }

    const id = Number(body.id);
    if (!id) return Response.json({ error: "חסר מזהה" }, { status: 400 });

    if (body.entity === "job") {
      const countResult2 = await db.execute(sql`SELECT COUNT(*)::int AS c FROM applications WHERE job_id=${id}`);
      const count = (countResult2 as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
      if (Number((count as Record<string, unknown>).c) > 0) {
        return Response.json({ error: "לא ניתן למחוק משרה עם מועמדויות. ניתן להעביר לארכיון." }, { status: 409 });
      }
      await db.delete(jobs).where(eq(jobs.id, id));
      await writeAudit({ actorEmail: identity.email, action: "delete", entityType: "job", entityId: id });
      return Response.json({ ok: true });
    }

    if (body.entity === "candidate") {
      const [cand] = await db.select({ cvKey: candidates.cvKey }).from(candidates).where(eq(candidates.id, id));
      if (!cand) return Response.json({ error: "מועמד לא נמצא" }, { status: 404 });
      await db.delete(applications).where(eq(applications.candidateId, id));
      await db.delete(candidates).where(eq(candidates.id, id));
      if (cand.cvKey) await deleteObject(cand.cvKey).catch(() => undefined);
      await writeAudit({ actorEmail: identity.email, action: "delete", entityType: "candidate", entityId: id });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported entity" }, { status: 400 });
  } catch (error) {
    console.error("DELETE /api/recruiting error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
