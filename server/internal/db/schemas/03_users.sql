CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status user_status DEFAULT 'INVITED',
    first_name TEXT,
    last_name TEXT,
    email_id TEXT UNIQUE NOT NULL,
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
CREATE TABLE IF NOT EXISTS user_system_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role system_role NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);