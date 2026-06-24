CREATE TABLE IF NOT EXISTS employee_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type score_event_type NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    due_date_snapshot TIMESTAMPTZ,
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scores_team_leaderboard
    ON employee_scores(team_id, user_id, points_awarded)
    WHERE superseded = false;

CREATE INDEX idx_scores_user_breakdown
    ON employee_scores(user_id, event_type)
    WHERE superseded = false;

CREATE UNIQUE INDEX idx_scores_task_user_missed
    ON employee_scores(task_id, user_id)
    WHERE event_type = 'MISSED_DEADLINE' AND superseded = false;

CREATE INDEX idx_scores_task_user_active
    ON employee_scores(task_id, user_id)
    WHERE superseded = false;

CREATE TABLE IF NOT EXISTS team_leaderboard_settings (
    team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    leaderboard_visible BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
