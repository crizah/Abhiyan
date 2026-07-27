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

func NewAttendanceService(dbConn *sql.DB) *AttendanceService {
	return &AttendanceService{queries: db.New(dbConn)}
}

// assertUserInOrg guards attendance endpoints that take a target user_id
// straight from the URL with no other scoping.
func (s *AttendanceService) assertUserInOrg(ctx context.Context, userID string, callerOrgID string) error {
	orgID, err := s.queries.GetUserOrgID(ctx, util.ParseUUID(userID))
	if err != nil {
		return fmt.Errorf("failed to verify user's organization: %w", err)
	}
	if orgID != util.ParseUUID(callerOrgID) {
		return errors.New("unauthorized: user does not belong to your organization")
	}
	return nil
}

func (s *AttendanceService) UpsertRecord(ctx context.Context, userID, targetKey string) (string, error) {
	id, err := s.queries.UpsertAttendanceRecord(ctx, db.UpsertAttendanceRecordParams{
		UserID:        util.ParseUUID(userID),
		TargetFileUri: sql.NullString{String: targetKey, Valid: true},
	})
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

func (s *AttendanceService) GetTodayStatus(ctx context.Context, userID string) (string, error) {
	row, err := s.queries.GetTodayAttendance(ctx, util.ParseUUID(userID))
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
}

func (s *AttendanceService) GetOrgAttendance(ctx context.Context, orgID, dateStr, teamID string) ([]AttendanceRow, error) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date: %w", err)
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
				AttendanceStatus: r.AttendanceStatus,
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
			AttendanceStatus: r.AttendanceStatus,
		}
	}
	return out, nil
}

type UserAttendanceSummary struct {
	PresentCount int32                   `json:"present_count"`
	AbsentCount  int32                   `json:"absent_count"`
	History      []UserAttendanceHistory `json:"history"`
}

type UserAttendanceHistory struct {
	Date    string `json:"date"`
	Present bool   `json:"present"`
}

func (s *AttendanceService) GetUserSummary(ctx context.Context, userID string, callerOrgID string) (*UserAttendanceSummary, error) {
	if err := s.assertUserInOrg(ctx, userID, callerOrgID); err != nil {
		return nil, err
	}
	uid := util.ParseUUID(userID)

	counts, err := s.queries.GetUserAttendanceSummary(ctx, uid)
	if err != nil {
		return nil, err
	}

	history, err := s.queries.GetUserAttendanceHistory(ctx, uid)
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
		PresentCount: counts.PresentCount,
		AbsentCount:  counts.AbsentCount,
		History:      h,
	}, nil
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
		status := r.AttendanceStatus
		if status == "no_record" {
			status = "absent"
		}
		cw.Write([]string{
			strings.TrimSpace(r.FirstName + " " + r.LastName),
			r.Email,
			r.TeamName,
			status,
		})
	}
	return nil
}

func (s *AttendanceService) WriteUserReport(ctx context.Context, userID string, w io.Writer, callerOrgID string) error {
	summary, err := s.GetUserSummary(ctx, userID, callerOrgID)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("User Attendance Report - Generated: %s", time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
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
