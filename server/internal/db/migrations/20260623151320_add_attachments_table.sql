-- Modify "users" table
ALTER TABLE "public"."users" ALTER COLUMN "phone_number" SET NOT NULL;
-- Create "attachments" table
CREATE TABLE "public"."attachments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NULL,
  "task_update_id" uuid NULL,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size_bytes" bigint NULL,
  "uploaded_by" uuid NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "attachments_task_update_id_fkey" FOREIGN KEY ("task_update_id") REFERENCES "public"."task_updates" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_attachment_link" CHECK ((task_id IS NOT NULL) OR (task_update_id IS NOT NULL))
);
-- Create index "idx_attachments_task_id" to table: "attachments"
CREATE INDEX "idx_attachments_task_id" ON "public"."attachments" ("task_id");
-- Create index "idx_attachments_update_id" to table: "attachments"
CREATE INDEX "idx_attachments_update_id" ON "public"."attachments" ("task_update_id");
