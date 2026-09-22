CREATE TABLE "ai_activity_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action_type" text NOT NULL,
	"subject_type" text DEFAULT '' NOT NULL,
	"subject_id" integer,
	"subject_label" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_instructions" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidate_id" bigserial NOT NULL,
	"job_id" bigserial NOT NULL,
	"status" text DEFAULT 'חדש' NOT NULL,
	"interview_date" timestamp with time zone,
	"interview_summary" text DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"next_action_date" date,
	"score" integer,
	"recommendation" text DEFAULT 'טרם הוערך' NOT NULL,
	"evaluation_type" text DEFAULT 'ראשונית' NOT NULL,
	"evaluation_date" timestamp with time zone,
	"evaluation_json" jsonb,
	"evaluation_feedback" text DEFAULT '' NOT NULL,
	"proposed_engine_rule" text DEFAULT '' NOT NULL,
	"engine_rule_status" text DEFAULT 'ללא הצעה' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_candidate_id_job_id_unique" UNIQUE("candidate_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"professional_title" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"years_experience" integer,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_summary" text DEFAULT '' NOT NULL,
	"recruiter_opinion" text DEFAULT '' NOT NULL,
	"cv_key" text,
	"cv_filename" text,
	"cv_content_type" text,
	"cv_size" bigserial NOT NULL,
	"cv_pages" integer,
	"cv_extracted_text" text DEFAULT '' NOT NULL,
	"cv_extraction_status" text DEFAULT 'לא הועלה' NOT NULL,
	"cv_uploaded_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rule_text" text NOT NULL,
	"source_application_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_rules_rule_text_unique" UNIQUE("rule_text")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"client" text NOT NULL,
	"status" text DEFAULT 'פעילה' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"must_requirements" text DEFAULT '' NOT NULL,
	"preferred_requirements" text DEFAULT '' NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_years" integer,
	"professional_emphasis" text DEFAULT '' NOT NULL,
	"personality_emphasis" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;