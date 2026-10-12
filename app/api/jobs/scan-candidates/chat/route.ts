import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { SCAN_CHAT_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { getPrompt } from "@/lib/ai/get-prompt";
import { aiActivityLogs, candidateScans } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const chatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

type ScanEntry = {
  source: "candidate" | "team_member"; name: string; score: number; fit_label: string; bottom_line: string;
  strengths: string[]; gaps: string[]; included: boolean;
};

// Read-only Q&A about the MOST RECENT saved scan for a job — has the full evaluated set (including
// everyone below the score-60 display cutoff), so it can answer "why didn't X make the list".
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;

  try {
    const { jobId, messages } = (await request.json()) as {
      jobId?: number;
      messages: Array<{ role: "user" | "assistant"; text: string }>;
    };
    if (!jobId) return Response.json({ error: "חסר מזהה משרה" }, { status: 400 });
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר" }, { status: 503 });

    const db = getDb();

    const jobRows = await db.execute(sql`
      SELECT title,client,description,must_requirements,preferred_requirements,
             technologies,min_years,professional_emphasis,personality_emphasis,hiring_manager_emphasis
      FROM jobs WHERE id=${jobId}
    `);
    const job = (jobRows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!job) return Response.json({ error: "המשרה לא נמצאה" }, { status: 404 });

    const [scan] = await db.select().from(candidateScans).where(eq(candidateScans.jobId, jobId)).orderBy(desc(candidateScans.createdAt)).limit(1);
    if (!scan) return Response.json({ error: "אין סריקה שמורה למשרה זו לדון עליה" }, { status: 422 });

    const entries = (scan.resultsJson as ScanEntry[]) ?? [];
    const entriesText = entries.map((e) => {
      const kind = e.source === "team_member" ? "עובד פנימי" : "מועמד";
      const flag = e.included ? "" : " [לא עבר את סף הציון 60 להצגה ברשימה]";
      return `- ${e.name} (${kind}) — ציון ${e.score}, ${e.fit_label}${flag}\n  שורה תחתונה: ${e.bottom_line}\n  חוזקות: ${e.strengths.join("; ") || "אין"}\n  פערים: ${e.gaps.join("; ") || "אין"}`;
    }).join("\n\n");

    const jobDescription = `שם: ${job.title}\nלקוח: ${job.client}\nתיאור: ${job.description}\nדרישות חובה: ${job.must_requirements}\nדרישות יתרון: ${job.preferred_requirements}\nטכנולוגיות: ${job.technologies}\nשנות ניסיון: ${job.min_years ?? "לא הוגדר"}\nדגשים מקצועיים: ${job.professional_emphasis}\nדגשים אישיותיים: ${job.personality_emphasis}${job.hiring_manager_emphasis ? `\nדגשי מנהל מגייס: ${job.hiring_manager_emphasis}` : ""}`;

    const instructions = await getPrompt("scan_chat", SCAN_CHAT_INSTRUCTIONS);
    const historyText = messages.map((m) => `${m.role === "user" ? "שאלה" : "תשובה קודמת"}: ${m.text}`).join("\n\n");
    const input = `דרישות המשרה:\n${jobDescription}\n\nתוצאות הסריקה המלאות (${entries.length} נסרקו בסך הכול, ${entries.filter(e => e.included).length} עברו את סף הציון 60):\n${entriesText || "לא נמצאו תוצאות"}\n\n--- השיחה עם המשתמש ---\n${historyText}`;

    const result = await generateStructured<{ reply: string }>({
      operation: "scan_chat",
      instructions,
      input,
      schemaName: "scan_chat",
      jsonSchema: chatSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "שיח על תוצאות סריקת מועמדים",
      subjectType: "job",
      subjectId: jobId,
      subjectLabel: `${job.title} · ${job.client}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ reply: result.data.reply });
  } catch (error) {
    console.error("scan-candidates/chat error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
