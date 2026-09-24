ALTER TABLE "applications" ADD COLUMN "pre_human_decision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pre_human_decision_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "pre_human_decision_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_human_decision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_human_decision_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "post_human_decision_date" timestamp with time zone;