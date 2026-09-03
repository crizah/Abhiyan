CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE , -- e.g., 'mnc-corp.com' to validate user emails
    -- make domain nullable
    attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    -- Recurring rule: Saturdays & Sundays are non-working days when true.
    -- Separate from one-off org_holidays (below), which are individual dates.
    weekends_off BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One-off holiday dates configured by a super admin, per org. On these dates
-- (and, separately, weekends when organizations.weekends_off is true),
-- attendance is neither taken nor batch-marked absent — it reports as
-- 'not_applicable', the same status already used for attendance-disabled orgs.
CREATE TABLE IF NOT EXISTS org_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, date)
);

CREATE INDEX idx_org_holidays_org_id ON org_holidays(org_id);