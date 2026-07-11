-- Create enum type "audio_transcode_status"
CREATE TYPE "public"."audio_transcode_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
-- Create "audio_transcodes" table
CREATE TABLE "public"."audio_transcodes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "attachment_id" uuid NOT NULL,
  "status" "public"."audio_transcode_status" NULL DEFAULT 'PENDING',
  "transcoded_file_url" text NULL,
  "error_message" text NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  "updated_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "audio_transcodes_attachment_id_key" UNIQUE ("attachment_id"),
  CONSTRAINT "audio_transcodes_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_audio_transcodes_status" to table: "audio_transcodes"
CREATE INDEX "idx_audio_transcodes_status" ON "public"."audio_transcodes" ("status");
