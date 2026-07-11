-- name: InsertAudioTranscode :exec
INSERT INTO audio_transcodes (attachment_id) VALUES ($1) ON CONFLICT (attachment_id) DO NOTHING;

-- name: GetPendingAudioTranscodes :many
SELECT t.id, t.attachment_id, a.file_url, a.file_type
FROM audio_transcodes t
JOIN attachments a ON t.attachment_id = a.id
WHERE t.status = 'PENDING'
LIMIT 10
FOR UPDATE OF t SKIP LOCKED;

-- name: SetAudioTranscodeProcessing :exec
UPDATE audio_transcodes SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1;

-- name: CompleteAudioTranscode :exec
UPDATE audio_transcodes SET status = 'COMPLETED', transcoded_file_url = $2, updated_at = NOW() WHERE id = $1;

-- name: FailAudioTranscode :exec
UPDATE audio_transcodes SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1;
