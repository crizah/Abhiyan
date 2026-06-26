-- Modify "attachments" table
ALTER TABLE "public"."attachments" ADD COLUMN "task_comment_id" uuid NULL, ADD CONSTRAINT "attachments_task_comment_id_fkey" FOREIGN KEY ("task_comment_id") REFERENCES "public"."task_update_comments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Create index "idx_attachments_comment_id" to table: "attachments"
CREATE INDEX "idx_attachments_comment_id" ON "public"."attachments" ("task_comment_id");
