-- Create enum type "user_role"
CREATE TYPE "public"."user_role" AS ENUM ('SUPERADMIN', 'ADMIN', 'EMPLOYEE', 'DEFAULT');
-- Create enum type "task_status"
CREATE TYPE "public"."task_status" AS ENUM ('OPEN', 'CLOSED');
-- Create enum type "task_fulfillment_status"
CREATE TYPE "public"."task_fulfillment_status" AS ENUM ('PENDING', 'COMPLETED');
-- Create enum type "participant_role"
CREATE TYPE "public"."participant_role" AS ENUM ('ASSIGNEE', 'SUBSCRIBER');
-- Create enum type "reminder_channel"
CREATE TYPE "public"."reminder_channel" AS ENUM ('WHATSAPP', 'EMAIL');
-- Create enum type "reminder_status"
CREATE TYPE "public"."reminder_status" AS ENUM ('PENDING', 'SENT', 'CANCELLED');
-- Create "organizations" table
CREATE TABLE "public"."organizations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "organizations_domain_key" UNIQUE ("domain")
);
-- Create "users" table
CREATE TABLE "public"."users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NULL,
  "email_id" text NOT NULL,
  "phone_number" text NOT NULL,
  "role" "public"."user_role" NULL DEFAULT 'DEFAULT',
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "users_email_id_key" UNIQUE ("email_id"),
  CONSTRAINT "users_phone_number_key" UNIQUE ("phone_number"),
  CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_users_org_id" to table: "users"
CREATE INDEX "idx_users_org_id" ON "public"."users" ("org_id");
-- Create "teams" table
CREATE TABLE "public"."teams" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "admin_id" uuid NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "teams_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_teams_org_id" to table: "teams"
CREATE INDEX "idx_teams_org_id" ON "public"."teams" ("org_id");
-- Create "tasks" table
CREATE TABLE "public"."tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL,
  "title" character varying(255) NOT NULL,
  "description" text NULL,
  "status" "public"."task_status" NULL DEFAULT 'OPEN',
  "fulfillment_status" "public"."task_fulfillment_status" NULL DEFAULT 'PENDING',
  "created_by" uuid NOT NULL,
  "due_date" timestamptz NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT "tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_tasks_status" to table: "tasks"
CREATE INDEX "idx_tasks_status" ON "public"."tasks" ("status");
-- Create index "idx_tasks_team_id" to table: "tasks"
CREATE INDEX "idx_tasks_team_id" ON "public"."tasks" ("team_id");
-- Create "reminders" table
CREATE TABLE "public"."reminders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "channel" "public"."reminder_channel" NOT NULL,
  "status" "public"."reminder_status" NULL DEFAULT 'PENDING',
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_reminders_status_scheduled" to table: "reminders"
CREATE INDEX "idx_reminders_status_scheduled" ON "public"."reminders" ("status", "scheduled_at");
-- Create "task_participants" table
CREATE TABLE "public"."task_participants" (
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "public"."participant_role" NOT NULL,
  PRIMARY KEY ("task_id", "user_id", "role"),
  CONSTRAINT "task_participants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "task_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "task_updates" table
CREATE TABLE "public"."task_updates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "user_id" uuid NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "task_updates_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "task_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
);
-- Create "team_members" table
CREATE TABLE "public"."team_members" (
  "team_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  PRIMARY KEY ("team_id", "user_id"),
  CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "user_credentials" table
CREATE TABLE "public"."user_credentials" (
  "user_id" uuid NOT NULL,
  "password_hash" text NOT NULL,
  "updated_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("user_id"),
  CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
