-- Modify "reminders" table
ALTER TABLE "public"."reminders" ADD COLUMN "is_system_spawned" boolean NOT NULL DEFAULT false;
