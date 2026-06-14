-- Create enum type "task_review_status"
CREATE TYPE "public"."task_review_status" AS ENUM ('UNSUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');
-- Modify "tasks" table
ALTER TABLE "public"."tasks" ADD COLUMN "review_status" "public"."task_review_status" NOT NULL DEFAULT 'UNSUBMITTED';
