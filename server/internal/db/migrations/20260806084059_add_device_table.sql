-- Create "device_tokens" table
CREATE TABLE "public"."device_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "platform" text NOT NULL DEFAULT 'ANDROID',
  "fcm_token" text NOT NULL,
  "created_at" timestamptz NULL DEFAULT now(),
  "last_seen_at" timestamptz NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "device_tokens_fcm_token_key" UNIQUE ("fcm_token"),
  CONSTRAINT "device_tokens_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_device_tokens_user_org" to table: "device_tokens"
CREATE INDEX "idx_device_tokens_user_org" ON "public"."device_tokens" ("user_id", "org_id");
