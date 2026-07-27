package tasks

import (
	"context"
	"fmt"

	"github.com/crizah/Abhiyan/server/internal/services"
)

func NewSendReminderWhatsappTask(whatsappService *services.WhatsappService) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {

		// 1. Extract arguments safely to prevent panics
		n, ok := args["rPN"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'rPN' argument")
		}

		taskName, ok := args["taskName"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'taskName' argument")
		}

		taskDeadline, ok := args["taskDeadline"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'taskDeadline' argument")

		}

		fmt.Printf("Attempting to send reminder whatsapp to %s...\n", n)

		err := whatsappService.SendReminderWhatsapp(ctx, n, taskName, taskDeadline)
		if err != nil {
			fmt.Printf("Failed to send whatsapp to %s: %v\n", n, err)
			return nil, err
		}

		fmt.Printf("Successfully sent reminder whatsapp to %s\n", n)
		return "whatsapp sent successfully", nil
	}
}

func NewSendTaskStatusWhatsappTask(whatsappService *services.WhatsappService) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {

		// 1. Extract arguments safely to prevent panics
		n, ok := args["rPN"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'rPN' argument")
		}

		taskName, ok := args["taskName"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'taskName' argument")
		}

		status, ok := args["status"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'status' argument")
		}

		fmt.Printf("Attempting to send task status whatsapp to %s...\n", n)

		err := whatsappService.SendTaskStatusWhatsapp(ctx, n, taskName, status)
		if err != nil {
			fmt.Printf("Failed to send whatsapp to %s: %v\n", n, err)
			return nil, err
		}

		fmt.Printf("Successfully sent task status whatsapp to %s\n", n)
		return "whatsapp sent successfully", nil
	}
}
