package util

import "github.com/google/uuid"

// ParseUUID safely converts a string to a uuid.UUID.
// If the string is invalid, it returns uuid.Nil (a zeroed UUID).
func ParseUUID(id string) uuid.UUID {
	parsed, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil
	}
	return parsed
}
