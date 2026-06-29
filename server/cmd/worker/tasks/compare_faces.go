package tasks

import (
	"context"
	"fmt"
	"log"

	"github.com/crizah/Abhiyan/server/internal/services"
)

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
