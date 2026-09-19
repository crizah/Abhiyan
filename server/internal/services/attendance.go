package services

import (
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/google/uuid"
)

type AttendanceService struct {
	queries *db.Queries
}

// maxAttendanceRangeDays bounds date-range queries so a mistyped or malicious
// range can't blow up the generate_series cross-join or produce an
// unbounded CSV.
const maxAttendanceRangeDays = 366

func validateDateRange(from, to time.Time) error {
	if to.Before(from) {
		return errors.New("to date must not be before from date")
	}
	if to.Sub(from) > maxAttendanceRangeDays*24*time.Hour {
		return fmt.Errorf("date range must not exceed %d days", maxAttendanceRangeDays)
	}
	return nil
}

func NewAttendanceService(dbConn *sql.DB) *AttendanceService {
	return &AttendanceService{queries: db.New(dbConn)}
}

// assertUserInOrg guards attendance endpoints that take a target user_id
// straight from the URL with no other scoping.
func (s *AttendanceService) assertUserInOrg(ctx context.Context, userID string, callerOrgID string) error {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return err
	}
	oID, err := util.ParseUUID(callerOrgID)
	if err != nil {
		return err
	}
	belongs, err := s.queries.IsUserInOrg(ctx, db.IsUserInOrgParams{UserID: uID, OrgID: oID})
	if err != nil {
		return fmt.Errorf("failed to verify user's organization: %w", err)
	}
	if !belongs {
		return errors.New("unauthorized: user does not belong to your organization")
	}
	return nil
}

func (s *AttendanceService) UpsertRecord(ctx context.Context, userID, orgID, targetKey, fulfillment string) (string, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return "", err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return "", err
	}
	id, err := s.queries.UpsertAttendanceRecord(ctx, db.UpsertAttendanceRecordParams{
		UserID:        uID,
		OrgID:         oID,
		TargetFileUri: sql.NullString{String: targetKey, Valid: true},
		Fulfillment: db.NullAttendanceFulfillmentStatus{
			AttendanceFulfillmentStatus: db.AttendanceFulfillmentStatus(fulfillment),
			Valid:                       true,
		},
	})
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

func (s *AttendanceService) GetTodayStatus(ctx context.Context, userID, orgID string) (string, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return "", err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return "", err
	}

	// A holiday today short-circuits before looking for a row at all — none
	// should exist (the batch cron and MarkAttendance both skip holidays),
	// and returning 'not_applicable' here (rather than 'none') keeps the
	// employee-facing capture modal from auto-opening on a holiday.
	isHoliday, err := s.queries.IsOrgHolidayToday(ctx, oID)
	if err != nil {
		return "", err
	}
	if isHoliday {
		return "not_applicable", nil
	}

	row, err := s.queries.GetTodayAttendance(ctx, db.GetTodayAttendanceParams{
		UserID: uID,
		OrgID:  oID,
	})
	if err == sql.ErrNoRows {
		return "none", nil
	}
	if err != nil {
		return "", err
	}
	return row.Status, nil
}

// IsHolidayToday reports whether today is a non-working day for the org — a
// configured one-off date, or a weekend when the org has weekends off.
func (s *AttendanceService) IsHolidayToday(ctx context.Context, orgID string) (bool, error) {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return false, err
	}
	return s.queries.IsOrgHolidayToday(ctx, oID)
}

type OrgHoliday struct {
	ID    string `json:"id"`
	Date  string `json:"date"`
	Label string `json:"label,omitempty"`
}

type HolidaySettings struct {
	WeekendsOff bool         `json:"weekends_off"`
	Holidays    []OrgHoliday `json:"holidays"`
}

func (s *AttendanceService) GetHolidaySettings(ctx context.Context, orgID string) (HolidaySettings, error) {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return HolidaySettings{}, err
	}
	org, err := s.queries.GetOrgInfo(ctx, oID)
	if err != nil {
		return HolidaySettings{}, err
	}
	rows, err := s.queries.ListOrgHolidays(ctx, oID)
	if err != nil {
		return HolidaySettings{}, err
	}
	holidays := make([]OrgHoliday, len(rows))
	for i, r := range rows {
		holidays[i] = OrgHoliday{
			ID:    r.ID.String(),
			Date:  r.Date.Format("2006-01-02"),
			Label: r.Label.String,
		}
	}
	return HolidaySettings{WeekendsOff: org.WeekendsOff, Holidays: holidays}, nil
}

