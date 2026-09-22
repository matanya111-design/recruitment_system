import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { getDb } from "@/db/client";
import { aiActivityLogs } from "@/db/schema";

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
    const result = await generateStructured<{ name: string; notes: string }>({
      operation: "team_extract_profile",
      instructions: `אתה מחלץ פרטי עובד מטקסט גולמי ובונה פרופיל מקצועי מסודר.

החזר:
- name: שם מלא של האדם. חלץ מהטקסט. אם לא ברור — החזר מחרוזת ריקה.
- notes: פרופיל מקצועי מסודר בעברית. ארגן תחת כותרות קצרות רלוונטיות בלבד כגון "תפקיד ורקע:", "ניסיון מקצועי:", "כיוון מקצועי:", "מצב נוכחי:", "מה הביא לפגישה:". כל כותרת מסתיימת בנקודתיים. פסקאות קצרות, טקסט טבעי. שמור על כל המידע. אל תמציא. ללא Markdown.`,
      input: `${nameHint ? `רמז לשם: ${nameHint}\n\n` : ""}טקסט גולמי:\n${text}`,
      schemaName: "team_profile_extraction",
      jsonSchema: schema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    const db = getDb();
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
