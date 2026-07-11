package util

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// GoogleIDClaims is the verified payload returned after validating a Google
// Sign-In credential (ID token) against Google's tokeninfo endpoint.
type GoogleIDClaims struct {
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"` // "true"/"false" string in tokeninfo response
	Name          string `json:"name"`
	Audience      string `json:"aud"`
	Issuer        string `json:"iss"`
}

var googleHTTPClient = &http.Client{Timeout: 8 * time.Second}

// VerifyGoogleIDToken sends the ID token to Google's tokeninfo endpoint and
// returns the verified claims. Google performs all signature/expiry checking
// server-side; we only need to confirm the audience matches our Client ID.
//
// Using tokeninfo (vs local JWKS verification) avoids the cold-start timeout
// issue where the initial outbound connection to Google's key endpoint hangs
// indefinitely on Lambda with Go's no-timeout default HTTP client.
func VerifyGoogleIDToken(ctx context.Context, tokenStr, clientID string) (*GoogleIDClaims, error) {
	url := "https://oauth2.googleapis.com/tokeninfo?id_token=" + tokenStr

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := googleHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google tokeninfo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("invalid google credential")
	}

	var claims GoogleIDClaims
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return nil, err
	}

	if claims.Audience != clientID {
		return nil, errors.New("google token audience mismatch")
	}

	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return nil, errors.New("unexpected google token issuer")
	}

	if claims.EmailVerified != "true" {
		return nil, errors.New("google email not verified")
	}

	return &claims, nil
}
