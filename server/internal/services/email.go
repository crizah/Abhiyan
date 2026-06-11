package services

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
)

type EmailService struct {
	sesClient *ses.Client
	sender    string
}

func NewEmailService(ctx context.Context, senderEmail string) (*EmailService, error) {
	// Loads AWS credentials automatically from standard ENV variables
	// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS config: %v", err)
	}

	return &EmailService{
		sesClient: ses.NewFromConfig(cfg),
		sender:    senderEmail, // e.g., "no-reply@yourdomain.com"
	}, nil
}

// SendInviteEmail is the function Onion app worker will call
func (es *EmailService) SendInviteEmail(ctx context.Context, recipientEmail, inviteLink string) error {
	subject := "You've been invited to join the Workspace"
	htmlBody := fmt.Sprintf(`
		<h2>Welcome!</h2>
		<p>An admin has invited you to join the team workspace.</p>
		<p>Click the link below to set up your account and password:</p>
		<a href="%s" style="display:inline-block;padding:10px 20px;background-color:#1677ff;color:#ffffff;text-decoration:none;border-radius:5px;">Accept Invite</a>
		<p>This link expires in 48 hours.</p>
	`, inviteLink)

	input := &ses.SendEmailInput{
		Source: aws.String(es.sender),
		Destination: &types.Destination{
			ToAddresses: []string{recipientEmail},
		},
		Message: &types.Message{
			Subject: &types.Content{
				Data: aws.String(subject),
			},
			Body: &types.Body{
				Html: &types.Content{
					Data: aws.String(htmlBody),
				},
			},
		},
	}

	_, err := es.sesClient.SendEmail(ctx, input)
	return err
}
