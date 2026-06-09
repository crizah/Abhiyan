CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    channel reminder_channel NOT NULL,
    status reminder_status DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_status_scheduled ON reminders(status, scheduled_at);