CREATE TABLE IF NOT EXISTS face_validation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | valid | invalid
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
