import { EVALUATION_INSTRUCTIONS, POST_INTERVIEW_EVALUATION_INSTRUCTIONS, CANDIDATE_SCAN_INSTRUCTIONS, INTERVIEW_QUESTIONS_INSTRUCTIONS, EVALUATION_CHAT_INSTRUCTIONS } from "@/lib/ai/evaluation-prompt";
import { JOB_PARSING_INSTRUCTIONS, CV_EXTRACTION_INSTRUCTIONS, INTERVIEW_SUMMARY_INSTRUCTIONS, EMAIL_CHAT_INSTRUCTIONS, GENERAL_AI_INSTRUCTIONS, JOB_REFINE_INSTRUCTIONS } from "@/lib/ai/prompts";
import { TEAM_MEETING_SUMMARY_INSTRUCTIONS, TEAM_INSIGHT_INSTRUCTIONS, TEAM_EXTRACT_PROFILE_INSTRUCTIONS, TEAM_PROMOTE_INSTRUCTIONS } from "@/lib/ai/team-prompts";

// Single source of truth for "what is the default text of each editable prompt" — keyed exactly
// like instructionDefinitions in lib/ai/instructions.ts. Both the DB seeding (lib/auth/bootstrap.ts)
// and the admin "reset to default" / validation logic (app/api/recruiting/route.ts) read this same
// map, so they can't drift out of sync with each other the way three separate copies did before.
export const PROMPT_DEFAULTS: Record<string, string> = {
  candidate_evaluation: EVALUATION_INSTRUCTIONS,
  post_interview_evaluation: POST_INTERVIEW_EVALUATION_INSTRUCTIONS,
  job_parsing: JOB_PARSING_INSTRUCTIONS,
  cv_extraction: CV_EXTRACTION_INSTRUCTIONS,
  interview_summary: INTERVIEW_SUMMARY_INSTRUCTIONS,
  team_meeting_summary: TEAM_MEETING_SUMMARY_INSTRUCTIONS,
  team_insight: TEAM_INSIGHT_INSTRUCTIONS,
  team_extract_profile: TEAM_EXTRACT_PROFILE_INSTRUCTIONS,
  candidate_scan: CANDIDATE_SCAN_INSTRUCTIONS,
  interview_questions: INTERVIEW_QUESTIONS_INSTRUCTIONS,
  evaluation_chat: EVALUATION_CHAT_INSTRUCTIONS,
  email_chat: EMAIL_CHAT_INSTRUCTIONS,
  general_ai: GENERAL_AI_INSTRUCTIONS,
  job_refine: JOB_REFINE_INSTRUCTIONS,
  team_promote: TEAM_PROMOTE_INSTRUCTIONS,
};
