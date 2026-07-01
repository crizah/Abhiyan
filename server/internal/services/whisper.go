package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strconv"
	"time"
)

type WhisperService struct {
	apiKey string
}

func NewWhisperService() *WhisperService {
	return &WhisperService{
		apiKey: os.Getenv("OPENAI_API_KEY"),
	}
}

type whisperResponse struct {
	Text string `json:"text"`
}

const whisperMaxRetries = 5

func (w *WhisperService) Transcribe(ctx context.Context, audioData []byte, filename string) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(audioData); err != nil {
		return "", fmt.Errorf("failed to write audio data: %w", err)
	}

	writer.WriteField("model", "whisper-1")
	writer.WriteField("response_format", "json")
	writer.Close()

	contentType := writer.FormDataContentType()
	bodyBytes := body.Bytes()

	var respBody []byte
	var statusCode int

	for attempt := 0; attempt <= whisperMaxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/audio/transcriptions", bytes.NewReader(bodyBytes))
		if err != nil {
			return "", fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+w.apiKey)
		req.Header.Set("Content-Type", contentType)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("whisper API request failed: %w", err)
		}

		statusCode = resp.StatusCode
		respBody, err = io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return "", fmt.Errorf("failed to read response: %w", err)
		}

		if statusCode != http.StatusTooManyRequests {
			break
		}

		if attempt == whisperMaxRetries {
			return "", fmt.Errorf("whisper API error (status %d): %s", statusCode, string(respBody))
		}

		wait := retryAfterDelay(resp.Header.Get("Retry-After"), attempt)
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	if statusCode != http.StatusOK {
		return "", fmt.Errorf("whisper API error (status %d): %s", statusCode, string(respBody))
	}

	var result whisperResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse whisper response: %w", err)
	}

	return result.Text, nil
}

// retryAfterDelay honors the API's Retry-After header (in seconds) when present,
// otherwise falls back to exponential backoff: 1s, 2s, 4s, 8s, 16s.
func retryAfterDelay(retryAfterHeader string, attempt int) time.Duration {
	if secs, err := strconv.Atoi(retryAfterHeader); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	return time.Duration(1<<attempt) * time.Second
}
