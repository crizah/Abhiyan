-- Create "org_memberships" table
CREATE TABLE "public"."org_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "status" "public"."user_status" NOT NULL DEFAULT 'INVITED',
  "created_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "org_memberships_user_id_org_id_key" UNIQUE ("user_id", "org_id"),
  CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_org_memberships_org_id" to table: "org_memberships"
CREATE INDEX "idx_org_memberships_org_id" ON "public"."org_memberships" ("org_id");
-- Create index "idx_org_memberships_user_id" to table: "org_memberships"
CREATE INDEX "idx_org_memberships_user_id" ON "public"."org_memberships" ("user_id");
-- Modify "user_system_roles" table: add org_id nullable first — the table
-- may already have rows, so it can't take a NOT NULL column with no default.
ALTER TABLE "public"."user_system_roles" ADD COLUMN "org_id" uuid NULL CONSTRAINT "user_system_roles_org_id_fkey" REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;

-- Backfill: every existing user has exactly one org today (users.org_id),
-- so that's the source of truth for both the new table and column.
INSERT INTO "public"."org_memberships" ("user_id", "org_id", "status")
SELECT "id", "org_id", "status" FROM "public"."users";

UPDATE "public"."user_system_roles" SET "org_id" = (
  SELECT "org_id" FROM "public"."users" WHERE "users"."id" = "user_system_roles"."user_id"
);

-- Now that every row has a value, lock the column and key down for real.
ALTER TABLE "public"."user_system_roles" DROP CONSTRAINT "user_system_roles_pkey", ALTER COLUMN "org_id" SET NOT NULL, ADD PRIMARY KEY ("user_id", "org_id", "role");
