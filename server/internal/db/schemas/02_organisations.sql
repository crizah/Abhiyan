CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL, -- e.g., 'mnc-corp.com' to validate user emails
    created_at TIMESTAMPTZ DEFAULT NOW()
);