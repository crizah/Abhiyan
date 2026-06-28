package services

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/rekognition"
	"github.com/aws/aws-sdk-go-v2/service/rekognition/types"
)

type RekognitionService struct {
	client *rekognition.Client
}

func NewRekognitionService(ctx context.Context) (*RekognitionService, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %w", err)
	}
	return &RekognitionService{client: rekognition.NewFromConfig(cfg)}, nil
}

// ValidateFace checks whether imageData contains a clear, registerable face.
// Returns (valid, reason, error). reason is empty string when valid.
func (r *RekognitionService) ValidateFace(ctx context.Context, imageData []byte) (bool, string, error) {
	result, err := r.client.DetectFaces(ctx, &rekognition.DetectFacesInput{
		Image:      &types.Image{Bytes: imageData},
		Attributes: []types.Attribute{types.AttributeAll},
	})
	if err != nil {
		return false, "detection_error", fmt.Errorf("rekognition DetectFaces: %w", err)
	}

	if len(result.FaceDetails) == 0 {
		return false, "no_face_detected", nil
	}

	face := result.FaceDetails[0]

	if face.Confidence != nil && *face.Confidence < 90 {
		return false, "low_confidence", nil
	}

	if face.Quality != nil {
		if face.Quality.Brightness != nil && *face.Quality.Brightness < 40 {
			return false, "low_brightness", nil
		}
		if face.Quality.Sharpness != nil && *face.Quality.Sharpness < 40 {
			return false, "low_sharpness", nil
		}
	}

	return true, "", nil
}
