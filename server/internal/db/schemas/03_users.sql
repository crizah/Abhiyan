CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    status user_status DEFAULT 'INVITED',
    first_name TEXT,
    last_name TEXT,
    email_id TEXT UNIQUE NOT NULL,
    face_s3_uri TEXT,
    phone_number TEXT ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_org_id ON users(org_id);

-- Isolated security table for authentication data
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL, -- Contains both salt and hash via Argon2id/bcrypt
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 3. NEW: System Roles Junction Table (Multi-role support)
-- This allows user X to be BOTH a Super Admin and an Admin
--
-- Role is scoped per-org (multi-org membership) — a person can hold a
-- different role in each org they belong to, so org_id is part of the key.
CREATE TABLE IF NOT EXISTS user_system_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role system_role NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, org_id, role)
);

-- Multi-org membership: a person (one shared identity/credentials/profile in
-- `users` above) can belong to several organizations. Role (user_system_roles)
-- and membership status are both bounded per-org via this table instead of
-- the single users.org_id/users.status columns, which are being phased out
-- once every read path has moved over (see the migration note above).
CREATE TABLE IF NOT EXISTS org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status user_status NOT NULL DEFAULT 'INVITED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, org_id)
);

CREATE INDEX idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships(org_id);