-- Create index "idx_notifications_user_id" to table: "notifications"
CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" ("user_id");
-- Create index "idx_reminders_task_id" to table: "reminders"
CREATE INDEX "idx_reminders_task_id" ON "public"."reminders" ("task_id");
-- Create index "idx_task_update_comments_task_update_id" to table: "task_update_comments"
CREATE INDEX "idx_task_update_comments_task_update_id" ON "public"."task_update_comments" ("task_update_id");
-- Create index "idx_task_update_comments_user_id" to table: "task_update_comments"
CREATE INDEX "idx_task_update_comments_user_id" ON "public"."task_update_comments" ("user_id");
-- Create index "idx_task_updates_task_id" to table: "task_updates"
CREATE INDEX "idx_task_updates_task_id" ON "public"."task_updates" ("task_id");
-- Create index "idx_task_updates_user_id" to table: "task_updates"
CREATE INDEX "idx_task_updates_user_id" ON "public"."task_updates" ("user_id");
-- Create index "idx_tasks_created_by" to table: "tasks"
CREATE INDEX "idx_tasks_created_by" ON "public"."tasks" ("created_by");
-- Create index "idx_tasks_due_date" to table: "tasks"
CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" ("due_date");
-- Create index "idx_tasks_review_status" to table: "tasks"
CREATE INDEX "idx_tasks_review_status" ON "public"."tasks" ("review_status");
-- Create index "idx_teams_name" to table: "teams"
CREATE INDEX "idx_teams_name" ON "public"."teams" ("name");
-- Create index "idx_users_status" to table: "users"
CREATE INDEX "idx_users_status" ON "public"."users" ("status");
