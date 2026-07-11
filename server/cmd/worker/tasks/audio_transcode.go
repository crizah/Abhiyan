package tasks

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Onion/app"
	"github.com/google/uuid"
)

// audioAlreadyCompatible reports whether fileType is already playable by every
// iOS browser (all of which use WebKit), so ffmpeg can be skipped entirely.
func audioAlreadyCompatible(fileType string) bool {
	return fileType == "audio/mp4" || fileType == "audio/mpeg" || fileType == "audio/aac"
}

func NewPollPendingAudioTranscodesTask(queries *db.Queries, onionApp *app.App) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		log.Println("[AudioTranscode Poller] Scanning for pending audio transcodes")

		pending, err := queries.GetPendingAudioTranscodes(ctx)
		if err != nil {
			log.Printf("[AudioTranscode Poller] ERROR: %v\n", err)
			return nil, fmt.Errorf("failed to fetch pending audio transcodes: %w", err)
		}

		if len(pending) == 0 {
			log.Println("[AudioTranscode Poller] 0 pending audio transcodes.")
			return "No pending audio transcodes", nil
		}

		log.Printf("[AudioTranscode Poller] Found %d pending. Dispatching.\n", len(pending))

		for _, t := range pending {
			_ = queries.SetAudioTranscodeProcessing(ctx, t.ID)

			err := onionApp.Enqueue(ctx, "transcode_audio", map[string]any{
				"transcode_id":  t.ID.String(),
				"attachment_id": t.AttachmentID.String(),
				"file_url":      t.FileUrl,
				"file_type":     t.FileType,
			})
			if err != nil {
				log.Printf("[AudioTranscode Poller] Failed to enqueue %s: %v\n", t.ID, err)
				errMsg := err.Error()
				_ = queries.FailAudioTranscode(ctx, db.FailAudioTranscodeParams{
					ID:           t.ID,
					ErrorMessage: sql.NullString{String: errMsg, Valid: true},
				})
			}
		}

		return fmt.Sprintf("Dispatched %d audio transcodes", len(pending)), nil
	}
}

func NewTranscodeAudioTask(queries *db.Queries, s3Service *services.S3Service) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		transcodeIDStr, _ := args["transcode_id"].(string)
		attachmentIDStr, _ := args["attachment_id"].(string)
		fileURL, _ := args["file_url"].(string)
		fileType, _ := args["file_type"].(string)

		tID, err := uuid.Parse(transcodeIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid transcode_id: %w", err)
		}

		fail := func(format string, a ...any) (any, error) {
			errMsg := fmt.Sprintf(format, a...)
			queries.FailAudioTranscode(ctx, db.FailAudioTranscodeParams{ID: tID, ErrorMessage: sql.NullString{String: errMsg, Valid: true}})
			return nil, fmt.Errorf("%s", errMsg)
		}

		log.Printf("[AudioTranscode] Processing %s\n", tID)

		// Already playable everywhere (e.g. recorded on Safari/iOS as mp4/aac) — no
		// need to touch it, just point playback at the original file.
		if audioAlreadyCompatible(fileType) {
			if err := queries.CompleteAudioTranscode(ctx, db.CompleteAudioTranscodeParams{ID: tID, TranscodedFileUrl: sql.NullString{String: fileURL, Valid: true}}); err != nil {
				return nil, fmt.Errorf("failed to save audio transcode: %w", err)
			}
			log.Printf("[AudioTranscode] %s already compatible, skipped ffmpeg\n", tID)
			return "Audio transcode skipped (already compatible)", nil
		}

		audioData, err := s3Service.DownloadFile(ctx, fileURL)
		if err != nil {
			return fail("S3 download failed: %v", err)
		}

		inFile, err := os.CreateTemp("", "audio-in-*")
		if err != nil {
			return fail("failed to create temp input file: %v", err)
		}
		defer os.Remove(inFile.Name())
		if _, err := inFile.Write(audioData); err != nil {
			inFile.Close()
			return fail("failed to write temp input file: %v", err)
		}
		inFile.Close()

		outPath := inFile.Name() + ".m4a"
		defer os.Remove(outPath)

		// Written to a seekable temp file (not piped) so ffmpeg's mp4 muxer can
		// produce a standard faststart file, which is what iOS <audio> needs.
		cmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-i", inFile.Name(), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4", outPath)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fail("ffmpeg transcode failed: %v: %s", err, string(output))
		}

		outData, err := os.ReadFile(outPath)
		if err != nil {
			return fail("failed to read transcoded output: %v", err)
		}

		objectKey := fmt.Sprintf("uploads/transcoded/%s.m4a", attachmentIDStr)
		transcodedURL, err := s3Service.UploadBytes(ctx, objectKey, outData, "audio/mp4")
		if err != nil {
			return fail("failed to upload transcoded audio: %v", err)
		}

		if err := queries.CompleteAudioTranscode(ctx, db.CompleteAudioTranscodeParams{ID: tID, TranscodedFileUrl: sql.NullString{String: transcodedURL, Valid: true}}); err != nil {
			return nil, fmt.Errorf("failed to save audio transcode: %w", err)
		}

		log.Printf("[AudioTranscode] Completed %s\n", tID)
		return "Audio transcode complete", nil
	}
}
