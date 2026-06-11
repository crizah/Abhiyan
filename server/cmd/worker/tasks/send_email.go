package tasks

import (
	"context"
	"fmt"

	"github.com/crizah/Abhiyan/server/internal/services"
)

// NewSendInviteEmailTask acts as a constructor to inject the EmailService dependency
func NewSendInviteEmailTask(emailService *services.EmailService) func(context.Context, map[string]any) (any, error) {

	// This returned function is what Onion will actually execute
	return func(ctx context.Context, args map[string]any) (any, error) {

		// 1. Extract arguments safely to prevent panics
		email, ok := args["email"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'email' argument")
		}
		link, ok := args["link"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'link' argument")
		}

		fmt.Printf("Attempting to send invite email to %s...\n", email)

		// 2. AWS SES
		err := emailService.SendInviteEmail(ctx, email, link)
		if err != nil {
			fmt.Printf("Failed to send email to %s: %v\n", email, err)
			return nil, err
		}

		fmt.Printf("Successfully sent invite email to %s\n", email)
		return "Email sent successfully", nil
	}
}
