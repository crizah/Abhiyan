-- name: InsertTranscription :exec
INSERT INTO transcriptions (attachment_id) VALUES ($1);

-- name: GetPendingTranscriptions :many
SELECT t.id, t.attachment_id, a.file_url
FROM transcriptions t
JOIN attachments a ON t.attachment_id = a.id
WHERE t.status = 'PENDING'
LIMIT 10
FOR UPDATE OF t SKIP LOCKED;

-- name: SetTranscriptionProcessing :exec
UPDATE transcriptions SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1;

-- name: CompleteTranscription :exec
UPDATE transcriptions SET status = 'COMPLETED', transcript_text = $2, updated_at = NOW() WHERE id = $1;

-- name: FailTranscription :exec
UPDATE transcriptions SET status = 'FAILED', error_message = $2, updated_at = NOW() WHERE id = $1;

-- name: GetTranscriptionByAttachmentID :one
SELECT id, status, transcript_text, error_message
FROM transcriptions
WHERE attachment_id = $1;

-- name: GetTranscriptionsByAttachmentIDs :many
SELECT attachment_id, status, transcript_text
FROM transcriptions
WHERE attachment_id = ANY($1::uuid[]);
