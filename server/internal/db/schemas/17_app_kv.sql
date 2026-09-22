CREATE TABLE IF NOT EXISTS app_kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    count      INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_app_kv_expires_at ON app_kv (expires_at);
