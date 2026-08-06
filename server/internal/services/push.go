package services

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

type PushInterface interface {
	SendPush(ctx context.Context, token string, title string, body string) error
}

// PushService sends Android push notifications via Firebase Cloud Messaging.
type PushService struct {
	client *messaging.Client
}

// NewPushService builds a PushService from a Firebase service-account JSON
// credential. If credentialsJSON is empty, it returns a PushService with no
// client rather than erroring — the worker can still start up and enqueue
// push tasks before Firebase is configured; only the actual send fails,
// visible per-task in the Onion dashboard instead of taking down the process.
func NewPushService(ctx context.Context, credentialsJSON string) (*PushService, error) {
	if credentialsJSON == "" {
		return &PushService{}, nil
	}

	app, err := firebase.NewApp(ctx, nil, option.WithAuthCredentialsJSON(option.ServiceAccount, []byte(credentialsJSON)))
	if err != nil {
		return nil, fmt.Errorf("failed to init firebase app: %w", err)
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to init fcm messaging client: %w", err)
	}

	return &PushService{client: client}, nil
}

func (p *PushService) SendPush(ctx context.Context, token string, title string, body string) error {
	if p.client == nil {
		return fmt.Errorf("push service not configured: FCM_SERVICE_ACCOUNT_JSON not set")
	}

	_, err := p.client.Send(ctx, &messaging.Message{
		Token: token,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
	})
	return err
}

// IsUnregisteredToken reports whether err indicates the token is no longer
// valid (app uninstalled, token rotated), so its device_tokens row can be
// cleaned up.
func IsUnregisteredToken(err error) bool {
	return messaging.IsUnregistered(err)
}
