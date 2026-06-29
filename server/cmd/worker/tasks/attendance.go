package tasks

import (
	"context"
	"fmt"
	"log"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
)

func NewBatchInsertAttendanceTask(queries *db.Queries) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		log.Println("[Attendance] Inserting absent records for active users in attendance-enabled orgs")

		err := queries.BatchInsertAbsentAttendance(ctx)
		if err != nil {
			return nil, fmt.Errorf("batch insert attendance: %w", err)
		}

		log.Println("[Attendance] Batch insert complete")
		return "done", nil
	}
}

func NewCompareFacesTask(
	attendanceService *services.AttendanceService,
	rekognitionService *services.RekognitionService,
) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		attendanceID, _ := args["attendance_id"].(string)
		sourceKey, _ := args["source_object_key"].(string)
		targetKey, _ := args["target_object_key"].(string)

		log.Printf("[CompareFaces] Job %s: comparing %s vs %s\n", attendanceID, sourceKey, targetKey)

		matched, err := rekognitionService.CompareFaces(ctx, sourceKey, targetKey)
		if err != nil {
			// Rekognition errors (no face, bad quality) → unmatched, marked absent
			_ = attendanceService.SetResult(ctx, attendanceID, false, "unmatched")
			return nil, fmt.Errorf("compare faces: %w", err)
		}

		status := "matched"
		if !matched {
			status = "unmatched"
		}

		if err := attendanceService.SetResult(ctx, attendanceID, matched, status); err != nil {
			return nil, fmt.Errorf("failed to save attendance result: %w", err)
		}

		log.Printf("[CompareFaces] Job %s: %s\n", attendanceID, status)
		return status, nil
	}
}

func NewValidateFaceTask(
	faceValidation *services.FaceValidationService,
	rekognitionService *services.RekognitionService,
) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		jobID, _ := args["job_id"].(string)
		objectKey, _ := args["object_key"].(string)

		log.Printf("[FaceValidator] Processing job %s (key: %s)\n", jobID, objectKey)

		valid, reason, err := rekognitionService.ValidateFace(ctx, objectKey)
		if err != nil {
			_ = faceValidation.SetResult(ctx, jobID, "invalid", "detection_error")
			return nil, fmt.Errorf("rekognition error: %w", err)
		}

		status := "valid"
		if !valid {
			status = "invalid"
		}

		if err := faceValidation.SetResult(ctx, jobID, status, reason); err != nil {
			return nil, fmt.Errorf("failed to save validation result: %w", err)
		}

		log.Printf("[FaceValidator] Job %s: %s (%s)\n", jobID, status, reason)
		return status, nil
	}
}
