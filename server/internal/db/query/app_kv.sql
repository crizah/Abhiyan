-- name: RateLimitHit :one
INSERT INTO app_kv (key, count, expires_at)
VALUES ($1, 1, NOW() + make_interval(secs => $2))
ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN app_kv.expires_at <= NOW() THEN 1 ELSE app_kv.count + 1 END,
    expires_at = CASE WHEN app_kv.expires_at <= NOW() THEN NOW() + make_interval(secs => $2) ELSE app_kv.expires_at END
RETURNING count, expires_at;

-- name: SetKV :exec
INSERT INTO app_kv (key, value, expires_at)
VALUES ($1, $2, NOW() + make_interval(secs => $3))
ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = NOW() + make_interval(secs => $3);

-- name: GetKV :one
SELECT value FROM app_kv WHERE key = $1 AND expires_at > NOW();

-- name: DeleteExpiredKV :exec
DELETE FROM app_kv WHERE expires_at < NOW() - interval '1 hour';
