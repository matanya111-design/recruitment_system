import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const appUsers = pgTable("app_users", {
  email: text("email").primaryKey(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  title: text("title").notNull(),
  client: text("client").notNull(),
  status: text("status").notNull().default("פעילה"),
  description: text("description").notNull().default(""),
  mustRequirements: text("must_requirements").notNull().default(""),
  preferredRequirements: text("preferred_requirements").notNull().default(""),
  technologies: jsonb("technologies").notNull().default(sql`'[]'::jsonb`),
  minYears: integer("min_years"),
  professionalEmphasis: text("professional_emphasis").notNull().default(""),
  personalityEmphasis: text("personality_emphasis").notNull().default(""),
  internalNotes: text("internal_notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  professionalTitle: text("professional_title").notNull().default(""),
  company: text("company").notNull().default(""),
  yearsExperience: integer("years_experience"),
  technologies: jsonb("technologies").notNull().default(sql`'[]'::jsonb`),
  experienceSummary: text("experience_summary").notNull().default(""),
  recruiterOpinion: text("recruiter_opinion").notNull().default(""),
  cvKey: text("cv_key"),
  cvFilename: text("cv_filename"),
  cvContentType: text("cv_content_type"),
  cvSize: bigint("cv_size", { mode: "number" }),
  cvPages: integer("cv_pages"),
  cvExtractedText: text("cv_extracted_text").notNull().default(""),
  cvExtractionStatus: text("cv_extraction_status").notNull().default("לא הועלה"),
  cvUploadedAt: timestamp("cv_uploaded_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    candidateId: bigserial("candidate_id", { mode: "number" }).notNull().references(() => candidates.id, { onDelete: "cascade" }),
    jobId: bigserial("job_id", { mode: "number" }).notNull().references(() => jobs.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("חדש"),
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    interviewSummary: text("interview_summary").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    nextActionDate: date("next_action_date"),
    score: integer("score"),
    recommendation: text("recommendation").notNull().default("טרם הוערך"),
    evaluationType: text("evaluation_type").notNull().default("ראשונית"),
    evaluationDate: timestamp("evaluation_date", { withTimezone: true }),
    evaluationJson: jsonb("evaluation_json"),
    evaluationFeedback: text("evaluation_feedback").notNull().default(""),
    proposedEngineRule: text("proposed_engine_rule").notNull().default(""),
    engineRuleStatus: text("engine_rule_status").notNull().default("ללא הצעה"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.candidateId, t.jobId)],
);

export const aiActivityLogs = pgTable("ai_activity_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actionType: text("action_type").notNull(),
  subjectType: text("subject_type").notNull().default(""),
  subjectId: integer("subject_id"),
  subjectLabel: text("subject_label").notNull().default(""),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiInstructions = pgTable("ai_instructions", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  content: text("content").notNull(),
  isCustom: boolean("is_custom").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationRules = pgTable("evaluation_rules", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ruleText: text("rule_text").notNull().unique(),
  sourceApplicationId: integer("source_application_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
