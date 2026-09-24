import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { JOB_PARSING_INSTRUCTIONS } from "@/lib/ai/prompts";
import { aiActivityLogs, aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";

const jobDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title","client","description","mustRequirements","preferredRequirements","technologies","minYears","professionalEmphasis","personalityEmphasis","internalNotes","uncertainties"],
  properties: {
    title: { type: "string" }, client: { type: "string" }, description: { type: "string" },
    mustRequirements: { type: "string" }, preferredRequirements: { type: "string" },
    technologies: { type: "array", items: { type: "string" } },
    minYears: { anyOf: [{ type: "integer" }, { type: "null" }] },
    professionalEmphasis: { type: "string" }, personalityEmphasis: { type: "string" },
    internalNotes: { type: "string" }, uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const { text } = (await request.json()) as { text?: string };
    const source = String(text ?? "").trim();
    if (source.length < 20) return Response.json({ error: "יש להדביק טקסט משמעותי של המשרה" }, { status: 400 });
    if (source.length > 120000) return Response.json({ error: "הטקסט ארוך מדי. יש לצמצם חתימות וקבצים מצורפים." }, { status: 413 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const db = getDb();
    const [saved] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, "job_parsing"));
    const instructions = saved?.content ?? JOB_PARSING_INSTRUCTIONS;

    const result = await generateStructured<Record<string, unknown>>({
      operation: "job_parsing",
      instructions,
      input: `חומר הגלם למשרה:\n\n${source}`,
      schemaName: "job_draft",
      jsonSchema: jobDraftSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "יצירת טיוטת משרה",
      subjectType: "job",
      subjectLabel: `${String(result.data.title ?? "משרה ללא שם")} · ${String(result.data.client ?? "לקוח לא ידוע")}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ draft: result.data, usage: result.usage });
  } catch (error) {
    console.error("Job parse error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "יצירת טיוטת המשרה נכשלה" }, { status: 500 });
  }
}
