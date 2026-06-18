CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    channel reminder_channel NOT NULL,
    status reminder_status DEFAULT 'PENDING',
    recurrence_value INT DEFAULT NULL,
    recurrence_unit recurrence_unit DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_system_spawned BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT valid_recurrence CHECK (
        (recurrence_value IS NULL AND recurrence_unit IS NULL) OR
        (recurrence_value > 0 AND recurrence_unit IS NOT NULL)
    )
);

CREATE INDEX idx_reminders_status_scheduled ON reminders(status, scheduled_at);