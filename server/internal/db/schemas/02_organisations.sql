CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE , -- e.g., 'mnc-corp.com' to validate user emails
    -- make domain nullable
    created_at TIMESTAMPTZ DEFAULT NOW()
);