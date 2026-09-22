-- Create "app_kv" table
CREATE TABLE "public"."app_kv" (
  "key" text NOT NULL,
  "value" text NOT NULL DEFAULT '',
  "count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  PRIMARY KEY ("key")
);
-- Create index "idx_app_kv_expires_at" to table: "app_kv"
CREATE INDEX "idx_app_kv_expires_at" ON "public"."app_kv" ("expires_at");
