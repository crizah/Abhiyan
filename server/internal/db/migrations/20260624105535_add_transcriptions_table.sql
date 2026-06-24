-- Create enum type "transcription_status"
CREATE TYPE "public"."transcription_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
-- Create "transcriptions" table
CREATE TABLE "public"."transcriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "attachment_id" uuid NOT NULL,
  "status" "public"."transcription_status" NULL DEFAULT 'PENDING',
  "transcript_text" text NULL,
  "error_message" text NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  "updated_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "transcriptions_attachment_id_key" UNIQUE ("attachment_id"),
  CONSTRAINT "transcriptions_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_transcriptions_status" to table: "transcriptions"
CREATE INDEX "idx_transcriptions_status" ON "public"."transcriptions" ("status");
