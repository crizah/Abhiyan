-- Create enum type "user_status"
CREATE TYPE "public"."user_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');
-- Modify "users" table
ALTER TABLE "public"."users" ADD COLUMN "status" "public"."user_status" NULL DEFAULT 'INVITED';
