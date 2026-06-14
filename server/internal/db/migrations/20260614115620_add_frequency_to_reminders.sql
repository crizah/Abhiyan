-- Create enum type "recurrence_unit"
CREATE TYPE "public"."recurrence_unit" AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS');
-- Modify "reminders" table
ALTER TABLE "public"."reminders" ADD CONSTRAINT "valid_recurrence" CHECK (((recurrence_value IS NULL) AND (recurrence_unit IS NULL)) OR ((recurrence_value > 0) AND (recurrence_unit IS NOT NULL))), ADD COLUMN "recurrence_value" integer NULL, ADD COLUMN "recurrence_unit" "public"."recurrence_unit" NULL;
