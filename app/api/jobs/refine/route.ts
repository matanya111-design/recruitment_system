import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { JOB_REFINE_INSTRUCTIONS } from "@/lib/ai/prompts";
import { getPrompt } from "@/lib/ai/get-prompt";
import { aiActivityLogs } from "@/db/schema";

const refinementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary","changes","questions","draft"],
  properties: {
    summary: { type: "string" },
    changes: { type: "array", items: { type: "object", additionalProperties: false, required: ["field","action","reason"], properties: { field:{type:"string"}, action:{type:"string"}, reason:{type:"string"} } } },
    questions: { type: "array", items: { type: "string" } },
    draft: { type: "object", additionalProperties: false, required: ["title","client","description","mustRequirements","preferredRequirements","technologies","minYears","professionalEmphasis","personalityEmphasis","internalNotes"], properties: {
      title:{type:"string"}, client:{type:"string"}, description:{type:"string"}, mustRequirements:{type:"string"}, preferredRequirements:{type:"string"},
      technologies:{type:"array",items:{type:"string"}}, minYears:{anyOf:[{type:"integer"},{type:"null"}]},
      professionalEmphasis:{type:"string"}, personalityEmphasis:{type:"string"}, internalNotes:{type:"string"},
    }},
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const body = (await request.json()) as { source?: string; job?: Record<string, unknown> };
    const source = String(body.source ?? "").trim();
    if (source.length < 20) return Response.json({ error: "יש להדביק מידע משמעותי לעדכון המשרה" }, { status: 400 });
    if (source.length > 120000) return Response.json({ error: "הטקסט ארוך מדי" }, { status: 413 });
    if (!body.job) return Response.json({ error: "פרטי המשרה הקיימת חסרים" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

    const result = await generateStructured<Record<string, unknown>>({
      operation: "job_refine",
      instructions: await getPrompt("job_refine", JOB_REFINE_INSTRUCTIONS),
      input: `המשרה הקיימת:\n${JSON.stringify(body.job, null, 2)}\n\nהמידע החדש:\n${source}`,
      schemaName: "job_refinement",
      jsonSchema: refinementSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    const db = getDb();
    await db.insert(aiActivityLogs).values({
      actionType: "ניתוח עדכון משרה",
      subjectType: "job",
      subjectId: body.job.id ? Number(body.job.id) : null,
      subjectLabel: `${String(body.job.title ?? "משרה")} · ${String(body.job.client ?? "")}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ refinement: result.data, usage: result.usage });
  } catch (error) {
    console.error("Job refine error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "ניתוח עדכון המשרה נכשל" }, { status: 500 });
  }
}
