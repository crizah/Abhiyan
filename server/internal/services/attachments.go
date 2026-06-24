package services

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type S3Service struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucketName    string
	region        string
}

func NewS3Service(ctx context.Context) (*S3Service, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	presignClient := s3.NewPresignClient(client)

	return &S3Service{
		client:        client,
		presignClient: presignClient,
		bucketName:    os.Getenv("AWS_S3_BUCKET_NAME"),
		region:        os.Getenv("AWS_REGION"),
	}, nil
}

// GeneratePresignedURL returns the URL to upload to, and the final public URL
func (s *S3Service) GeneratePresignedURL(ctx context.Context, originalFilename string) (string, string, error) {
	// 1. Create a unique key so files with the same name don't overwrite each other
	uniqueID := uuid.New().String()
	objectKey := fmt.Sprintf("uploads/%s-%s", uniqueID, originalFilename)

	// 2. Ask AWS for the temporary upload URL (valid for 15 minutes)
	request, err := s.presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})

	if err != nil {
		return "", "", fmt.Errorf("failed to generate presigned url: %w", err)
	}

	// 3. Construct the final URL where the file will permanently live
	finalFileURL := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", s.bucketName, s.region, objectKey)

	return request.URL, finalFileURL, nil
}

func (s *S3Service) DeleteObjects(ctx context.Context, fileURLs []string) {
	for _, fileURL := range fileURLs {
		key := s.extractKeyFromURL(fileURL)
		if key == "" {
			continue
		}
		s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.bucketName),
			Key:    aws.String(key),
		})
	}
}

func (s *S3Service) extractKeyFromURL(fileURL string) string {
	parsed, err := url.Parse(fileURL)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(parsed.Path, "/")
}
