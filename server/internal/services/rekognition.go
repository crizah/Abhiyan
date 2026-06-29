package services

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/rekognition"
	"github.com/aws/aws-sdk-go-v2/service/rekognition/types"
)

type RekognitionService struct {
	client     *rekognition.Client
	bucketName string
}

func NewRekognitionService(ctx context.Context) (*RekognitionService, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %w", err)
	}
	return &RekognitionService{
		client:     rekognition.NewFromConfig(cfg),
		bucketName: os.Getenv("AWS_S3_BUCKET_NAME"),
	}, nil
}

// ValidateFace calls DetectFaces referencing the S3 object directly — no local download needed.
// Returns (valid, reason, error). reason is empty when valid.
func (r *RekognitionService) ValidateFace(ctx context.Context, objectKey string) (bool, string, error) {
	result, err := r.client.DetectFaces(ctx, &rekognition.DetectFacesInput{
		Image: &types.Image{
			S3Object: &types.S3Object{
				Bucket: aws.String(r.bucketName),
				Name:   aws.String(objectKey),
			},
		},
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

func (r *RekognitionService) CompareFaces(ctx context.Context, sourceObjectKey string, targetObjectKey string) (bool, error) {
	// targets/{uuid}-face-{timestamp}.jpg
	// returns truw if >=80% similarity bw the faces
	result, err := r.client.CompareFaces(ctx, &rekognition.CompareFacesInput{
		SourceImage: &types.Image{
			S3Object: &types.S3Object{
				Bucket: aws.String(r.bucketName),
				Name:   aws.String(sourceObjectKey),
			},
		},
		TargetImage: &types.Image{
			S3Object: &types.S3Object{
				Bucket: aws.String(r.bucketName),
				Name:   aws.String(targetObjectKey),
			},
		},
		SimilarityThreshold: aws.Float32(80),
	})

	if err != nil {
		return false, err
	}

	return len(result.FaceMatches) > 0, nil
}
