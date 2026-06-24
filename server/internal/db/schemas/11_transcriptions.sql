CREATE TABLE IF NOT EXISTS transcriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID NOT NULL UNIQUE REFERENCES attachments(id) ON DELETE CASCADE,

    status transcription_status DEFAULT 'PENDING',
    transcript_text TEXT,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcriptions_status ON transcriptions(status);
