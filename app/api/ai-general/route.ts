import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost } from "@/lib/ai/provider";
import { getDb } from "@/db/client";
import { aiActivityLogs } from "@/db/schema";
import { sql } from "drizzle-orm";

const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  try {
    const body = (await request.json()) as {
      query?: string;
      systemPrompt?: string;
      jobsCount?: number;
      candidatesCount?: number;
      teamMemberId?: number;
    };

    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "מנוע ה-AI טרם הוגדר" }, { status: 503 });

    const db = getDb();

    // Get system context
    const jobRows = await db.execute(sql`SELECT title, client, status, technologies FROM jobs WHERE archived=false ORDER BY updated_at DESC LIMIT 20`);
    const candRows = await db.execute(sql`SELECT c.full_name, c.professional_title, c.technologies, a.status, a.score, a.recommendation, a.next_action, j.title role FROM candidates c JOIN applications a ON a.candidate_id=c.id JOIN jobs j ON j.id=a.job_id WHERE c.archived=false AND a.archived=false ORDER BY a.updated_at DESC LIMIT 30`);

    const jobsData = (jobRows as unknown as { rows: Record<string, unknown>[] }).rows;
    const candsData = (candRows as unknown as { rows: Record<string, unknown>[] }).rows;

    let instructions: string;
    let input: string;

    if (body.teamMemberId) {
      // Team member job matching
      const memberRows = await db.execute(sql`SELECT * FROM team_members WHERE id=${body.teamMemberId}`);
      const member = (memberRows as unknown as { rows: Record<string, unknown>[] }).rows[0];
      if (!member) return Response.json({ error: "חבר צוות לא נמצא" }, { status: 404 });

      instructions = `אתה עוזר לחיפוש משרות מתאימות לחבר צוות. בהינתן פרופיל ורשימת משרות פעילות, זהה התאמות ופרט בעברית טבעית. הצג עד 3 משרות מתאימות ביותר עם הסבר קצר לכל אחת. אם אין התאמות טובות, אמור זאת ישירות.`;
      input = `חבר צוות: ${member.name}\nסיכום: ${member.notes || "לא הוזן"}\n\nמשרות פעילות:\n${jobsData.map(j=>`- ${j.title} ב-${j.client} | טכנולוגיות: ${j.technologies}`).join("\n")}`;
    } else {
      instructions = body.systemPrompt || `אתה עוזר AI של NAYA — חברת גיוס טכנולוגי. יש לך גישה לנתוני המערכת. ענה בעברית טבעית, תמציתית ומקצועית על שאלות המשתמש.`;
      const context = `נתוני מערכת:\n\nמשרות פעילות (${jobsData.length}):\n${jobsData.map(j=>`- ${j.title} ב-${j.client} (${j.status})`).join("\n")}\n\nמועמדים אחרונים (${candsData.length}):\n${candsData.map(c=>`- ${c.full_name} ← ${c.role} | ציון ${c.score??"-"} | ${c.status} | פעולה: ${c.next_action||"לא הוגדרה"}`).join("\n")}`;
      input = `${context}\n\nשאלת המשתמש: ${body.query}`;
    }

    const result = await generateStructured<{ reply: string }>({
      operation: "general_ai",
      instructions,
      input,
      schemaName: "general_reply",
      jsonSchema: replySchema,
      reasoningEffort: "low",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: body.teamMemberId ? "חיפוש משרות לחבר צוות" : "שאילתת AI כללית",
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
