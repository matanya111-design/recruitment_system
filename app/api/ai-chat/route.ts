import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { getDb } from "@/db/client";
import { aiActivityLogs, applications, candidates, jobs, aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const chatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  try {
    const { applicationId, messages, evalType } = (await request.json()) as {
      applicationId: number;
      messages: Array<{ role: "user" | "assistant"; text: string }>;
      evalType?: string;
    };

    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "מנוע ה-AI טרם הוגדר" }, { status: 503 });

    const db = getDb();
    const rows = await db.execute(sql`
      SELECT c.full_name, j.title, j.client
      FROM applications a JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id
      WHERE a.id=${applicationId}
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];

    const instructions = `אתה עוזר לניסוח מיילים לצוות גיוס ב-NAYA. יש לך הקשר על מועמד ומשרה. המשתמש מבקש לשפר או לשנות את מייל הגיוס. הפק מייל מעודכן בלבד — ללא כותרות, ללא פרקים, רק פסקאות קצרות טבעיות. ענה אך ורק עם שדה reply שמכיל את המייל המעודכן. גנדר ברירת מחדל — זכר.`;

    const historyText = messages.map(m => `${m.role === "user" ? "בקשה" : "מייל נוכחי"}: ${m.text}`).join("\n\n");
    const input = `מועמד: ${row?.full_name ?? "לא ידוע"} | משרה: ${row?.title ?? ""} ב-${row?.client ?? ""} | שלב: ${evalType ?? "ראשוני"}\n\n${historyText}`;

    const result = await generateStructured<{ reply: string }>({
      operation: "email_chat",
      instructions,
      input,
      schemaName: "email_chat",
      jsonSchema: chatSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "המשך שיח מייל גיוס",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `${row?.full_name ?? ""} · ${row?.title ?? ""}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ reply: result.data.reply });
  } catch (error) {
    console.error("ai-chat error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
