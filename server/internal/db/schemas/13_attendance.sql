CREATE TABLE IF NOT EXISTS attendance_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_file_uri TEXT,
    present BOOLEAN,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | matched | unmatched
    attendance_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, org_id, attendance_date)
);

CREATE INDEX idx_attendance_record_org_id ON attendance_record(org_id);