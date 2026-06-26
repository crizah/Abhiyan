-- Modify "attachments" table
ALTER TABLE "public"."attachments" DROP CONSTRAINT "chk_attachment_link", ADD CONSTRAINT "chk_attachment_link" CHECK ((task_id IS NOT NULL) OR (task_update_id IS NOT NULL) OR (task_comment_id IS NOT NULL));
