package services

import (
	"context"
	"database/sql"
)

type FaceValidationService struct {
	db *sql.DB
}

func NewFaceValidationService(db *sql.DB) *FaceValidationService {
	return &FaceValidationService{db: db}
}

func (s *FaceValidationService) InsertJob(ctx context.Context, userID, objectKey string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO face_validation_jobs (user_id, object_key) VALUES ($1, $2) RETURNING id`,
		userID, objectKey,
	).Scan(&id)
	return id, err
}

// GetJob only returns a job owned by userID — job IDs are otherwise guessable
// UUIDs with no other access control, so ownership must be checked here.
func (s *FaceValidationService) GetJob(ctx context.Context, jobID, userID string) (status, reason string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT status, COALESCE(reason, '') FROM face_validation_jobs WHERE id = $1 AND user_id = $2`,
		jobID, userID,
	).Scan(&status, &reason)
	return
}

func (s *FaceValidationService) SetResult(ctx context.Context, jobID, status, reason string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE face_validation_jobs SET status = $2, reason = $3 WHERE id = $1`,
		jobID, status, reason,
	)
	return err
}
