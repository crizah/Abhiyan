-- Modify "attendance_record" table: add org_id nullable first, no populated
-- table can take a NOT NULL column with no default in one step.
ALTER TABLE "public"."attendance_record" ADD COLUMN "org_id" uuid NULL CONSTRAINT "attendance_record_org_id_fkey" REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;

-- Backfill: every existing row predates multi-org, so it was recorded under
-- that user's one org at the time.
UPDATE "public"."attendance_record" SET "org_id" = (
    SELECT "org_id" FROM "public"."users" WHERE "users"."id" = "attendance_record"."user_id"
) WHERE "org_id" IS NULL;

-- Lock down: swap the unique constraint to include org_id and require it.
ALTER TABLE "public"."attendance_record" DROP CONSTRAINT "attendance_record_user_id_attendance_date_key", ALTER COLUMN "org_id" SET NOT NULL, ADD CONSTRAINT "attendance_record_user_id_org_id_attendance_date_key" UNIQUE ("user_id", "org_id", "attendance_date");

-- Create index "idx_attendance_record_org_id" to table: "attendance_record"
CREATE INDEX "idx_attendance_record_org_id" ON "public"."attendance_record" ("org_id");

-- Modify "face_validation_jobs" table: add user_id nullable first, same reason.
ALTER TABLE "public"."face_validation_jobs" ADD COLUMN "user_id" uuid NULL CONSTRAINT "face_validation_jobs_user_id_fkey" REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;

-- Backfill: there's no stored reference to who created an old job, so match
-- best-effort against the face currently registered for each user.
UPDATE "public"."face_validation_jobs" SET "user_id" = (
    SELECT "id" FROM "public"."users" WHERE "users"."face_s3_uri" = "face_validation_jobs"."object_key"
) WHERE "user_id" IS NULL;

-- Anything left unmatched can't be attributed to anyone — these are stale,
-- already-resolved polling records with no downstream use, safe to drop.
DELETE FROM "public"."face_validation_jobs" WHERE "user_id" IS NULL;

ALTER TABLE "public"."face_validation_jobs" ALTER COLUMN "user_id" SET NOT NULL;

-- Create index "idx_face_validation_jobs_user_id" to table: "face_validation_jobs"
CREATE INDEX "idx_face_validation_jobs_user_id" ON "public"."face_validation_jobs" ("user_id");
