package services

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
)

type TaskService struct {
	db      *sql.DB
	queries *db.Queries
}

func NewTaskService(dbConn *sql.DB) *TaskService {
	return &TaskService{
		db:      dbConn,
		queries: db.New(dbConn),
	}
}

// CalculateNextReminder computes the next trigger date based on custom intervals
func CalculateNextReminder(currentScheduledAt time.Time, value int, unit string) (time.Time, error) {
	switch unit {
	case "MINUTES":
		return currentScheduledAt.Add(time.Duration(value) * time.Minute), nil
	case "HOURS":
		return currentScheduledAt.Add(time.Duration(value) * time.Hour), nil
	case "DAYS":
		return currentScheduledAt.AddDate(0, 0, value), nil
	case "WEEKS":
		return currentScheduledAt.AddDate(0, 0, value*7), nil
	case "MONTHS":
		return currentScheduledAt.AddDate(0, value, 0), nil
	default:
		return time.Time{}, errors.New("unsupported recurrence unit")
	}
}

func (s *TaskService) CreateTask(ctx context.Context, adminID string, req schemas.CreateTaskRequest) (db.Task, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return db.Task{}, err
	}
	defer tx.Rollback()

	aID := util.ParseUUID(adminID)

	qtx := s.queries.WithTx(tx)
	teamID := util.ParseUUID(req.TeamID)

	// 1. Create the base task
	taskParams := db.CreateTaskParams{
		TeamID:      teamID,
		Title:       req.Title,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
		CreatedBy:   aID,
	}
	if req.DueDate != nil {
		taskParams.DueDate = sql.NullTime{Time: *req.DueDate, Valid: true}
	}

	task, err := qtx.CreateTask(ctx, taskParams)
	if err != nil {
		return db.Task{}, err
	}

	// 2. Add Assignees
	for _, assigneeID := range req.AssigneeIDs {
		err := qtx.AddTaskParticipant(ctx, db.AddTaskParticipantParams{
			TaskID: task.ID,
			UserID: util.ParseUUID(assigneeID),
			Role:   db.ParticipantRoleASSIGNEE,
		})
		if err != nil {
			return db.Task{}, err
		}
	}

	// 3. Add Subscribers (In-Loop)
	for _, subID := range req.SubscriberIDs {
		err := qtx.AddTaskParticipant(ctx, db.AddTaskParticipantParams{
			TaskID: task.ID,
			UserID: util.ParseUUID(subID),
			Role:   db.ParticipantRoleSUBSCRIBER,
		})
		if err != nil {
			return db.Task{}, err
		}
	}

	// 4. Configure Reminders
	for _, rem := range req.Reminders {
		remParams := db.CreateReminderParams{
			TaskID:      task.ID,
			ScheduledAt: rem.ScheduledAt,
			Channel:     db.ReminderChannel(rem.Channel),
		}

		if rem.RecurrenceValue != nil && rem.RecurrenceUnit != nil {
			remParams.RecurrenceValue = sql.NullInt32{Int32: int32(*rem.RecurrenceValue), Valid: true}
			remParams.RecurrenceUnit = db.NullRecurrenceUnit{
				RecurrenceUnit: db.RecurrenceUnit(*rem.RecurrenceUnit),
				Valid:          true,
			}
		}

		_, err := qtx.CreateReminder(ctx, remParams)
		if err != nil {
			return db.Task{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return db.Task{}, err
	}

	return task, nil
}

func (s *TaskService) GetTeamTasks(ctx context.Context, teamID string) ([]schemas.TaskResponse, error) {
	dbTasks, err := s.queries.GetTeamTasks(ctx, util.ParseUUID(teamID))
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
	for _, t := range dbTasks {
		// Safely unwrap nullable dates
		var dueDate *time.Time
		if t.DueDate.Valid {
			dueDate = &t.DueDate.Time
		}

		var createdAt *time.Time
		if t.CreatedAt.Valid {
			createdAt = &t.CreatedAt.Time
		}

		creatorName := strings.TrimSpace(t.FirstName.String + " " + t.LastName.String)

		tasks = append(tasks, schemas.TaskResponse{
			ID:                t.ID.String(),
			TeamID:            t.TeamID.String(),
			Title:             t.Title,
			Description:       t.Description.String, // will be "" if not valid
			Status:            string(t.Status.TaskStatus),
			FulfillmentStatus: string(t.FulfillmentStatus.TaskFulfillmentStatus),
			CreatedBy:         t.CreatedBy.String(),
			CreatorName:       creatorName,
			DueDate:           dueDate,
			CreatedAt:         createdAt,
		})
	}

	// Prevent returning a null JSON object if the slice is empty
	if tasks == nil {
		tasks = []schemas.TaskResponse{}
	}

	return tasks, nil
}

func (s *TaskService) UpdateTaskStatus(ctx context.Context, taskID string, status string) error {
	return s.queries.UpdateTaskStatus(ctx, db.UpdateTaskStatusParams{
		Status: db.NullTaskStatus{TaskStatus: db.TaskStatus(status)},
		ID:     util.ParseUUID(taskID),
	})
}
