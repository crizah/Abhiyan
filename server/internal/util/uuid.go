package util

import (
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

// IST is the business timezone all human-facing dates/times are displayed in,
// regardless of what timezone the DB connection or host happens to report
// times in (Postgres/lib-pq hand back times in whatever the session's
// TimeZone GUC is, which defaults to UTC on RDS).
var IST = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return time.FixedZone("IST", 5*60*60+30*60)
	}
	return loc
}()

// ParseUUID safely converts a string to a uuid.UUID.
// If the string is invalid, it returns uuid.Nil (a zeroed UUID).
func ParseUUID(id string) uuid.UUID {
	parsed, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil
	}
	return parsed
}

func ParsePhoneNumber(rawNumber string) string {
	// Strip any accidental leading/trailing spaces
	cleanNumber := strings.TrimSpace(rawNumber)

	// Prepend the 91 country code
	return "91" + cleanNumber
}

func FormatDeadline(nt sql.NullTime) string {
	if !nt.Valid {
		return "No deadline set"
	}

	// Convert to IST before formatting — the value read from the DB is
	// otherwise in whatever timezone the Postgres session reports (e.g. UTC),
	// not the org's local time.
	return nt.Time.In(IST).Format("Jan 02, 2006 at 03:04 PM")
}
