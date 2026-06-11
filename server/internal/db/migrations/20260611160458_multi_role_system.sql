-- Create enum type "system_role"
CREATE TYPE "public"."system_role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EMPLOYEE');
-- Create enum type "team_role_enum"
CREATE TYPE "public"."team_role_enum" AS ENUM ('TEAM_ADMIN', 'MEMBER');
-- Modify "team_members" table
ALTER TABLE "public"."team_members" ADD COLUMN "team_role" "public"."team_role_enum" NOT NULL DEFAULT 'MEMBER', ADD COLUMN "joined_at" timestamptz NULL DEFAULT now();
-- Modify "teams" table
ALTER TABLE "public"."teams" DROP COLUMN "admin_id";
-- Modify "users" table
ALTER TABLE "public"."users" DROP COLUMN "role";
-- Create "user_system_roles" table
CREATE TABLE "public"."user_system_roles" (
  "user_id" uuid NOT NULL,
  "role" "public"."system_role" NOT NULL,
  "granted_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "role"),
  CONSTRAINT "user_system_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Drop enum type "user_role"
DROP TYPE "public"."user_role";
