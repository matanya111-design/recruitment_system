import { getDb } from "@/db/client";
import { aiInstructions } from "@/db/schema";
import { eq } from "drizzle-orm";

// Admin-editable override lookup ("הוראות AI" settings page) — every route that calls an AI
// prompt should go through this so editing a prompt there actually takes effect everywhere it's used.
export async function getPrompt(key: string, fallback: string): Promise<string> {
  try {
    const db = getDb();
    const [row] = await db.select({ content: aiInstructions.content }).from(aiInstructions).where(eq(aiInstructions.key, key));
    return row?.content ?? fallback;
  } catch {
    return fallback;
  }
}
