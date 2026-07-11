CREATE TYPE audio_transcode_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS audio_transcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID NOT NULL UNIQUE REFERENCES attachments(id) ON DELETE CASCADE,

    status audio_transcode_status DEFAULT 'PENDING',
    transcoded_file_url TEXT,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audio_transcodes_status ON audio_transcodes(status);
