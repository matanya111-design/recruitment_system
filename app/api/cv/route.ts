import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { uploadObject, getPresignedUrl, deleteObject } from "@/lib/storage/client";
import { candidates, applications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const TECH_TERMS = ["Python","PySpark","Spark","SQL","Kafka","Flink","Airflow","Prefect","Databricks","Snowflake","Hadoop","Hive","Impala","HBase","Trino","NiFi","Elasticsearch","OpenSearch","Linux","Ansible","Terraform","Docker","Kubernetes","OpenShift","Helm","Argo CD","Jenkins","GitHub Actions","GitLab CI","AWS","Azure","GCP","S3","Glue","Athena","Lambda","EKS","ECS","EC2","RDS","PostgreSQL","MySQL","MongoDB","Redis","Cassandra","Java","C++","C#","Scala","Go","FastAPI","Flask","Django","MLflow","vLLM","Grafana","Prometheus","Splunk","CI/CD","ETL","ELT"];
const PROFESSIONAL_TITLE_PATTERN = /\b(?:senior\s+|lead\s+|principal\s+|head\s+of\s+|team\s+lead\s+)?(?:data\s+engineer|data\s+architect|data\s+platform(?:s)?\s+(?:engineer|administrator|lead)|devops\s+engineer|cloud\s+engineer|platform\s+engineer|machine\s+learning\s+engineer|ml\s+engineer|mlops\s+engineer|software\s+engineer|backend\s+developer|data\s+analyst|bi\s+developer)\b/i;

function parseResume(text: string, current: Record<string, unknown>) {
  const compact = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ");
  const lines = compact.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const linkedin = compact.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%\-]+\/?/i)?.[0] ?? "";
  const phoneCandidates = compact.match(/(?:\+?972[-\s]?(?:\(0\))?[-\s]?|0)(?:5\d|[23489])[-\s]?\d{3}[-\s]?\d{4}/g) ?? [];
  const excluded = /resume|curriculum|vitae|cv|linkedin|email|phone|profile|summary|experience|education|skills|contact/i;
  const name = lines.slice(0, 18).find((l) => l.length >= 5 && l.length <= 55 && !excluded.test(l) && !l.includes("@") && !/\d/.test(l) && /^[A-Za-z\u0590-\u05ff''.-]+(?:\s+[A-Za-z\u0590-\u05ff''.-]+){1,3}$/.test(l)) ?? "";
  const technologies = TECH_TERMS.filter((term) => new RegExp(`(^|[^A-Za-z0-9+#])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9+#]|$)`, "i").test(compact));
  const professionalTitle = lines.slice(0, 45).find((l) => l.length <= 90 && PROFESSIONAL_TITLE_PATTERN.test(l)) ?? "";
  const explicitYears = compact.match(/(\d{1,2})\+?\s*(?:years?|שנות?)\s+(?:of\s+)?(?:experience|ניסיון)/i);
  let yearsExperience = explicitYears ? Number(explicitYears[1]) : 0;
  let yearsNote = explicitYears ? "זוהה ניסוח מפורש בקורות החיים" : "לא זוהה מספר שנות ניסיון מפורש";
  if (!yearsExperience) {
    const years = (compact.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number).filter((y) => y >= 1990 && y <= new Date().getFullYear());
    if (years.length) { yearsExperience = Math.min(40, Math.max(0, new Date().getFullYear() - Math.min(...years))); yearsNote = "הערכה לפי השנה המוקדמת בקובץ - יש לאמת"; }
  }
  const summary = technologies.length
    ? `בקורות החיים מופיע ניסיון מקצועי בעולמות הטכנולוגיה, עם דגש על ${technologies.slice(0, 8).join(", ")}.${yearsExperience ? ` הוותק המשוער הוא כ-${yearsExperience} שנים, אך יש לאמת אותו מול תקופות התעסוקה.` : " לא זוהה ותק מפורש ויש להשלים אותו ידנית."} התקציר מבוסס על חילוץ אוטומטי ואינו קובע את עומק הניסיון בכל טכנולוגיה.`
    : "קורות החיים נקלטו, אך לא זוהה מידע מספיק ליצירת תקציר מקצועי אמין. יש לעבור על המסמך ולהשלים את התקציר ידנית.";
  return {
    fullName: name || String(current.full_name ?? ""),
    email: email || String(current.email ?? ""),
    phone: phoneCandidates[0]?.replace(/\s+/g, " ") ?? String(current.phone ?? ""),
    linkedinUrl: linkedin ? (linkedin.startsWith("http") ? linkedin : `https://${linkedin}`) : String(current.linkedin_url ?? ""),
    professionalTitle: professionalTitle || String(current.professional_title ?? ""),
    company: String(current.company ?? ""),
    yearsExperience: yearsExperience || Number(current.years_experience ?? 0),
    technologies: technologies.length ? technologies : (current.technologies as string[] ?? []),
    experienceSummary: summary,
    notes: {
      professionalTitle: professionalTitle ? "זוהה ניסוח תפקיד - יש לאמת שזהו התפקיד הנוכחי" : "לא זוהה תפקיד - יש להשלים ידנית",
      company: "חברה נוכחית אינה מתעדכנת אוטומטית",
      years: yearsNote,
      summary: "התקציר נוצר מהמידע שזוהה ואינו הערכת התאמה",
    },
  };
}

