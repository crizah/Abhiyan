package services

import (
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/util"
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
	belongs, err := s.queries.IsUserInOrg(ctx, db.IsUserInOrgParams{UserID: util.ParseUUID(userID), OrgID: util.ParseUUID(callerOrgID)})
	if err != nil {
		return fmt.Errorf("failed to verify user's organization: %w", err)
	}
	if !belongs {
		return errors.New("unauthorized: user does not belong to your organization")
	}
	return nil
}

func (s *AttendanceService) UpsertRecord(ctx context.Context, userID, orgID, targetKey string) (string, error) {
	id, err := s.queries.UpsertAttendanceRecord(ctx, db.UpsertAttendanceRecordParams{
		UserID:        util.ParseUUID(userID),
		OrgID:         util.ParseUUID(orgID),
		TargetFileUri: sql.NullString{String: targetKey, Valid: true},
	})
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

func (s *AttendanceService) GetTodayStatus(ctx context.Context, userID, orgID string) (string, error) {
	row, err := s.queries.GetTodayAttendance(ctx, db.GetTodayAttendanceParams{
		UserID: util.ParseUUID(userID),
		OrgID:  util.ParseUUID(orgID),
	})
	if err == sql.ErrNoRows {
		return "none", nil
	}
	if err != nil {
		return "", err
	}
	return row.Status, nil
}

func (s *AttendanceService) SetResult(ctx context.Context, recordID string, present bool, status string) error {
	return s.queries.SetAttendanceResult(ctx, db.SetAttendanceResultParams{
		ID:      util.ParseUUID(recordID),
		Present: sql.NullBool{Bool: present, Valid: true},
		Status:  status,
	})
}

func (s *AttendanceService) GetUserFaceURI(ctx context.Context, userID string) (string, error) {
	uri, err := s.queries.GetUserFaceURI(ctx, util.ParseUUID(userID))
	if err != nil {
		return "", err
	}
	return uri.String, nil
}

func (s *AttendanceService) IsAttendanceEnabled(ctx context.Context, orgID string) (bool, error) {
	row, err := s.queries.GetOrgInfo(ctx, util.ParseUUID(orgID))
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
}

// resolveStatus turns the SQL-level 'no_record' placeholder into a status the
// UI can render. Orgs that never turned attendance on never get batch-inserted
// absent rows (see BatchInsertAbsentAttendance), so every user there is a
// permanent 'no_record' — that must read as "not applicable", not "absent".
// For attendance-enabled orgs, no_record only happens in the brief window
// before the nightly batch job runs, and falling back to 'absent' matches the
// existing "no check-in = absent" behavior.
func resolveStatus(rawStatus string, attendanceEnabled bool) string {
	if rawStatus != "no_record" {
		return rawStatus
	}
	if !attendanceEnabled {
		return "not_applicable"
	}
	return "absent"
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

	if teamID != "" && teamID != "ALL" {
		rows, err := s.queries.GetOrgAttendanceByDateAndTeam(ctx, db.GetOrgAttendanceByDateAndTeamParams{
			AttendanceDate: sql.NullTime{Time: date, Valid: true},
			OrgID:          util.ParseUUID(orgID),
			TeamID:         util.ParseUUID(teamID),
		})
		if err != nil {
			return nil, err
		}
		out := make([]AttendanceRow, len(rows))
		for i, r := range rows {
			out[i] = AttendanceRow{
				ID:               r.ID.String(),
				FirstName:        r.FirstName,
				LastName:         r.LastName,
				Email:            r.EmailID,
				TeamName:         r.TeamName,
				AttendanceStatus: resolveStatus(r.AttendanceStatus, enabled),
			}
		}
		return out, nil
	}

	rows, err := s.queries.GetOrgAttendanceByDate(ctx, db.GetOrgAttendanceByDateParams{
		AttendanceDate: sql.NullTime{Time: date, Valid: true},
		OrgID:          util.ParseUUID(orgID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]AttendanceRow, len(rows))
	for i, r := range rows {
		out[i] = AttendanceRow{
			ID:               r.ID.String(),
			FirstName:        r.FirstName,
			LastName:         r.LastName,
			Email:            r.EmailID,
			TeamName:         r.TeamName,
			AttendanceStatus: resolveStatus(r.AttendanceStatus, enabled),
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

	if teamID != "" && teamID != "ALL" {
		rows, err := s.queries.GetOrgAttendanceRangeByTeam(ctx, db.GetOrgAttendanceRangeByTeamParams{
			OrgID:    util.ParseUUID(orgID),
			FromDate: from,
			ToDate:   to,
			TeamID:   util.ParseUUID(teamID),
		})
		if err != nil {
			return nil, err
		}
		out := make([]AttendanceRow, len(rows))
		for i, r := range rows {
			out[i] = AttendanceRow{
				ID:               r.ID.String(),
				FirstName:        r.FirstName,
				LastName:         r.LastName,
				Email:            r.EmailID,
				TeamName:         r.TeamName,
				AttendanceStatus: resolveStatus(r.AttendanceStatus, enabled),
				AttendanceDate:   r.AttendanceDate.Format("2006-01-02"),
			}
		}
		return out, nil
	}

	rows, err := s.queries.GetOrgAttendanceRange(ctx, db.GetOrgAttendanceRangeParams{
		OrgID:    util.ParseUUID(orgID),
		FromDate: from,
		ToDate:   to,
	})
	if err != nil {
		return nil, err
	}
	out := make([]AttendanceRow, len(rows))
	for i, r := range rows {
		out[i] = AttendanceRow{
			ID:               r.ID.String(),
			FirstName:        r.FirstName,
			LastName:         r.LastName,
			Email:            r.EmailID,
			TeamName:         r.TeamName,
			AttendanceStatus: resolveStatus(r.AttendanceStatus, enabled),
			AttendanceDate:   r.AttendanceDate.Format("2006-01-02"),
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
	Date    string `json:"date"`
	Present bool   `json:"present"`
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

	uid := util.ParseUUID(userID)
	oid := util.ParseUUID(callerOrgID)

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

	h := make([]UserAttendanceHistory, len(history))
	for i, r := range history {
		h[i] = UserAttendanceHistory{
			Date:    r.AttendanceDate.Time.Format("2006-01-02"),
			Present: r.Present.Bool,
		}
	}

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

func (s *AttendanceService) WriteOrgReport(ctx context.Context, orgID, dateStr, teamID string, w io.Writer) error {
	rows, err := s.GetOrgAttendance(ctx, orgID, dateStr, teamID)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("Attendance Report - %s - Generated: %s", dateStr, time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	cw.Write([]string{"Name", "Email", "Team", "Status"})

	for _, r := range rows {
		cw.Write([]string{
			strings.TrimSpace(r.FirstName + " " + r.LastName),
			r.Email,
			r.TeamName,
			csvStatusLabel(r.AttendanceStatus),
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
	cw.Write([]string{"Name", "Email", "Team", "Date", "Status"})

	for _, r := range rows {
		cw.Write([]string{
			strings.TrimSpace(r.FirstName + " " + r.LastName),
			r.Email,
			r.TeamName,
			r.AttendanceDate,
			csvStatusLabel(r.AttendanceStatus),
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
	cw.Write([]string{"Date", "Status"})
	for _, h := range summary.History {
		status := "absent"
		if h.Present {
			status = "present"
		}
		cw.Write([]string{h.Date, status})
	}
	return nil
}