func (s *AttendanceService) AddHoliday(ctx context.Context, orgID, dateStr, label string) (OrgHoliday, error) {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return OrgHoliday{}, err
	}
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return OrgHoliday{}, fmt.Errorf("invalid date: %w", err)
	}
	row, err := s.queries.CreateOrgHoliday(ctx, db.CreateOrgHolidayParams{
		OrgID: oID,
		Date:  date,
		Label: sql.NullString{String: label, Valid: label != ""},
	})
	if err != nil {
		return OrgHoliday{}, err
	}
	return OrgHoliday{ID: row.ID.String(), Date: row.Date.Format("2006-01-02"), Label: row.Label.String}, nil
}

func (s *AttendanceService) RemoveHoliday(ctx context.Context, orgID, holidayID string) error {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return err
	}
	hID, err := util.ParseUUID(holidayID)
	if err != nil {
		return err
	}
	return s.queries.DeleteOrgHoliday(ctx, db.DeleteOrgHolidayParams{ID: hID, OrgID: oID})
}

func (s *AttendanceService) SetWeekendsOff(ctx context.Context, orgID string, off bool) error {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return err
	}
	return s.queries.SetOrgWeekendsOff(ctx, db.SetOrgWeekendsOffParams{ID: oID, WeekendsOff: off})
}

// holidayContext is the per-org data needed to decide, for any given date,
// whether it's a non-working day — fetched once per report and reused across
// every row instead of re-querying per date.
type holidayContext struct {
	weekendsOff bool
	dates       map[string]bool
}

func (s *AttendanceService) getHolidayContext(ctx context.Context, orgID uuid.UUID) (holidayContext, error) {
	org, err := s.queries.GetOrgInfo(ctx, orgID)
	if err != nil {
		return holidayContext{}, err
	}
	holidays, err := s.queries.ListOrgHolidays(ctx, orgID)
	if err != nil {
		return holidayContext{}, err
	}
	dates := make(map[string]bool, len(holidays))
	for _, h := range holidays {
		dates[h.Date.Format("2006-01-02")] = true
	}
	return holidayContext{weekendsOff: org.WeekendsOff, dates: dates}, nil
}

func (hc holidayContext) isHoliday(date time.Time) bool {
	if hc.weekendsOff {
		wd := date.Weekday()
		if wd == time.Saturday || wd == time.Sunday {
			return true
		}
	}
	return hc.dates[date.Format("2006-01-02")]
}

// datesInRange enumerates every holiday date within [from, to] (inclusive) as
// "YYYY-MM-DD" strings. Bounded by validateDateRange's maxAttendanceRangeDays
// cap on the caller side, so this loop can't run unbounded.
func (hc holidayContext) datesInRange(from, to time.Time) []string {
	var out []string
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if hc.isHoliday(d) {
			out = append(out, d.Format("2006-01-02"))
		}
	}
	return out
}

func (s *AttendanceService) SetResult(ctx context.Context, recordID string, present bool, status string) error {
	rID, err := util.ParseUUID(recordID)
	if err != nil {
		return err
	}
	return s.queries.SetAttendanceResult(ctx, db.SetAttendanceResultParams{
		ID:      rID,
		Present: sql.NullBool{Bool: present, Valid: true},
		Status:  status,
	})
}

func (s *AttendanceService) GetUserFaceURI(ctx context.Context, userID string) (string, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return "", err
	}
	uri, err := s.queries.GetUserFaceURI(ctx, uID)
	if err != nil {
		return "", err
	}
	return uri.String, nil
}

func (s *AttendanceService) IsAttendanceEnabled(ctx context.Context, orgID string) (bool, error) {
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return false, err
	}
	row, err := s.queries.GetOrgInfo(ctx, oID)
	if err != nil {
		return false, err
	}
	return row.AttendanceEnabled, nil
}

type AttendanceRow struct {
	ID               string `json:"id"`
	FirstName        string `json:"first_name"`
	LastName         string `json:"last_name"`
	Email            string `json:"email"`
	TeamName         string `json:"team_name"`
	AttendanceStatus string `json:"attendance_status"`
	AttendanceDate   string `json:"attendance_date,omitempty"`
	Fulfillment      string `json:"fulfillment"`
}

