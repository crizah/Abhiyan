CREATE TABLE IF NOT EXISTS task_update_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_update_id UUID NOT NULL REFERENCES task_updates(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);