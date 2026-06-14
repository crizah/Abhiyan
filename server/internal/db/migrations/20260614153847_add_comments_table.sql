-- Create "task_update_comments" table
CREATE TABLE "public"."task_update_comments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_update_id" uuid NOT NULL,
  "user_id" uuid NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "task_update_comments_task_update_id_fkey" FOREIGN KEY ("task_update_id") REFERENCES "public"."task_updates" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "task_update_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
);