// resolveStatus turns the SQL-level 'no_record' placeholder into a status the
// UI can render. Orgs that never turned attendance on never get batch-inserted
// absent rows (see BatchInsertAbsentAttendance), so every user there is a
// permanent 'no_record' — that must read as "not applicable", not "absent".
// For attendance-enabled orgs, no_record only happens in the brief window
// before the nightly batch job runs, and falling back to 'absent' matches the
// existing "no check-in = absent" behavior.
// resolveStatus folds a holiday override in ahead of everything else: a
// configured holiday (or weekend, when the org has weekends off) always reads
// as 'not_applicable', the same status already used for attendance-disabled
// orgs — even overriding a stray present/absent row from before the holiday
// was configured.
func resolveStatus(rawStatus string, attendanceEnabled bool, isHoliday bool) string {
	if isHoliday {
		return "not_applicable"
	}
	if rawStatus != "no_record" {
		return rawStatus
	}
	if !attendanceEnabled {
		return "not_applicable"
	}
	return "absent"
}

// resolveFulfillment surfaces full/half-day only for a day the user is
// actually present — an absent/unmatched/no-record day never had a real
// mark-time to derive one from, so showing a value there would be misleading.
func resolveFulfillment(resolvedStatus string, raw db.NullAttendanceFulfillmentStatus) string {
	if resolvedStatus != "present" || !raw.Valid {
		return ""
	}
	return string(raw.AttendanceFulfillmentStatus)
}

func (s *AttendanceService) GetOrgAttendance(ctx context.Context, orgID, dateStr, teamID string) ([]AttendanceRow, error) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date: %w", err)
	}

	enabled, err := s.IsAttendanceEnabled(ctx, orgID)
	if err != nil {
		return nil, err
	}

	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}

	hc, err := s.getHolidayContext(ctx, parsedOrgID)
	if err != nil {
		return nil, err
	}
	isHoliday := hc.isHoliday(date)

	if teamID != "" && teamID != "ALL" {
		parsedTeamID, err := util.ParseUUID(teamID)
		if err != nil {
			return nil, err
		}
		rows, err := s.queries.GetOrgAttendanceByDateAndTeam(ctx, db.GetOrgAttendanceByDateAndTeamParams{
			AttendanceDate: sql.NullTime{Time: date, Valid: true},
			OrgID:          parsedOrgID,
			TeamID:         parsedTeamID,
		})
		if err != nil {
			return nil, err
		}
		out := make([]AttendanceRow, len(rows))
		for i, r := range rows {
			status := resolveStatus(r.AttendanceStatus, enabled, isHoliday)
			out[i] = AttendanceRow{
				ID:               r.ID.String(),
				FirstName:        r.FirstName,
				LastName:         r.LastName,
				Email:            r.EmailID,
				TeamName:         r.TeamName,
				AttendanceStatus: status,
				Fulfillment:      resolveFulfillment(status, r.Fulfillment),
			}
		}
		return out, nil
	}

	rows, err := s.queries.GetOrgAttendanceByDate(ctx, db.GetOrgAttendanceByDateParams{
		AttendanceDate: sql.NullTime{Time: date, Valid: true},
		OrgID:          parsedOrgID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]AttendanceRow, len(rows))
	for i, r := range rows {
		status := resolveStatus(r.AttendanceStatus, enabled, isHoliday)
		out[i] = AttendanceRow{
			ID:               r.ID.String(),
			FirstName:        r.FirstName,
			LastName:         r.LastName,
			Email:            r.EmailID,
			TeamName:         r.TeamName,
			AttendanceStatus: status,
			Fulfillment:      resolveFulfillment(status, r.Fulfillment),
		}
	}
	return out, nil
}

