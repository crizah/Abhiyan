-- Modify "notifications" table
ALTER TABLE "public"."notifications" ADD COLUMN "task_id" uuid NULL, ADD COLUMN "card_kind" character varying(16) NULL, ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
