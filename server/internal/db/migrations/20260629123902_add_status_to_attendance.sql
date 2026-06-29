-- Modify "attendance_record" table
ALTER TABLE "public"."attendance_record" ADD COLUMN "status" text NOT NULL DEFAULT 'pending';
