import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { getDb } from "@/db/client";
import { aiActivityLogs, aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TEAM_EXTRACT_PROFILE_INSTRUCTIONS } from "@/lib/ai/team-prompts";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes"],
  properties: {
    name: { type: "string" },
    notes: { type: "string" },
  },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  if (!process.env.OPENAI_API_KEY)
    return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const { text, nameHint } = (await request.json()) as { text: string; nameHint?: string };
  if (!text?.trim()) return Response.json({ error: "טקסט ריק" }, { status: 400 });

  try {
    const db = getDb();
    const [savedInst] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, "team_extract_profile")).catch(() => []);
    const instructions = savedInst?.content ?? TEAM_EXTRACT_PROFILE_INSTRUCTIONS;

    const result = await generateStructured<{ name: string; notes: string }>({
      operation: "team_extract_profile",
      instructions,
      input: `${nameHint ? `רמז לשם: ${nameHint}\n\n` : ""}טקסט גולמי:\n${text}`,
      schemaName: "team_profile_extraction",
      jsonSchema: schema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "חילוץ פרופיל עובד",
      subjectType: "team_member",
      subjectLabel: result.data.name || "עובד חדש",
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ name: result.data.name, notes: result.data.notes });
  } catch (err) {
    console.error("extract-profile error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "שגיאה" }, { status: 500 });
  }
}
