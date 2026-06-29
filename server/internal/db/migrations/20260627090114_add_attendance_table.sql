-- Create "attendance_record" table
CREATE TABLE "public"."attendance_record" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "target_file_uri" text NULL,
  "present" boolean NULL,
  "attendance_date" date NULL DEFAULT CURRENT_DATE,
  "created_at" timestamptz NULL DEFAULT now(),
  "updated_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "attendance_record_user_id_attendance_date_key" UNIQUE ("user_id", "attendance_date"),
  CONSTRAINT "attendance_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
