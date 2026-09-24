ALTER TABLE "candidates" ALTER COLUMN "cv_size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "cv_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "interview_raw_material" text DEFAULT '' NOT NULL;