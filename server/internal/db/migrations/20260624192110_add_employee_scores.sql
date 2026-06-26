-- Create enum type "score_event_type"
CREATE TYPE "public"."score_event_type" AS ENUM ('ON_TIME_COMPLETION', 'LATE_COMPLETION', 'MISSED_DEADLINE', 'REJECTION');
-- Create "employee_scores" table
CREATE TABLE "public"."employee_scores" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "team_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "event_type" "public"."score_event_type" NOT NULL,
  "points_awarded" integer NOT NULL DEFAULT 0,
  "due_date_snapshot" timestamptz NULL,
  "event_at" timestamptz NOT NULL DEFAULT now(),
  "superseded" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "employee_scores_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "employee_scores_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "employee_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "employee_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_scores_task_user_active" to table: "employee_scores"
CREATE INDEX "idx_scores_task_user_active" ON "public"."employee_scores" ("task_id", "user_id") WHERE (superseded = false);
-- Create index "idx_scores_task_user_missed" to table: "employee_scores"
CREATE UNIQUE INDEX "idx_scores_task_user_missed" ON "public"."employee_scores" ("task_id", "user_id") WHERE ((event_type = 'MISSED_DEADLINE'::public.score_event_type) AND (superseded = false));
-- Create index "idx_scores_team_leaderboard" to table: "employee_scores"
CREATE INDEX "idx_scores_team_leaderboard" ON "public"."employee_scores" ("team_id", "user_id", "points_awarded") WHERE (superseded = false);
-- Create index "idx_scores_user_breakdown" to table: "employee_scores"
CREATE INDEX "idx_scores_user_breakdown" ON "public"."employee_scores" ("user_id", "event_type") WHERE (superseded = false);
-- Create "team_leaderboard_settings" table
CREATE TABLE "public"."team_leaderboard_settings" (
  "team_id" uuid NOT NULL,
  "leaderboard_visible" boolean NOT NULL DEFAULT false,
  "updated_by" uuid NULL,
  "updated_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("team_id"),
  CONSTRAINT "team_leaderboard_settings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "team_leaderboard_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
);
