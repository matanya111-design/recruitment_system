import { getDb } from "@/db/client";
import { appUsers, aiInstructions } from "@/db/schema";
import { instructionDefinitions } from "@/lib/ai/instructions";
import { JOB_PARSING_INSTRUCTIONS, CV_EXTRACTION_INSTRUCTIONS, INTERVIEW_SUMMARY_INSTRUCTIONS } from "@/lib/ai/prompts";
import { EVALUATION_INSTRUCTIONS, POST_INTERVIEW_EVALUATION_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { TEAM_MEETING_SUMMARY_INSTRUCTIONS, TEAM_JOB_MATCH_INSTRUCTIONS, TEAM_MEMBER_ANALYSIS_INSTRUCTIONS, TEAM_EXTRACT_PROFILE_INSTRUCTIONS } from "@/lib/ai/team-prompts";
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

  const defaults: Record<string, string> = {
    candidate_evaluation: EVALUATION_INSTRUCTIONS,
    post_interview_evaluation: POST_INTERVIEW_EVALUATION_INSTRUCTIONS,
    job_parsing: JOB_PARSING_INSTRUCTIONS,
    cv_extraction: CV_EXTRACTION_INSTRUCTIONS,
    interview_summary: INTERVIEW_SUMMARY_INSTRUCTIONS,
    team_meeting_summary: TEAM_MEETING_SUMMARY_INSTRUCTIONS,
    team_job_match: TEAM_JOB_MATCH_INSTRUCTIONS,
    team_member_analysis: TEAM_MEMBER_ANALYSIS_INSTRUCTIONS,
    team_extract_profile: TEAM_EXTRACT_PROFILE_INSTRUCTIONS,
  };

  for (const def of instructionDefinitions) {
    await db
      .insert(aiInstructions)
      .values({
        key: def.key,
        title: def.title,
        description: def.description,
        content: defaults[def.key],
      })
      .onConflictDoNothing();

    // Update non-custom instructions if content changed
    await db.execute(
      sql`UPDATE ai_instructions SET title=${def.title}, description=${def.description}, content=${defaults[def.key]}, updated_at=now()
          WHERE key=${def.key} AND is_custom=false AND content<>${defaults[def.key]}`,
    );
  }

  bootstrapped = true;
}