// GetOrgAttendanceRange powers the batch CSV export over a date span: one row
// per user per day in [from, to], scoped to the caller's org and optionally a
// single team.
func (s *AttendanceService) GetOrgAttendanceRange(ctx context.Context, orgID, fromStr, toStr, teamID string) ([]AttendanceRow, error) {
	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		return nil, fmt.Errorf("invalid from date: %w", err)
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		return nil, fmt.Errorf("invalid to date: %w", err)
	}
	if err := validateDateRange(from, to); err != nil {
		return nil, err
	}

	enabled, err := s.IsAttendanceEnabled(ctx, orgID)
	if err != nil {
		return nil, err
	}

	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}

	hc, err := s.getHolidayContext(ctx, parsedOrgID)
	if err != nil {
		return nil, err
	}

	if teamID != "" && teamID != "ALL" {
		parsedTeamID, err := util.ParseUUID(teamID)
		if err != nil {
			return nil, err
		}
		rows, err := s.queries.GetOrgAttendanceRangeByTeam(ctx, db.GetOrgAttendanceRangeByTeamParams{
			OrgID:    parsedOrgID,
			FromDate: from,
			ToDate:   to,
			TeamID:   parsedTeamID,
		})
		if err != nil {
			return nil, err
		}
		out := make([]AttendanceRow, len(rows))
		for i, r := range rows {
			status := resolveStatus(r.AttendanceStatus, enabled, hc.isHoliday(r.AttendanceDate))
			out[i] = AttendanceRow{
				ID:               r.ID.String(),
				FirstName:        r.FirstName,
				LastName:         r.LastName,
				Email:            r.EmailID,
				TeamName:         r.TeamName,
				AttendanceStatus: status,
				AttendanceDate:   r.AttendanceDate.Format("2006-01-02"),
				Fulfillment:      resolveFulfillment(status, r.Fulfillment),
			}
		}
		return out, nil
	}

	rows, err := s.queries.GetOrgAttendanceRange(ctx, db.GetOrgAttendanceRangeParams{
		OrgID:    parsedOrgID,
		FromDate: from,
		ToDate:   to,
	})
	if err != nil {
		return nil, err
	}
	out := make([]AttendanceRow, len(rows))
	for i, r := range rows {
		status := resolveStatus(r.AttendanceStatus, enabled, hc.isHoliday(r.AttendanceDate))
		out[i] = AttendanceRow{
			ID:               r.ID.String(),
			FirstName:        r.FirstName,
			LastName:         r.LastName,
			Email:            r.EmailID,
			TeamName:         r.TeamName,
			AttendanceStatus: status,
			AttendanceDate:   r.AttendanceDate.Format("2006-01-02"),
			Fulfillment:      resolveFulfillment(status, r.Fulfillment),
		}
	}
	return out, nil
}

type UserAttendanceSummary struct {
	PresentCount      int32                   `json:"present_count"`
	AbsentCount       int32                   `json:"absent_count"`
	AttendanceEnabled bool                    `json:"attendance_enabled"`
	History           []UserAttendanceHistory `json:"history"`
}

type UserAttendanceHistory struct {
	Date        string `json:"date"`
	Present     bool   `json:"present"`
	Status      string `json:"status"` // present | absent | not_applicable
	Fulfillment string `json:"fulfillment"`
}

// GetUserSummary reports a user's present/absent counts and daily history
// within [from, to]. Counts come straight from actual attendance_record rows
// (never fabricated), so they're accurate regardless of the org's current
// attendance_enabled flag; AttendanceEnabled is surfaced so the UI can explain
// an all-zero summary instead of implying the user was never checked.
func (s *AttendanceService) GetUserSummary(ctx context.Context, userID, callerOrgID, fromStr, toStr string) (*UserAttendanceSummary, error) {
	if err := s.assertUserInOrg(ctx, userID, callerOrgID); err != nil {
		return nil, err
	}

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		return nil, fmt.Errorf("invalid from date: %w", err)
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		return nil, fmt.Errorf("invalid to date: %w", err)
	}
	if err := validateDateRange(from, to); err != nil {
		return nil, err
	}

	uid, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	oid, err := util.ParseUUID(callerOrgID)
	if err != nil {
		return nil, err
	}

	enabled, err := s.IsAttendanceEnabled(ctx, callerOrgID)
	if err != nil {
		return nil, err
	}

	counts, err := s.queries.GetUserAttendanceSummaryRange(ctx, db.GetUserAttendanceSummaryRangeParams{
		UserID: uid, OrgID: oid, FromDate: from, ToDate: to,
	})
	if err != nil {
		return nil, err
	}

	history, err := s.queries.GetUserAttendanceHistoryRange(ctx, db.GetUserAttendanceHistoryRangeParams{
		UserID: uid, OrgID: oid, FromDate: from, ToDate: to,
	})
	if err != nil {
		return nil, err
	}

	hc, err := s.getHolidayContext(ctx, oid)
	if err != nil {
		return nil, err
	}

	seenDates := make(map[string]bool, len(history))
	h := make([]UserAttendanceHistory, 0, len(history))
	for _, r := range history {
		date := r.AttendanceDate.Time
		seenDates[date.Format("2006-01-02")] = true
		status := "absent"
		if r.Present.Bool {
			status = "present"
		}
		if hc.isHoliday(date) {
			status = "not_applicable"
		}
		h = append(h, UserAttendanceHistory{
			Date:        date.Format("2006-01-02"),
			Present:     r.Present.Bool,
			Status:      status,
			Fulfillment: resolveFulfillment(status, r.Fulfillment),
		})
	}

	// Holiday dates never get an attendance_record row (the batch cron and
	// MarkAttendance both skip them), so they'd otherwise be silently absent
	// from history/CSV instead of showing explicitly as not_applicable.
	for _, dateStr := range hc.datesInRange(from, to) {
		if seenDates[dateStr] {
			continue
		}
		h = append(h, UserAttendanceHistory{Date: dateStr, Present: false, Status: "not_applicable"})
	}
	sort.Slice(h, func(i, j int) bool { return h[i].Date > h[j].Date })

	return &UserAttendanceSummary{
		PresentCount:      counts.PresentCount,
		AbsentCount:       counts.AbsentCount,
		AttendanceEnabled: enabled,
		History:           h,
	}, nil
}

