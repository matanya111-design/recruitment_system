CREATE TABLE "candidate_scans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"scanned" integer NOT NULL,
	"results_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "photo_content_type" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "photo_uploaded_at" timestamp with time zone;