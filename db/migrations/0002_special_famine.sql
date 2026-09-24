ALTER TABLE "applications" ADD COLUMN "pre_evaluation_json" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pre_score" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pre_recommendation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pre_evaluation_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_evaluation_json" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_score" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_recommendation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_evaluation_date" timestamp with time zone;