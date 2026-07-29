package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/crizah/Abhiyan/server/internal/util"
)

type WhatsappService struct {
	accessToken string
	numberId    string
}

func NewWhatsappService(ctx context.Context, at string, bp string) *WhatsappService {

	return &WhatsappService{
		accessToken: at,
		numberId:    bp,
	}

}

func (w *WhatsappService) SendReminderWhatsapp(ctx context.Context, rPN string, taskName string, taskDeadline string) error {
	// this is only test code, not sending actual messages rn
	// 1. Parse the phone number
	formattedNumber := util.ParsePhoneNumber(rPN)

	// 2. Build the API URL
	url := fmt.Sprintf("https://graph.facebook.com/v17.0/%s/messages", w.numberId)

	// 3. Construct the JSON payload your custom template
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                formattedNumber,
		"type":              "template",
		"template": map[string]any{
			"name": "task_reminder",
			"language": map[string]string{
				"code": "en",
			},
			"components": []map[string]any{
				{
					"type": "body",
					"parameters": []map[string]string{
						{
							"type":           "text",
							"parameter_name": "task_name",
							"text":           taskName,
						},
						{
							"type":           "text",
							"parameter_name": "task_deadline",
							"text":           taskDeadline,
						},
					},
				},
			},
		},
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal whatsapp payload: %w", err)
	}

	// 4. Create the HTTP request, passing the context along
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+w.accessToken)
	req.Header.Set("Content-Type", "application/json")

	// 5. Execute the request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 6. Check for non-2xx success codes
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("whatsapp API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

func (w *WhatsappService) SendTaskStatusWhatsapp(ctx context.Context, rPN string, taskName string, status string) error {
	// this is only test code, not sending actual messages rn
	formattedNumber := util.ParsePhoneNumber(rPN)

	url := fmt.Sprintf("https://graph.facebook.com/v17.0/%s/messages", w.numberId)

	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                formattedNumber,
		"type":              "template",
		"template": map[string]any{
			"name": "action_task",
			"language": map[string]string{
				"code": "en",
			},
			"components": []map[string]any{
				{
					"type": "body",
					"parameters": []map[string]string{
						{
							"type":           "text",
							"parameter_name": "task_name",
							"text":           taskName,
						},
						{
							"type":           "text",
							"parameter_name": "status",
							"text":           status,
						},
					},
				},
			},
		},
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal whatsapp payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+w.accessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("whatsapp API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
