-- Modify "notifications" table: add org_id nullable first, no populated
-- table can take a NOT NULL column with no default in one step.
ALTER TABLE "public"."notifications" ADD COLUMN "org_id" uuid NULL CONSTRAINT "notifications_org_id_fkey" REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;

-- Backfill: every existing row predates multi-org, so it was generated for
-- that user's one org at the time.
UPDATE "public"."notifications" SET "org_id" = (
    SELECT "org_id" FROM "public"."users" WHERE "users"."id" = "notifications"."user_id"
) WHERE "org_id" IS NULL;

-- Lock down.
ALTER TABLE "public"."notifications" ALTER COLUMN "org_id" SET NOT NULL;

-- Create index "idx_notifications_org_id" to table: "notifications"
CREATE INDEX "idx_notifications_org_id" ON "public"."notifications" ("org_id");
