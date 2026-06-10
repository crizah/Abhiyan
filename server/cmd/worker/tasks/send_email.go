package tasks

import (
	"context"
	"fmt"
)

// SendInviteEmail is the actual Go function that Onion will execute
func SendInviteEmailTask(ctx context.Context, args map[string]any) (any, error) {
	email := args["email"].(string)
	link := args["invite_link"].(string)

	fmt.Printf("Attempting to send email to %s...\n", email)
	fmt.Printf("Link: %s\n", link)

	// TODO: actually send the email via SES or smth

	return "Email sent successfully", nil
}
