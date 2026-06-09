package util

import (
	"golang.org/x/crypto/bcrypt"
)

// HashPassword generates a bcrypt hash with a baked-in salt
func HashPassword(password string) (string, error) {
	// bcrypt.DefaultCost is 10, which is standard. Increase to 12 or 14 for higher security.
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword compares a plaintext password against the stored database hash
func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
