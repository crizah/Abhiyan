-- Create enum type "attendance_fulfillment_status"
CREATE TYPE "public"."attendance_fulfillment_status" AS ENUM ('FULL_DAY', 'HALF_DAY');
-- Modify "attendance_record" table
ALTER TABLE "public"."attendance_record" ADD COLUMN "fulfillment" "public"."attendance_fulfillment_status" NULL;