// POST /api/cv — upload CV for a candidate
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const candidateId = Number(form.get("candidateId"));
    if (!(file instanceof File) || !candidateId)
      return Response.json({ error: "חסר קובץ או מזהה מועמד" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE)
      return Response.json({ error: "ניתן להעלות PDF עד 10MB" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const sig = bytes.slice(0, 5).toString("ascii");
    if (file.type !== "application/pdf" || sig !== "%PDF-")
      return Response.json({ error: "יש להעלות קובץ PDF תקין בלבד" }, { status: 400 });

    const db = getDb();
    const [cand] = await db.select({ id: candidates.id, cvKey: candidates.cvKey })
      .from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.archived, false)));
    if (!cand) return Response.json({ error: "המועמד לא נמצא" }, { status: 404 });

    let extractedText = "";
    let pages: number | null = null;
    let extractionStatus = "הטקסט חולץ";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(pdf, { mergePages: true });
      pages = result.totalPages;
      extractedText = String(result.text ?? "").slice(0, 200000).trim();
      if (!extractedText) extractionStatus = "לא נמצא טקסט - ייתכן שזה PDF סרוק";
    } catch {
      extractionStatus = "הקובץ נשמר, חילוץ הטקסט נכשל";
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u0590-\u05ff]/g, "_").slice(0, 120) || "resume.pdf";
    const key = `candidate-cvs/${candidateId}/${randomUUID()}-${safeName}`;
    await uploadObject(key, bytes, "application/pdf");

    const oldKey = cand.cvKey;
    await db.update(candidates).set({
      cvKey: key, cvFilename: file.name.slice(0, 180),
      cvContentType: "application/pdf",
      cvExtractedText: extractedText, cvExtractionStatus: extractionStatus,
      cvUploadedAt: new Date(), updatedAt: new Date(),
    }).where(eq(candidates.id, candidateId));

    // Update all active applications for this candidate
    await db.execute(sql`
      UPDATE applications SET
        status=CASE WHEN status='חדש' THEN 'בבדיקה' ELSE status END,
        next_action=CASE WHEN next_action IN ('','בדיקת קורות חיים','העלאת קורות חיים') THEN 'אימות פרטי קורות חיים' ELSE next_action END,
        updated_at=NOW()
      WHERE candidate_id=${candidateId} AND archived=false
    `);

    if (oldKey && oldKey !== key) await deleteObject(oldKey).catch(() => undefined);

    return Response.json({ ok: true, filename: file.name, size: file.size, pages, textLength: extractedText.length, extractionStatus });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "העלאת הקובץ נכשלה" }, { status: 500 });
  }
}

// GET /api/cv?candidateId=X — get signed URL or quick parse details
export async function GET(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const url = new URL(request.url);
    const candidateId = Number(url.searchParams.get("candidateId"));
    if (!candidateId) return Response.json({ error: "חסר מזהה מועמד" }, { status: 400 });

    const db = getDb();
    const [cand] = await db.select().from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.archived, false)));
    if (!cand) return Response.json({ error: "מועמד לא נמצא" }, { status: 404 });

    if (url.searchParams.get("mode") === "details") {
      if (!cand.cvExtractedText) return Response.json({ error: "לא נמצא טקסט שחולץ מקורות החיים" }, { status: 422 });
      return Response.json({ details: parseResume(cand.cvExtractedText, cand as unknown as Record<string, unknown>) });
    }

    if (!cand.cvKey) return Response.json({ error: "לא נמצאו קורות חיים" }, { status: 404 });
    const signedUrl = await getPresignedUrl(cand.cvKey);
    return Response.json({ url: signedUrl, filename: cand.cvFilename });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "פתיחת הקובץ נכשלה" }, { status: 500 });
  }
}
