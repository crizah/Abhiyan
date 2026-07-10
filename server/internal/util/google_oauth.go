package util

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

// GoogleIDClaims is the payload of a Google Sign-In ID token (the
// "credential" produced by Google Identity Services on the frontend).
type GoogleIDClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	jwt.RegisteredClaims
}

type googleJWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

var (
	googleKeysMu      sync.RWMutex
	googleKeysCache   map[string]*rsa.PublicKey
	googleKeysFetched time.Time
)

// googleKeyByID returns Google's RSA public key for the given key id,
// fetching/caching https://www.googleapis.com/oauth2/v3/certs as needed.
// Google rotates these keys infrequently, so we only refetch when the
// cache is stale or a kid shows up that we haven't seen yet.
func googleKeyByID(kid string) (*rsa.PublicKey, error) {
	googleKeysMu.RLock()
	key, ok := googleKeysCache[kid]
	stale := time.Since(googleKeysFetched) > time.Hour
	googleKeysMu.RUnlock()

	if ok && !stale {
		return key, nil
	}

	keys, err := fetchGoogleKeys()
	if err != nil {
		if ok {
			// Google's endpoint is briefly unreachable but we still have a
			// (stale) key for this kid - prefer that over hard-failing logins.
			return key, nil
		}
		return nil, err
	}

	key, ok = keys[kid]
	if !ok {
		return nil, errors.New("unknown google signing key id")
	}
	return key, nil
}

func fetchGoogleKeys() (map[string]*rsa.PublicKey, error) {
	resp, err := http.Get(googleJWKSURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetching google jwks: unexpected status %d", resp.StatusCode)
	}

	var set struct {
		Keys []googleJWK `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, err
	}

	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		if k.Kty != "RSA" || k.N == "" || k.E == "" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(new(big.Int).SetBytes(eBytes).Int64()),
		}
	}

	googleKeysMu.Lock()
	googleKeysCache = keys
	googleKeysFetched = time.Now()
	googleKeysMu.Unlock()

	return keys, nil
}

// VerifyGoogleIDToken checks the signature, audience and issuer of a Google
// Sign-In ID token and returns its claims. clientID must match the OAuth 2.0
// Web Client ID configured in Google Cloud Console for this app.
func VerifyGoogleIDToken(tokenStr, clientID string) (*GoogleIDClaims, error) {
	claims := &GoogleIDClaims{}

	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("token missing kid header")
		}
		return googleKeyByID(kid)
	},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(clientID),
	)
	if err != nil {
		return nil, err
	}

	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return nil, errors.New("unexpected token issuer")
	}
	if !claims.EmailVerified {
		return nil, errors.New("google email not verified")
	}

	return claims, nil
}
