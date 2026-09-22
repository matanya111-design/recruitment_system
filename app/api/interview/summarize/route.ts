import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { INTERVIEW_SUMMARY_INSTRUCTIONS } from "@/lib/ai/prompts";
import { aiActivityLogs, aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "uncertainties"],
  properties: {
    summary: { type: "string" },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const body = (await request.json()) as { applicationId?: number; rawText?: string };
    const rawText = String(body.rawText ?? "").trim();
    if (!body.applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });
    if (rawText.length < 50) return Response.json({ error: "חומר הגלם קצר מדי. יש להדביק תמלול או הערות מפורטות." }, { status: 400 });
    if (rawText.length > 150000) return Response.json({ error: "חומר הגלם ארוך מדי. המגבלה היא 150,000 תווים." }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.id,c.full_name,c.professional_title,c.company,c.experience_summary,c.recruiter_opinion,c.cv_extracted_text,
             j.title,j.client,j.description,j.must_requirements,j.preferred_requirements,j.technologies,j.min_years,j.professional_emphasis,j.personality_emphasis
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${body.applicationId} AND a.archived=false AND c.archived=false AND j.archived=false
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) return Response.json({ error: "המועמדות לא נמצאה" }, { status: 404 });

    const [saved] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, "interview_summary"));
    const instructions = saved?.content ?? INTERVIEW_SUMMARY_INSTRUCTIONS;

    const input = `המשרה:\nשם: ${row.title}\nלקוח: ${row.client}\nתיאור: ${row.description}\nדרישות חובה: ${row.must_requirements}\nדרישות יתרון: ${row.preferred_requirements}\nטכנולוגיות: ${row.technologies}\nשנות ניסיון: ${row.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${row.professional_emphasis}\nדגשים אישיותיים: ${row.personality_emphasis}\n\nהמועמד:\nשם: ${row.full_name}\nתפקיד מקצועי: ${row.professional_title || "לא ידוע"}\nחברה: ${row.company || "לא ידוע"}\nתקציר בכרטיס: ${row.experience_summary || "לא הוזן"}\n\nחוות דעת מגייס מהראיון הראשוני:\n${row.recruiter_opinion || "לא הוזנה"}\n\nקורות חיים כמקור משלים בלבד:\n${String(row.cv_extracted_text || "לא צורפו").slice(0, 80000)}\n\nחומר גלם מהראיון:\n${rawText}`;

    const result = await generateStructured<{ summary: string; uncertainties: string[] }>({
      operation: "interview_summary",
      instructions,
      input,
      schemaName: "interview_summary",
      jsonSchema: summarySchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "יצירת טיוטת סיכום ראיון",
      subjectType: "application",
      subjectId: body.applicationId,
      subjectLabel: `${row.full_name} · ${row.title} · ${row.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ draft: result.data, usage: result.usage });
  } catch (error) {
    console.error("Interview summarize error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "יצירת הסיכום נכשלה" }, { status: 500 });
  }
}
