-- Modify "organizations" table
ALTER TABLE "public"."organizations" ADD COLUMN "attendance_enabled" boolean NOT NULL DEFAULT false;
-- Create "face_validation_jobs" table
CREATE TABLE "public"."face_validation_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "reason" text NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
