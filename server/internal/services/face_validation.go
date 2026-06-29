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

func (s *FaceValidationService) InsertJob(ctx context.Context, objectKey string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO face_validation_jobs (object_key) VALUES ($1) RETURNING id`,
		objectKey,
	).Scan(&id)
	return id, err
}

func (s *FaceValidationService) GetJob(ctx context.Context, jobID string) (status, reason string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT status, COALESCE(reason, '') FROM face_validation_jobs WHERE id = $1`,
		jobID,
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