// csvStatusLabel renders the internal status vocabulary for CSV output.
// 'not_applicable' means the org has attendance tracking turned off, so there
// was never a real "absent" to report — that should read as N/A, not absent.
func csvStatusLabel(status string) string {
	if status == "not_applicable" {
		return "N/A"
	}
	return status
}

// csvFulfillmentLabel renders the internal FULL_DAY/HALF_DAY vocabulary for
// CSV output; blank (never "N/A") when there's nothing to report, since a
// blank cell reads correctly whether the day was absent, unmatched, or simply
// has no record.
func csvFulfillmentLabel(fulfillment string) string {
	switch fulfillment {
	case "FULL_DAY":
		return "Full Day"
	case "HALF_DAY":
		return "Half Day"
	default:
		return ""
	}
}

func (s *AttendanceService) WriteOrgReport(ctx context.Context, orgID, dateStr, teamID string, w io.Writer) error {
	rows, err := s.GetOrgAttendance(ctx, orgID, dateStr, teamID)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("Attendance Report - %s - Generated: %s", dateStr, time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	cw.Write([]string{"Name", "Email", "Team", "Status", "Fulfillment"})

	for _, r := range rows {
		cw.Write([]string{
			strings.TrimSpace(r.FirstName + " " + r.LastName),
			r.Email,
			r.TeamName,
			csvStatusLabel(r.AttendanceStatus),
			csvFulfillmentLabel(r.Fulfillment),
		})
	}
	return nil
}

// WriteOrgReportRange is the date-range counterpart used by the batch report
// download when a from/to span is selected instead of a single day: one row
// per user per day in the span.
func (s *AttendanceService) WriteOrgReportRange(ctx context.Context, orgID, fromStr, toStr, teamID string, w io.Writer) error {
	rows, err := s.GetOrgAttendanceRange(ctx, orgID, fromStr, toStr, teamID)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("Attendance Report - %s to %s - Generated: %s", fromStr, toStr, time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	cw.Write([]string{"Name", "Email", "Team", "Date", "Status", "Fulfillment"})

	for _, r := range rows {
		cw.Write([]string{
			strings.TrimSpace(r.FirstName + " " + r.LastName),
			r.Email,
			r.TeamName,
			r.AttendanceDate,
			csvStatusLabel(r.AttendanceStatus),
			csvFulfillmentLabel(r.Fulfillment),
		})
	}
	return nil
}

func (s *AttendanceService) WriteUserReport(ctx context.Context, userID, callerOrgID, fromStr, toStr string, w io.Writer) error {
	summary, err := s.GetUserSummary(ctx, userID, callerOrgID, fromStr, toStr)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("User Attendance Report - %s to %s - Generated: %s", fromStr, toStr, time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	if !summary.AttendanceEnabled {
		cw.Write([]string{"Note: attendance tracking is not enabled for this organization"})
		cw.Write([]string{})
	}
	cw.Write([]string{"Present", "Absent"})
	cw.Write([]string{fmt.Sprintf("%d", summary.PresentCount), fmt.Sprintf("%d", summary.AbsentCount)})
	cw.Write([]string{})
	cw.Write([]string{"Date", "Status", "Fulfillment"})
	for _, h := range summary.History {
		cw.Write([]string{h.Date, csvStatusLabel(h.Status), csvFulfillmentLabel(h.Fulfillment)})
	}
	return nil
}
