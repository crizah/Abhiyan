-- Sanity checks for the multi-org membership backfill
-- (migrations/20260727175131_multi_org_membership.sql).
-- Every query should return 0 in its "problem" column / matching counts.

\echo '--- 1. Every user should have exactly one org_memberships row (no more, no fewer, right after the backfill) ---'
SELECT
  (SELECT COUNT(*) FROM users)            AS total_users,
  (SELECT COUNT(*) FROM org_memberships)  AS total_memberships,
  (SELECT COUNT(*) FROM users) - (SELECT COUNT(*) FROM org_memberships) AS difference_should_be_zero;

\echo '--- 2. No user_system_roles row should be missing its org_id ---'
SELECT COUNT(*) AS rows_missing_org_id
FROM user_system_roles
WHERE org_id IS NULL;

\echo '--- 3. Every user_system_roles row should point at a real org_memberships row for that same user+org ---'
SELECT COUNT(*) AS orphaned_role_rows
FROM user_system_roles usr
LEFT JOIN org_memberships om
  ON om.user_id = usr.user_id AND om.org_id = usr.org_id
WHERE om.user_id IS NULL;

\echo '--- 4. Every org_memberships row should carry over the same status the user had before the migration ---'
SELECT COUNT(*) AS status_mismatches
FROM org_memberships om
JOIN users u ON u.id = om.user_id
WHERE om.org_id = u.org_id AND om.status IS DISTINCT FROM u.status;

\echo '--- 5. user_system_roles primary key should now be (user_id, org_id, role) ---'
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'user_system_roles'::regclass AND contype = 'p';

\echo 'Done. Rows 1-4 above should all show zero problems; row 5 should show org_id in the key.'
