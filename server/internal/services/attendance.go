package services

import (
	"context"
	"database/sql"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/util"
)

type AttendanceService struct {
	queries *db.Queries
}

func NewAttendanceService(dbConn *sql.DB) *AttendanceService {
	return &AttendanceService{queries: db.New(dbConn)}
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
