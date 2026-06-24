package tasks

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Onion/app"
	"github.com/google/uuid"
)

func NewPollPendingTranscriptionsTask(queries *db.Queries, onionApp *app.App) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		log.Println("[Transcription Poller] Scanning for pending transcriptions")

		pending, err := queries.GetPendingTranscriptions(ctx)
		if err != nil {
			log.Printf("[Transcription Poller] ERROR: %v\n", err)
			return nil, fmt.Errorf("failed to fetch pending transcriptions: %w", err)
		}

		if len(pending) == 0 {
			log.Println("[Transcription Poller] 0 pending transcriptions.")
			return "No pending transcriptions", nil
		}

		log.Printf("[Transcription Poller] Found %d pending. Dispatching.\n", len(pending))

		for _, t := range pending {
			_ = queries.SetTranscriptionProcessing(ctx, t.ID)

			err := onionApp.Enqueue(ctx, "transcribe_audio", map[string]any{
				"transcription_id": t.ID.String(),
				"attachment_id":    t.AttachmentID.String(),
				"file_url":         t.FileUrl,
			})
			if err != nil {
				log.Printf("[Transcription Poller] Failed to enqueue %s: %v\n", t.ID, err)
				errMsg := err.Error()
				_ = queries.FailTranscription(ctx, db.FailTranscriptionParams{
					ID:           t.ID,
					ErrorMessage: sql.NullString{String: errMsg, Valid: true},
				})
			}
		}

		return fmt.Sprintf("Dispatched %d transcriptions", len(pending)), nil
	}
}

func NewTranscribeAudioTask(queries *db.Queries, s3Service *services.S3Service, whisperService *services.WhisperService) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		transcriptionIDStr, _ := args["transcription_id"].(string)
		fileURL, _ := args["file_url"].(string)

		tID, err := uuid.Parse(transcriptionIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid transcription_id: %w", err)
		}

		log.Printf("[Transcriber] Processing %s\n", tID)

		audioData, err := s3Service.DownloadFile(ctx, fileURL)
		if err != nil {
			errMsg := fmt.Sprintf("S3 download failed: %v", err)
			queries.FailTranscription(ctx, db.FailTranscriptionParams{ID: tID, ErrorMessage: sql.NullString{String: errMsg, Valid: true}})
			return nil, fmt.Errorf("%s", errMsg)
		}

		text, err := whisperService.Transcribe(ctx, audioData, "recording.webm")
		if err != nil {
			errMsg := fmt.Sprintf("Whisper API failed: %v", err)
			queries.FailTranscription(ctx, db.FailTranscriptionParams{ID: tID, ErrorMessage: sql.NullString{String: errMsg, Valid: true}})
			return nil, fmt.Errorf("%s", errMsg)
		}

		err = queries.CompleteTranscription(ctx, db.CompleteTranscriptionParams{ID: tID, TranscriptText: sql.NullString{String: text, Valid: true}})
		if err != nil {
			return nil, fmt.Errorf("failed to save transcription: %w", err)
		}

		log.Printf("[Transcriber] Completed %s (%d chars)\n", tID, len(text))
		return "Transcription complete", nil
	}
}
