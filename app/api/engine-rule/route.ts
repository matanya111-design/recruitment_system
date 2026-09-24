import { getDb } from "@/db/client";
import { requireAppIdentity } from "@/lib/auth/identity";
import { writeAudit } from "@/lib/audit";
import { generateStructured, estimateCost, isAiConfigured } from "@/lib/ai/provider";
import { getPrompt } from "@/lib/ai/get-prompt";
import { RULE_MERGE_INSTRUCTIONS, ruleMergeSchema } from "@/lib/ai/rule-merge-prompt";
import { aiActivityLogs, applications, aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";

type ChatMessage = { role: "user" | "assistant"; text: string };

// Approving a learned rule used to just append its raw text to the end of the relevant prompt.
// This instead asks the AI to integrate it into the existing prompt text (resolving contradictions
// with what's already there) and shows the user exactly what would change before anything is saved.
export async function POST(request: Request) {
  const identity = await requireAppIdentity();
  if (identity instanceof Response) return identity;
  try {
    const body = (await request.json()) as {
      applicationId?: number;
      action?: "propose" | "apply";
      messages?: ChatMessage[];
      mergedContent?: string;
    };
    const { applicationId, action } = body;
    if (!applicationId) return Response.json({ error: "חסר מזהה מועמדות" }, { status: 400 });

    const db = getDb();
    const [app] = await db
      .select({ proposedEngineRule: applications.proposedEngineRule, proposedEngineRuleKey: applications.proposedEngineRuleKey })
      .from(applications)
      .where(eq(applications.id, applicationId));
    if (!app?.proposedEngineRule) return Response.json({ error: "לא נמצאה הצעה" }, { status: 404 });
    const targetKey = app.proposedEngineRuleKey || "candidate_evaluation";

    if (action === "apply") {
      const mergedContent = String(body.mergedContent ?? "").trim();
      if (mergedContent.length < 50) return Response.json({ error: "תוכן הפרומפט המוצע קצר מדי" }, { status: 400 });
      await db.update(aiInstructions).set({ content: mergedContent, isCustom: true, updatedAt: new Date() }).where(eq(aiInstructions.key, targetKey));
      await db.update(applications).set({ engineRuleStatus: "אושר ככלל קבוע", updatedAt: new Date() }).where(eq(applications.id, applicationId));
      await writeAudit({ actorEmail: identity.email, action: "engine_rule_approve", entityType: "application", entityId: applicationId, after: { targetKey } });
      return Response.json({ ok: true });
    }

    // action === "propose": generate (or refine) a merge proposal, without saving anything yet.
    if (!isAiConfigured()) return Response.json({ error: "מנוע ה-AI טרם הוגדר", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    const [inst] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, targetKey));
    const baseContent = inst?.content ?? "";
    const messages = body.messages ?? [];
    const historyText = messages.length
      ? `\n\n--- היסטוריית שיח על אופן השילוב (ההנחיה האחרונה גוברת) ---\n${messages.map((m) => `${m.role === "user" ? "הנחיה מהמשתמש" : "טיוטה קודמת (סיכום השינויים)"}: ${m.text}`).join("\n\n")}`
      : "";
    const input = `תוכן הפרומפט הקיים במלואו (מפתח: ${targetKey}):\n${baseContent}\n\nהכלל החדש שנלמד ממשוב מקצועי וצריך לשלב:\n${app.proposedEngineRule}${historyText}`;

    const result = await generateStructured<{ merged_content: string; changes_summary: string[] }>({
      operation: "engine_rule_merge",
      instructions: await getPrompt("engine_rule_merge", RULE_MERGE_INSTRUCTIONS),
      input,
      schemaName: "engine_rule_merge",
      jsonSchema: ruleMergeSchema,
      reasoningEffort: "medium",
    });

    const cost = estimateCost(result.model, result.usage);
    await db.insert(aiActivityLogs).values({
      actionType: "הצעת שילוב כלל שנלמד לפרומפט",
      subjectType: "application",
      subjectId: applicationId,
      subjectLabel: `מפתח פרומפט: ${targetKey}`,
      model: result.model,
      inputTokens: result.usage.input,
      cachedInputTokens: result.usage.cached,
      outputTokens: result.usage.output,
      estimatedCostUsd: String(cost),
    });

    return Response.json({ mergedContent: result.data.merged_content, changesSummary: result.data.changes_summary, targetKey });
  } catch (error) {
    console.error("engine-rule error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "שגיאה" }, { status: 500 });
  }
}
