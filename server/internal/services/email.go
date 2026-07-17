package services

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/resend/resend-go/v3"
)

const (
	Tasksubject   = "Task Reminder!"
	Invitesubject = "You've been invited to join the Workspace"
	Resetsubject  = "Reset your password"
)

type EmailInterface interface {
	SendReminderEmail(ctx context.Context, recipientEmail string, taskName string, taskDeadline string) error
	SendInviteEmail(ctx context.Context, recipientEmail string, inviteLink string) error
	SendPasswordResetEmail(ctx context.Context, recipientEmail, resetLink string) error
	getBaseParam(recipientEmail string, subject string, html string) any
}
type EmailService struct {
	sesClient *ses.Client
	sender    string
}

type EmailServiceResend struct {
	resendClient *resend.Client
	sender       string
}

func NewEmailServiceResend(apiKey string, senderEmail string) *EmailServiceResend {

	client := resend.NewClient(apiKey)
	return &EmailServiceResend{
		resendClient: client,
		sender:       senderEmail,
	}
}

func (rs *EmailServiceResend) getBaseParam(recipientEmail string, subject string, html string) any {
	return &resend.SendEmailRequest{
		From:    rs.sender,
		To:      []string{recipientEmail},
		Subject: subject,
		Html:    html,
	}
}

func (rs *EmailServiceResend) SendReminderEmail(ctx context.Context,
	recipientEmail string, taskName string,
	taskDeadline string) error {

	htmlBody := fmt.Sprintf(`
		<h1>This is a reminder to complete you task %s. Please complete the given task before the deadline %s and submit for admin review.</h1>
	`, taskName, taskDeadline)

	params, ok := rs.getBaseParam(recipientEmail, Tasksubject, htmlBody).(*resend.SendEmailRequest)
	if !ok {
		return fmt.Errorf("expected *resend.SendEmailRequest, got %T", params)
	}

	_, err := rs.resendClient.Emails.SendWithContext(ctx, params)
	return err

}

func (rs *EmailServiceResend) SendInviteEmail(ctx context.Context, recipientEmail string, inviteLink string) error {
	htmlBody := fmt.Sprintf(`
		<h2>Welcome!</h2>
		<p>An admin has invited you to join the team workspace.</p>
		<p>Click the link below to set up your account and password:</p>
		<a href="%s" style="display:inline-block;padding:10px 20px;background-color:#1677ff;color:#ffffff;text-decoration:none;border-radius:5px;">Accept Invite</a>
		<p>This link expires in 48 hours.</p>
	`, inviteLink)

	params, ok := rs.getBaseParam(recipientEmail, Invitesubject, htmlBody).(*resend.SendEmailRequest)
	if !ok {
		return fmt.Errorf("expected *resend.SendEmailRequest, got %T", params)
	}
	_, err := rs.resendClient.Emails.SendWithContext(ctx, params)
	return err

}

func (rs *EmailServiceResend) SendPasswordResetEmail(ctx context.Context,
	recipientEmail string, resetLink string) error {
	htmlBody := fmt.Sprintf(`
		<h2>Password Reset Request</h2>
		<p>We received a request to reset your password. Click the link below to set a new one:</p>
		<a href="%s" style="display:inline-block;padding:10px 20px;background-color:#1677ff;color:#ffffff;text-decoration:none;border-radius:5px;">Reset Password</a>
		<p>This link expires in 15 minutes. If you did not request a reset, you can safely ignore this email.</p>
	`, resetLink)

	params, ok := rs.getBaseParam(recipientEmail, Resetsubject, htmlBody).(*resend.SendEmailRequest)
	if !ok {
		return fmt.Errorf("expected *resend.SendEmailRequest, got %T", params)
	}
	_, err := rs.resendClient.Emails.SendWithContext(ctx, params)
	return err

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

func (es *EmailService) getBaseParam(recipientEmail string, subject string, html string) any {
	return &ses.SendEmailInput{
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
					Data: aws.String(html),
				},
			},
		},
	}
}

func (es *EmailService) SendReminderEmail(ctx context.Context, recipientEmail string, taskName string, taskDeadline string) error {
	htmlBody := fmt.Sprintf(`
		<h1>This is a reminder to complete you task %s. Please complete the given task before the deadline %s and submit for admin review.</h1>
	`, taskName, taskDeadline)

	input, ok := es.getBaseParam(recipientEmail, Tasksubject, htmlBody).(*ses.SendEmailInput)
	if !ok {
		return fmt.Errorf("expected *ses.SendEmailRequest, got %T", input)

	}

	_, err := es.sesClient.SendEmail(ctx, input)
	return err

}

// SendInviteEmail is the function Onion app worker will call
func (es *EmailService) SendInviteEmail(ctx context.Context, recipientEmail, inviteLink string) error {

	htmlBody := fmt.Sprintf(`
		<h2>Welcome!</h2>
		<p>An admin has invited you to join the team workspace.</p>
		<p>Click the link below to set up your account and password:</p>
		<a href="%s" style="display:inline-block;padding:10px 20px;background-color:#1677ff;color:#ffffff;text-decoration:none;border-radius:5px;">Accept Invite</a>
		<p>This link expires in 48 hours.</p>
	`, inviteLink)

	input, ok := es.getBaseParam(recipientEmail, Invitesubject, htmlBody).(*ses.SendEmailInput)
	if !ok {
		return fmt.Errorf("expected *ses.SendEmailRequest, got %T", input)

	}

	_, err := es.sesClient.SendEmail(ctx, input)
	return err
}

func (es *EmailService) SendPasswordResetEmail(ctx context.Context, recipientEmail, resetLink string) error {

	htmlBody := fmt.Sprintf(`
		<h2>Password Reset Request</h2>
		<p>We received a request to reset your password. Click the link below to set a new one:</p>
		<a href="%s" style="display:inline-block;padding:10px 20px;background-color:#1677ff;color:#ffffff;text-decoration:none;border-radius:5px;">Reset Password</a>
		<p>This link expires in 15 minutes. If you did not request a reset, you can safely ignore this email.</p>
	`, resetLink)

	input, ok := es.getBaseParam(recipientEmail, Resetsubject, htmlBody).(*ses.SendEmailInput)
	if !ok {
		return fmt.Errorf("expected *ses.SendEmailRequest, got %T", input)

	}

	_, err := es.sesClient.SendEmail(ctx, input)
	return err
}
