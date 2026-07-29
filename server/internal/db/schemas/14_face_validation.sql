CREATE TABLE IF NOT EXISTS face_validation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | valid | invalid
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_face_validation_jobs_user_id ON face_validation_jobs(user_id);
