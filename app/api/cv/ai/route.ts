import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { CV_EXTRACTION_INSTRUCTIONS } from "@/lib/ai/prompts";
import { aiActivityLogs, candidates, applications, aiInstructions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const cvSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fullName","email","phone","linkedinUrl","professionalTitle","company","yearsExperience","technologies","experienceSummary","uncertainties"],
  properties: {
    fullName: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
    linkedinUrl: { type: "string" }, professionalTitle: { type: "string" }, company: { type: "string" },
    yearsExperience: { type: "integer" },
    technologies: { type: "array", items: { type: "string" } },
    experienceSummary: { type: "string" },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { candidateId } = (await request.json()) as { candidateId?: number };
    if (!candidateId) return Response.json({ error: "חסר מזהה מועמד" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const [cand] = await db.select().from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.archived, false)));
    if (!cand) return Response.json({ error: "מועמד לא נמצא" }, { status: 404 });
    if (!cand.cvExtractedText) return Response.json({ error: "לא נמצא טקסט שחולץ מה-PDF. ייתכן שהקובץ סרוק." }, { status: 422 });

    const [saved] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, "cv_extraction"));
    const instructions = saved?.content ?? CV_EXTRACTION_INSTRUCTIONS;

    const result = await generateStructured<{
      fullName: string; email: string; phone: string; linkedinUrl: string;
      professionalTitle: string; company: string; yearsExperience: number;
      technologies: string[]; experienceSummary: string; uncertainties: string[];
    }>({
      operation: "cv_extraction",
      instructions,
      input: `פרטים קיימים בכרטיס (לשימוש כגיבוי בלבד):\n${JSON.stringify({ fullName: cand.fullName, email: cand.email, phone: cand.phone, linkedinUrl: cand.linkedinUrl })}\n\nטקסט קורות החיים:\n${cand.cvExtractedText.slice(0, 150000)}`,
      schemaName: "candidate_cv_details",
      jsonSchema: cvSchema,
      reasoningEffort: "medium",
    });

    const parsed = result.data;
    const uncertainties = parsed.uncertainties ?? [];
    const details = {
      fullName: parsed.fullName || cand.fullName,
      email: parsed.email || cand.email,
      phone: parsed.phone || cand.phone,
      linkedinUrl: parsed.linkedinUrl || cand.linkedinUrl,
      professionalTitle: parsed.professionalTitle || cand.professionalTitle,
      company: parsed.company || cand.company,
      yearsExperience: parsed.yearsExperience || cand.yearsExperience || 0,
      technologies: parsed.technologies?.length ? parsed.technologies : (cand.technologies as string[] ?? []),
      experienceSummary: parsed.experienceSummary || cand.experienceSummary,
      notes: {
        professionalTitle: "חולץ באמצעות AI - יש לאמת מול התפקיד האחרון בקורות החיים",
        company: "חולץ באמצעות AI - יש לאמת",
        years: uncertainties.join(" · ") || "חושב לפי תקופות התעסוקה - יש לאמת",
        summary: "נוסח בעברית באמצעות AI על בסיס קורות החיים בלבד",
      },
    };

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "חילוץ פרטי מועמד מקורות חיים",
      subjectType: "candidate",
      subjectId: candidateId,
      subjectLabel: cand.fullName,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ details, usage: result.usage });
  } catch (error) {
    console.error("CV AI extraction error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "חילוץ הפרטים נכשל" }, { status: 500 });
  }
}
