package util

import (
	"database/sql"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Indian mobile numbers: 10 digits, no country code, first digit 6-9.
var indianPhoneRegex = regexp.MustCompile(`^[6-9]\d{9}$`)

// IsValidPhoneNumber checks a phone number is a bare 10-digit Indian mobile
// number (no country code) — the format ParsePhoneNumber expects to prepend "91" to.
func IsValidPhoneNumber(phone string) bool {
	return indianPhoneRegex.MatchString(strings.TrimSpace(phone))
}

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

// ParsePGTextArray decodes a Postgres text[] returned via array_agg(...)::text[]
// (lib/pq scans it back as either a string or []byte, not a native slice) into
// a Go string slice, e.g. "{a,b,c}" -> ["a","b","c"]. Empty/nil input -> nil.
func ParsePGTextArray(v interface{}) []string {
	raw := ""
	if str, ok := v.(string); ok {
		raw = str
	} else if b, ok := v.([]byte); ok {
		raw = string(b)
	}
	raw = strings.Trim(raw, "{}")
	if raw == "" {
		return nil
	}
	return strings.Split(raw, ",")
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
