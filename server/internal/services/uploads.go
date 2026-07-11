package services

import (
	"bytes"
	"context"
	"fmt"
	"io"
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
func (s *S3Service) GeneratePresignedURL(ctx context.Context, originalFilename string, fileType string) (string, string, string, error) {
	// 1. Create a unique key so files with the same name don't overwrite each other
	uniqueID := uuid.New().String()
	var objectKey string
	if fileType == "targets" {

		// if attendance record, target bucket
		objectKey = fmt.Sprintf("targets/%s-%s", uniqueID, originalFilename)

	} else if fileType == "sources" {
		objectKey = fmt.Sprintf("sources/%s-%s", uniqueID, originalFilename)
	} else {
		objectKey = fmt.Sprintf("uploads/%s-%s", uniqueID, originalFilename)
	}

	// 2. Ask AWS for the temporary upload URL (valid for 15 minutes)
	request, err := s.presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})

	if err != nil {
		return "", "", "", fmt.Errorf("failed to generate presigned url: %w", err)
	}

	// 3. Construct the final URL where the file will permanently live.
	return request.URL, s.buildFileURL(objectKey), objectKey, nil
}

// buildFileURL constructs the permanent public URL for an object key. Built via
// url.URL (not fmt.Sprintf) so characters like '#', '?', '%' and spaces in the
// filename are percent-encoded and round-trip cleanly back through extractKeyFromURL.
func (s *S3Service) buildFileURL(objectKey string) string {
	finalURL := url.URL{
		Scheme: "https",
		Host:   fmt.Sprintf("%s.s3.%s.amazonaws.com", s.bucketName, s.region),
		Path:   "/" + objectKey,
	}
	return finalURL.String()
}

// UploadBytes writes data directly to S3 under objectKey and returns the
// permanent public URL, symmetric to DownloadByKey.
func (s *S3Service) UploadBytes(ctx context.Context, objectKey string, data []byte, contentType string) (string, error) {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucketName),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}
	return s.buildFileURL(objectKey), nil
}

// GeneratePresignedGetURL returns a temporary, signed URL for reading an object.
func (s *S3Service) GeneratePresignedGetURL(ctx context.Context, objectKey string) (string, error) {
	request, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 1 * time.Hour
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned get url: %w", err)
	}
	return request.URL, nil
}

// PresignFileURL extracts the object key from a stored file URL and returns a
// presigned GET URL for it. Falls back to the original URL if the key can't
// be extracted or presigning fails, so callers never see a broken link.
func (s *S3Service) PresignFileURL(ctx context.Context, fileURL string) string {
	key := s.extractKeyFromURL(fileURL)
	if key == "" {
		return fileURL
	}
	signedURL, err := s.GeneratePresignedGetURL(ctx, key)
	if err != nil {
		return fileURL
	}
	return signedURL
}

func (s *S3Service) DeleteObjects(ctx context.Context, fileURLs []string) {
	// TODO: chnage this to use objetKey since we are returning that now
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

func (s *S3Service) DownloadFile(ctx context.Context, fileURL string) ([]byte, error) {
	// TODO: chnage this to use objetKey since we are returning that now
	key := s.extractKeyFromURL(fileURL)
	if key == "" {
		return nil, fmt.Errorf("could not extract key from URL: %s", fileURL)
	}
	return s.DownloadByKey(ctx, key)
}

func (s *S3Service) DownloadByKey(ctx context.Context, objectKey string) ([]byte, error) {
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to download from S3: %w", err)
	}
	defer result.Body.Close()

	data, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read S3 object body: %w", err)
	}
	return data, nil
}

func (s *S3Service) extractKeyFromURL(fileURL string) string {
	parsed, err := url.Parse(fileURL)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(parsed.Path, "/")
}
