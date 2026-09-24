import { getDb } from "@/db/client";
import { appUsers, aiInstructions } from "@/db/schema";
import { instructionDefinitions } from "@/lib/ai/instructions";
import { PROMPT_DEFAULTS } from "@/lib/ai/prompt-defaults";
import { sql } from "drizzle-orm";

let bootstrapped = false;

export async function bootstrap() {
  if (bootstrapped) return;

  const ownerEmail = process.env.APP_OWNER_EMAIL;
  if (!ownerEmail) return;

  // Mark bootstrapped only after success to allow retry on DB failure

  const db = getDb();

  // Ensure owner admin exists
  await db
    .insert(appUsers)
    .values({ email: ownerEmail.toLowerCase().trim(), role: "admin" })
    .onConflictDoNothing();

  for (const def of instructionDefinitions) {
    await db
      .insert(aiInstructions)
      .values({
        key: def.key,
        title: def.title,
        description: def.description,
        content: PROMPT_DEFAULTS[def.key],
      })
      .onConflictDoNothing();

    // Update non-custom instructions if content changed
    await db.execute(
      sql`UPDATE ai_instructions SET title=${def.title}, description=${def.description}, content=${PROMPT_DEFAULTS[def.key]}, updated_at=now()
          WHERE key=${def.key} AND is_custom=false AND content<>${PROMPT_DEFAULTS[def.key]}`,
    );
  }

  bootstrapped = true;
}
