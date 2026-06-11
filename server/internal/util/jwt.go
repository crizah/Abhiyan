package util

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// InviteClaims defines the payload for an email invite link
type InviteClaims struct {
	Email string `json:"email"`
	OrgID string `json:"org_id"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

// GenerateAccessToken creates the token used for standard API authentication
func GenerateAccessToken(userID, orgID, role string, email string, secret []byte, duration time.Duration) (string, error) {
	// We use MapClaims here to match the middleware you already wrote perfectly
	claims := jwt.MapClaims{
		"sub":    userID,
		"org_id": orgID,
		"role":   role,
		"email":  email,
		"exp":    time.Now().Add(duration).Unix(),
		"iat":    time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

type TokenPayload struct {
	UserID string
	OrgID  string
	Role   string
	Email  string
}

func VerifyAccessToken(tokenString string, secret []byte) (*TokenPayload, error) {
	// 1. Parse and validate the token string
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Ensure the token was signed with the expected algorithm (HMAC)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})

	if err != nil {
		return nil, err
	}

	// 2. Extract and cast the claims
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {

		// Safely cast the interface{} values back to strings
		userID, _ := claims["sub"].(string)
		orgID, _ := claims["org_id"].(string)
		role, _ := claims["role"].(string)
		email, _ := claims["email"].(string)

		return &TokenPayload{
			UserID: userID,
			OrgID:  orgID,
			Role:   role,
			Email:  email,
		}, nil
	}

	return nil, errors.New("invalid token claims")
}

// GenerateInviteToken creates the token sent in the welcome email
func GenerateInviteToken(email, orgID, role string, secret []byte, duration time.Duration) (string, error) {
	claims := InviteClaims{
		Email: email,
		OrgID: orgID,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// ParseInviteToken validates the invite link token and extracts the email/org
func ParseInviteToken(tokenStr string, secret []byte) (*InviteClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &InviteClaims{}, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*InviteClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid invite token")
}
