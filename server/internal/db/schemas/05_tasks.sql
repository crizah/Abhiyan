CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status DEFAULT 'OPEN',
    fulfillment_status task_fulfillment_status DEFAULT 'PENDING',
    review_status task_review_status NOT NULL DEFAULT 'UNSUBMITTED',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_team_id ON tasks(team_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- Junction table for Assignees and Subscribers (In-Loop)
CREATE TABLE IF NOT EXISTS task_participants (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role participant_role NOT NULL,
    PRIMARY KEY (task_id, user_id, role)
);