package tasks

import (
	"context"
	"fmt"
	"log"

	"github.com/crizah/Abhiyan/server/internal/services"
)

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
