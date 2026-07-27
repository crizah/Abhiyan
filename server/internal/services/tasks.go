package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/crizah/Onion/app"
	"github.com/google/uuid"
)

type TaskService struct {
	db           *sql.DB
	queries      *db.Queries
	onionApp     *app.App
	s3Service    *S3Service
	scoreService *ScoreService
}

func NewTaskService(dbConn *sql.DB, o *app.App, s3 *S3Service, sc *ScoreService) *TaskService {
	return &TaskService{
		db:           dbConn,
		queries:      db.New(dbConn),
		onionApp:     o,
		s3Service:    s3,
		scoreService: sc,
	}
}

func insertAttachmentWithTranscription(ctx context.Context, qtx *db.Queries, params db.InsertAttachmentParams) error {
	attID, err := qtx.InsertAttachment(ctx, params)
	if err != nil {
		return err
	}
	if strings.HasPrefix(params.FileType, "audio/") {
		qtx.InsertTranscription(ctx, attID)
		qtx.InsertAudioTranscode(ctx, attID)
	}

	return nil
}

func (s *TaskService) presignAttachments(ctx context.Context, atts []schemas.AttachmentPayload) {
	for i := range atts {
		atts[i].FileURL = s.s3Service.PresignFileURL(ctx, atts[i].FileURL)
		if atts[i].PlaybackURL != "" {
			atts[i].PlaybackURL = s.s3Service.PresignFileURL(ctx, atts[i].PlaybackURL)
		}
	}
}

func (s *TaskService) diffAttachments(
	ctx context.Context,
	qtx *db.Queries,
	taskIDNullable uuid.NullUUID,
	uploaderID uuid.UUID,
	incoming []schemas.AttachmentPayload,
) []string {
	existing, _ := qtx.GetTaskAttachments(ctx, taskIDNullable)

	incomingIDs := make(map[string]bool)
	for _, att := range incoming {
		if att.ID != "" {
			incomingIDs[att.ID] = true
		}
	}

	var toDeleteIDs []uuid.UUID
	var s3URLsToDelete []string
	for _, e := range existing {
		if !incomingIDs[e.ID.String()] {
			toDeleteIDs = append(toDeleteIDs, e.ID)
			s3URLsToDelete = append(s3URLsToDelete, e.FileUrl)
		}
	}

	if len(toDeleteIDs) > 0 {
		qtx.DeleteAttachmentsByIDs(ctx, toDeleteIDs)
	}

	for _, att := range incoming {
		if att.ID != "" {
			continue
		}
		insertAttachmentWithTranscription(ctx, qtx, db.InsertAttachmentParams{
			TaskID:        taskIDNullable,
			TaskUpdateID:  uuid.NullUUID{},
			TaskCommentID: uuid.NullUUID{},
			FileName:      att.FileName,
			FileUrl:       att.FileURL,
			FileType:      att.FileType,
			FileSizeBytes: sql.NullInt64{Int64: att.FileSize, Valid: true},
			UploadedBy:    uploaderID,
		})
	}

	return s3URLsToDelete
}

// assertTaskInOrg confirms taskID belongs to callerOrgID before any read/write
// touches it — the whole task subsystem is otherwise reachable cross-tenant by
// just guessing/reusing a UUID from another org.
func (s *TaskService) assertTaskInOrg(ctx context.Context, taskID uuid.UUID, callerOrgID uuid.UUID) error {
	orgID, err := s.queries.GetTaskOrgID(ctx, taskID)
	if err != nil {
		return fmt.Errorf("failed to verify task organization: %w", err)
	}
	if orgID != callerOrgID {
		return errors.New("unauthorized: task does not belong to your organization")
	}
	return nil
}

func (s *TaskService) assertTeamInOrg(ctx context.Context, teamID uuid.UUID, callerOrgID uuid.UUID) error {
	orgID, err := s.queries.GetTeamOrgID(ctx, teamID)
	if err != nil {
		return fmt.Errorf("failed to verify team organization: %w", err)
	}
	if orgID != callerOrgID {
		return errors.New("unauthorized: team does not belong to your organization")
	}
	return nil
}

func (s *TaskService) assertTaskUpdateInOrg(ctx context.Context, updateID uuid.UUID, callerOrgID uuid.UUID) error {
	orgID, err := s.queries.GetTaskUpdateOrgID(ctx, updateID)
	if err != nil {
		return fmt.Errorf("failed to verify update organization: %w", err)
	}
	if orgID != callerOrgID {
		return errors.New("unauthorized: update does not belong to your organization")
	}
	return nil
}

func (s *TaskService) assertAttachmentInOrg(ctx context.Context, attachmentID uuid.UUID, callerOrgID uuid.UUID) error {
	orgID, err := s.queries.GetAttachmentOrgID(ctx, attachmentID)
	if err != nil {
		return fmt.Errorf("failed to verify attachment organization: %w", err)
	}
	if orgID != callerOrgID {
		return errors.New("unauthorized: attachment does not belong to your organization")
	}
	return nil
}

// assertUsersInOrg guards against attaching participants from another org to a
// task — team-scoping alone isn't enough since task_participants rows aren't
// otherwise constrained to actual team members.
func (s *TaskService) assertUsersInOrg(ctx context.Context, userIDs []string, callerOrgID uuid.UUID) error {
	for _, idStr := range userIDs {
		orgID, err := s.queries.GetUserOrgID(ctx, util.ParseUUID(idStr))
		if err != nil {
			return fmt.Errorf("failed to verify participant organization: %w", err)
		}
		if orgID != callerOrgID {
			return errors.New("action blocked: assignees and subscribers must belong to your organization")
		}
	}
	return nil
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

func (s *TaskService) CreateTask(ctx context.Context, adminID string, req schemas.CreateTaskRequest, callerOrgID string) (db.Task, error) {
	orgID := util.ParseUUID(callerOrgID)
	teamID := util.ParseUUID(req.TeamID)

	if err := s.assertTeamInOrg(ctx, teamID, orgID); err != nil {
		return db.Task{}, err
	}
	if err := s.assertUsersInOrg(ctx, req.AssigneeIDs, orgID); err != nil {
		return db.Task{}, err
	}
	if err := s.assertUsersInOrg(ctx, req.SubscriberIDs, orgID); err != nil {
		return db.Task{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return db.Task{}, err
	}
	defer tx.Rollback()

	aID := util.ParseUUID(adminID)

	qtx := s.queries.WithTx(tx)

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

	// 2. Add Assignees and get their email ids
	// var assigneeEmails []string
	for _, assigneeID := range req.AssigneeIDs {
		uID := util.ParseUUID(assigneeID)
		err := qtx.AddTaskParticipant(ctx, db.AddTaskParticipantParams{
			TaskID: task.ID,
			UserID: uID,
			Role:   db.ParticipantRoleASSIGNEE,
		})
		if err != nil {
			return db.Task{}, err
		}

		// email, _ := qtx.GetEmailByUser(ctx, uID) // n+1
		// assigneeEmails = append(assigneeEmails, email)

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

	// Create Notifications for Assignees
	for _, assigneeID := range req.AssigneeIDs {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  util.ParseUUID(assigneeID),
			Title:   "New Task Assigned",
			Message: fmt.Sprintf("You have been assigned to: %s", req.Title),
		})
	}

	// Create Notifications for Subscribers
	for _, subID := range req.SubscriberIDs {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  util.ParseUUID(subID),
			Title:   "Added to Task Loop",
			Message: fmt.Sprintf("You are subscribed to updates for: %s", req.Title),
		})
	}

	// 4. Configure Reminders (Pure DB write, Onion Poller will pick it up)
	for _, rem := range req.Reminders {
		remParams := db.CreateReminderParams{
			TaskID:      task.ID,
			ScheduledAt: rem.ScheduledAt,
			Channel:     db.ReminderChannel(rem.Channel),
		}
		if rem.RecurrenceValue != nil && rem.RecurrenceUnit != nil {
			remParams.RecurrenceValue = sql.NullInt32{Int32: int32(*rem.RecurrenceValue), Valid: true}
			remParams.RecurrenceUnit = db.NullRecurrenceUnit{RecurrenceUnit: db.RecurrenceUnit(*rem.RecurrenceUnit), Valid: true}
		}
		_, err := qtx.CreateReminder(ctx, remParams)
		if err != nil {
			return db.Task{}, err
		}
	}

	// 5. Insert Attachments
	for _, att := range req.Attachments {
		insertAttachmentWithTranscription(ctx, qtx, db.InsertAttachmentParams{
			TaskID:        uuid.NullUUID{UUID: task.ID, Valid: true},
			TaskUpdateID:  uuid.NullUUID{},
			TaskCommentID: uuid.NullUUID{},
			FileName:      att.FileName,
			FileUrl:       att.FileURL,
			FileType:      att.FileType,
			FileSizeBytes: sql.NullInt64{Int64: att.FileSize, Valid: true},
			UploadedBy:    aID,
		})
	}

	if err := tx.Commit(); err != nil {
		return db.Task{}, err
	}

	return task, nil
}

func (s *TaskService) GetTeamTasks(ctx context.Context, teamID string, limit, offset int32, callerOrgID string) (*schemas.PaginatedTaskResponse, error) {
	tID := util.ParseUUID(teamID)
	if err := s.assertTeamInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	dbTasks, err := s.queries.GetTeamTasks(ctx, db.GetTeamTasksParams{
		TeamID: tID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
	var totalCount int64 = 0

	if len(dbTasks) > 0 {
		totalCount = dbTasks[0].TotalCount
	}

	for _, t := range dbTasks {
		var dueDate *time.Time
		if t.DueDate.Valid {
			dueDate = &t.DueDate.Time
		}
		var createdAt *time.Time
		if t.CreatedAt.Valid {
			createdAt = &t.CreatedAt.Time
		}

		tasks = append(tasks, schemas.TaskResponse{
			ID:                t.ID.String(),
			TeamID:            t.TeamID.String(),
			Title:             t.Title,
			Description:       t.Description.String,
			Status:            string(t.Status.TaskStatus),
			FulfillmentStatus: string(t.FulfillmentStatus.TaskFulfillmentStatus),
			ReviewStatus:      string(t.ReviewStatus),
			CreatedBy:         t.CreatedBy.String(),
			CreatorName:       strings.TrimSpace(t.FirstName.String + " " + t.LastName.String),
			DueDate:           dueDate,
			CreatedAt:         createdAt,
		})
	}

	if tasks == nil {
		tasks = []schemas.TaskResponse{}
	}

	return &schemas.PaginatedTaskResponse{
		TotalCount: totalCount,
		Tasks:      tasks,
	}, nil
}

func (s *TaskService) UpdateTaskStatus(ctx context.Context, taskID string, status string, callerOrgID string) error {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return err
	}

	// Update the absolute lifecycle status
	err := s.queries.UpdateTaskStatus(ctx, db.UpdateTaskStatusParams{
		Status: db.NullTaskStatus{TaskStatus: db.TaskStatus(status), Valid: true},
		ID:     tID,
	})
	if err != nil {
		return err
	}

	// If the task is closed manually, kill all pending reminders so they stop firing
	if status == string(db.TaskStatusCLOSED) {
		_ = s.queries.DeleteTaskReminders(ctx, tID)
	}

	return nil
}

func (s *TaskService) GetFullTaskDetails(ctx context.Context, taskID string, callerOrgID string) (*schemas.FullTaskDetailsResponse, error) {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	dbParts, err := s.queries.GetTaskParticipants(ctx, tID)
	if err != nil {
		return nil, err
	}

	var parts []schemas.TaskParticipantResponse
	for _, p := range dbParts {
		parts = append(parts, schemas.TaskParticipantResponse{
			ID:       p.ID.String(),
			FullName: strings.TrimSpace(p.FirstName.String + " " + p.LastName.String),
			Email:    p.EmailID,
			Role:     p.TpRole,
		})
	}

	dbRems, err := s.queries.GetTaskReminders(ctx, tID)
	if err != nil {
		return nil, err
	}

	var rems []schemas.ReminderResponse
	for _, r := range dbRems {
		var rVal *int
		if r.RecurrenceValue.Valid {
			v := int(r.RecurrenceValue.Int32)
			rVal = &v
		}
		var rUnit *string
		if r.RecurrenceUnit.Valid {
			u := string(r.RecurrenceUnit.RecurrenceUnit)
			rUnit = &u
		}

		rems = append(rems, schemas.ReminderResponse{
			ID:              r.ID.String(),
			ScheduledAt:     r.ScheduledAt,
			Channel:         string(r.Channel),
			Status:          string(r.Status.ReminderStatus),
			RecurrenceValue: rVal,
			RecurrenceUnit:  rUnit,
		})
	}
	if parts == nil {
		parts = []schemas.TaskParticipantResponse{}
	}
	if rems == nil {
		rems = []schemas.ReminderResponse{}
	}

	dbAtts, _ := s.queries.GetTaskAttachments(ctx, uuid.NullUUID{UUID: tID, Valid: true})

	var atts []schemas.AttachmentPayload
	for _, a := range dbAtts {
		att := schemas.AttachmentPayload{
			ID:       a.ID.String(),
			FileName: a.FileName,
			FileURL:  a.FileUrl,
			FileType: a.FileType,
			FileSize: a.FileSizeBytes.Int64,
		}
		if a.TranscriptionStatus.Valid {
			att.TranscriptionStatus = string(a.TranscriptionStatus.TranscriptionStatus)
			att.TranscriptionText = a.TranscriptText.String
		}
		if a.TranscodeStatus.Valid && a.TranscodeStatus.AudioTranscodeStatus == "COMPLETED" {
			att.PlaybackURL = a.TranscodedFileUrl.String
		}
		atts = append(atts, att)
	}
	if atts == nil {
		atts = []schemas.AttachmentPayload{}
	}
	s.presignAttachments(ctx, atts)

	dbTask, err := s.queries.GetTaskByID(ctx, tID)
	if err != nil {
		return nil, err
	}
	var dueDate *time.Time
	if dbTask.DueDate.Valid {
		dueDate = &dbTask.DueDate.Time
	}
	var createdAt *time.Time
	if dbTask.CreatedAt.Valid {
		createdAt = &dbTask.CreatedAt.Time
	}
	taskResp := schemas.TaskResponse{
		ID:                dbTask.ID.String(),
		TeamID:            dbTask.TeamID.String(),
		Title:             dbTask.Title,
		Description:       dbTask.Description.String,
		Status:            string(dbTask.Status.TaskStatus),
		FulfillmentStatus: string(dbTask.FulfillmentStatus.TaskFulfillmentStatus),
		ReviewStatus:      string(dbTask.ReviewStatus),
		CreatedBy:         dbTask.CreatedBy.String(),
		DueDate:           dueDate,
		CreatedAt:         createdAt,
	}

	return &schemas.FullTaskDetailsResponse{
		Task:         taskResp,
		Participants: parts,
		Reminders:    rems,
		Attachments:  atts,
	}, nil

}

func (s *TaskService) UpdateTaskDetails(ctx context.Context, taskID string, req schemas.UpdateTaskRequest, userid string, callerOrgID string) error {
	tID := util.ParseUUID(taskID)
	orgID := util.ParseUUID(callerOrgID)
	if err := s.assertTaskInOrg(ctx, tID, orgID); err != nil {
		return err
	}
	if err := s.assertUsersInOrg(ctx, req.AssigneeIDs, orgID); err != nil {
		return err
	}
	if err := s.assertUsersInOrg(ctx, req.SubscriberIDs, orgID); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	// 1. Safely handle the nullable Due Date pointer
	var safeDueDate sql.NullTime
	if req.DueDate != nil {
		safeDueDate = sql.NullTime{Time: *req.DueDate, Valid: true}
	}

	// 1. Update Base Info
	err = qtx.UpdateTaskDetails(ctx, db.UpdateTaskDetailsParams{
		Title:       req.Title,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
		DueDate:     safeDueDate, // <-- Pass the safe variable here
		ID:          tID,
	})
	if err != nil {
		return err
	}

	// 2. Diff Participants to send notifications
	oldParts, _ := qtx.GetTaskParticipants(ctx, tID)
	oldMap := make(map[string]bool)
	for _, p := range oldParts {
		oldMap[p.ID.String()] = true
	}

	_ = qtx.DeleteTaskParticipants(ctx, tID)

	for _, assigneeID := range req.AssigneeIDs {
		uID := util.ParseUUID(assigneeID)
		_ = qtx.AddTaskParticipant(ctx, db.AddTaskParticipantParams{TaskID: tID, UserID: uID, Role: db.ParticipantRoleASSIGNEE})
		if !oldMap[assigneeID] { // Only notify if they are NEW
			_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
				UserID: uID, Title: "Task Assignment Updated", Message: fmt.Sprintf("You have been added to the task: %s", req.Title),
			})
		}
	}

	for _, subID := range req.SubscriberIDs {
		uID := util.ParseUUID(subID)
		_ = qtx.AddTaskParticipant(ctx, db.AddTaskParticipantParams{TaskID: tID, UserID: uID, Role: db.ParticipantRoleSUBSCRIBER})
		if !oldMap[subID] { // Only notify if they are NEW
			_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
				UserID: uID, Title: "Added to Task Loop", Message: fmt.Sprintf("You are now subscribed to: %s", req.Title),
			})
		}
	}

	// 3. Rebuild Reminders (Wipes old DB rows, inserts new ones)
	// TODO: dont wipe db rows and rebuild, keep the existing ones if unchanged
	_ = qtx.DeleteTaskReminders(ctx, tID)
	for _, rem := range req.Reminders {
		remParams := db.CreateReminderParams{TaskID: tID, ScheduledAt: rem.ScheduledAt, Channel: db.ReminderChannel(rem.Channel)}
		if rem.RecurrenceValue != nil && rem.RecurrenceUnit != nil {
			remParams.RecurrenceValue = sql.NullInt32{Int32: int32(*rem.RecurrenceValue), Valid: true}
			remParams.RecurrenceUnit = db.NullRecurrenceUnit{RecurrenceUnit: db.RecurrenceUnit(*rem.RecurrenceUnit), Valid: true}
		}
		_, _ = qtx.CreateReminder(ctx, remParams)
	}

	// Diff Task Attachments instead of wiping
	uID := util.ParseUUID(userid)
	s3URLsToDelete := s.diffAttachments(ctx, qtx, uuid.NullUUID{UUID: tID, Valid: true}, uID, req.Attachments)

	if err := tx.Commit(); err != nil {
		return err
	}

	if len(s3URLsToDelete) > 0 {
		go s.s3Service.DeleteObjects(context.Background(), s3URLsToDelete)
	}
	return nil
}

func (s *TaskService) GetAdminAllTasks(ctx context.Context, adminID string, limit, offset int32) (*schemas.PaginatedTaskResponse, error) {
	dbTasks, err := s.queries.GetAdminAllTasks(ctx, db.GetAdminAllTasksParams{
		UserID: util.ParseUUID(adminID),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
	var totalCount int64 = 0

	if len(dbTasks) > 0 {
		totalCount = dbTasks[0].TotalCount
	}

	for _, t := range dbTasks {
		var dueDate *time.Time
		if t.DueDate.Valid {
			dueDate = &t.DueDate.Time
		}
		var createdAt *time.Time
		if t.CreatedAt.Valid {
			createdAt = &t.CreatedAt.Time
		}

		tasks = append(tasks, schemas.TaskResponse{
			ID:                t.ID.String(),
			TeamID:            t.TeamID.String(),
			TeamName:          t.TeamName,
			Title:             t.Title,
			Description:       t.Description.String,
			Status:            string(t.Status.TaskStatus),
			FulfillmentStatus: string(t.FulfillmentStatus.TaskFulfillmentStatus),
			ReviewStatus:      string(t.ReviewStatus),
			CreatedBy:         t.CreatedBy.String(),
			CreatorName:       strings.TrimSpace(t.FirstName.String + " " + t.LastName.String),
			DueDate:           dueDate,
			CreatedAt:         createdAt,
		})
	}

	if tasks == nil {
		tasks = []schemas.TaskResponse{}
	}

	return &schemas.PaginatedTaskResponse{
		TotalCount: totalCount,
		Tasks:      tasks,
	}, nil
}

func (s *TaskService) ReopenTask(ctx context.Context, taskID string, userID string, req schemas.ActionTaskRequest) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)
	uID := util.ParseUUID(userID)

	// 1. Change Status back to OPEN
	err = qtx.UpdateTaskStatus(ctx, db.UpdateTaskStatusParams{
		Status: db.NullTaskStatus{TaskStatus: db.TaskStatusOPEN, Valid: true},
		ID:     tID,
	})
	if err != nil {
		return err
	}

	// change fullfillment status to PENDING
	err = qtx.UpdateTaskFulfillment(ctx, db.UpdateTaskFulfillmentParams{
		FulfillmentStatus: db.NullTaskFulfillmentStatus{TaskFulfillmentStatus: db.TaskFulfillmentStatusPENDING, Valid: true},
		ID:                tID,
	})

	// 2. Update Deadline safely
	var safeDueDate sql.NullTime
	if req.DueDate != nil {
		safeDueDate = sql.NullTime{Time: *req.DueDate, Valid: true}
	}
	_ = qtx.UpdateTaskDeadline(ctx, db.UpdateTaskDeadlineParams{
		ID:      tID,
		DueDate: safeDueDate,
	})

	// 3. Handle the optional Note as a Timeline Update
	if strings.TrimSpace(req.Note) != "" {
		qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
			TaskID:  tID,
			UserID:  uuid.NullUUID{UUID: uID, Valid: true},
			Content: fmt.Sprintf("TASK REOPENED: %s", req.Note),
		})
	}

	// Rebuild Reminders
	_ = qtx.DeleteTaskReminders(ctx, tID)
	for _, rem := range req.Reminders {
		remParams := db.CreateReminderParams{TaskID: tID, ScheduledAt: rem.ScheduledAt, Channel: db.ReminderChannel(rem.Channel)}
		if rem.RecurrenceValue != nil && rem.RecurrenceUnit != nil {
			remParams.RecurrenceValue = sql.NullInt32{Int32: int32(*rem.RecurrenceValue), Valid: true}
			remParams.RecurrenceUnit = db.NullRecurrenceUnit{RecurrenceUnit: db.RecurrenceUnit(*rem.RecurrenceUnit), Valid: true}
		}
		_, _ = qtx.CreateReminder(ctx, remParams)
	}

	// 5. Mass-Notify Participants
	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	participants, _ := qtx.GetTaskParticipants(ctx, tID)

	for _, p := range participants {
		// We notify EVERYONE, even the admin doing it, so it's a clear system record
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  p.ID,
			Title:   "Task Reopened",
			Message: fmt.Sprintf("Task '%s' has been reopened and requires your attention.", taskTitle),
		})
	}

	return tx.Commit()
}

func (s *TaskService) GetTaskUpdates(ctx context.Context, taskID string, limit, offset int32, callerOrgID string) ([]schemas.TaskUpdateResponse, error) {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	updates, err := s.queries.GetTaskUpdates(ctx, db.GetTaskUpdatesParams{
		TaskID: tID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var updateIDs []uuid.UUID
	for _, u := range updates {
		updateIDs = append(updateIDs, u.ID)
	}

	dbUpdateAtts, _ := s.queries.GetTaskUpdateAttachments(ctx, updateIDs)
	attMap := make(map[string][]schemas.AttachmentPayload)
	for _, a := range dbUpdateAtts {
		uIDStr := a.TaskUpdateID.UUID.String()
		att := schemas.AttachmentPayload{
			ID:       a.ID.String(),
			FileName: a.FileName,
			FileURL:  a.FileUrl,
			FileType: a.FileType,
			FileSize: a.FileSizeBytes.Int64,
		}
		if a.TranscriptionStatus.Valid {
			att.TranscriptionStatus = string(a.TranscriptionStatus.TranscriptionStatus)
			att.TranscriptionText = a.TranscriptText.String
		}
		if a.TranscodeStatus.Valid && a.TranscodeStatus.AudioTranscodeStatus == "COMPLETED" {
			att.PlaybackURL = a.TranscodedFileUrl.String
		}
		attMap[uIDStr] = append(attMap[uIDStr], att)
	}
	for _, atts := range attMap {
		s.presignAttachments(ctx, atts)
	}

	var mapped []schemas.TaskUpdateResponse
	for _, u := range updates {
		uID := u.ID.String()
		mapped = append(mapped, schemas.TaskUpdateResponse{
			ID:           uID,
			TaskID:       u.TaskID.String(),
			UserID:       u.UserID.UUID.String(),
			FirstName:    u.FirstName.String,
			LastName:     u.LastName.String,
			Content:      u.Content,
			CreatedAt:    u.CreatedAt.Time.Format(time.RFC3339),
			CommentCount: u.CommentCount,
			Attachments:  attMap[uID],
		})
	}

	if mapped == nil {
		mapped = []schemas.TaskUpdateResponse{}
	}
	return mapped, nil
}

func (s *TaskService) GetUpdateComments(ctx context.Context, updateID string, limit, offset int32, callerOrgID string) ([]schemas.TaskUpdateCommentResponse, error) {
	uID := util.ParseUUID(updateID)
	if err := s.assertTaskUpdateInOrg(ctx, uID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	dbComments, err := s.queries.GetUpdateComments(ctx, db.GetUpdateCommentsParams{
		TaskUpdateID: uID,
		Limit:        limit,
		Offset:       offset,
	})
	if err != nil {
		return nil, err
	}
	// get all comment ids (loopholoes to avoid n+1 queries)
	var commentIDs []uuid.UUID
	for _, c := range dbComments {
		commentIDs = append(commentIDs, c.ID)
	}
	attachments, err := s.queries.GetTaskCommentAttachments(ctx, commentIDs)
	if err != nil {
		return nil, err
	}
	aM := make(map[string][]schemas.AttachmentPayload) // [comment_id] -> [attch_ids]
	for _, att := range attachments {
		// get comment id
		if att.TaskCommentID.Valid {
			payload := schemas.AttachmentPayload{
				ID:       att.ID.String(),
				FileName: att.FileName,
				FileURL:  att.FileUrl,
				FileType: att.FileType,
				FileSize: att.FileSizeBytes.Int64,
			}
			if att.TranscriptionStatus.Valid {
				payload.TranscriptionStatus = string(att.TranscriptionStatus.TranscriptionStatus)
				payload.TranscriptionText = att.TranscriptText.String
			}
			if att.TranscodeStatus.Valid && att.TranscodeStatus.AudioTranscodeStatus == "COMPLETED" {
				payload.PlaybackURL = att.TranscodedFileUrl.String
			}
			aM[att.TaskCommentID.UUID.String()] = append(aM[att.TaskCommentID.UUID.String()], payload)
		}
	}
	for _, atts := range aM {
		s.presignAttachments(ctx, atts)
	}

	var comments []schemas.TaskUpdateCommentResponse
	for _, c := range dbComments {

		comments = append(comments, schemas.TaskUpdateCommentResponse{
			ID:          c.ID.String(),
			UserID:      c.UserID.UUID.String(),
			FirstName:   c.FirstName.String,
			LastName:    c.LastName.String,
			Content:     c.Content,
			CreatedAt:   c.CreatedAt.Time.Format(time.RFC3339),
			Attachments: aM[c.ID.String()],
		})
	}

	if comments == nil {
		comments = []schemas.TaskUpdateCommentResponse{}
	}
	return comments, nil
}

func (s *TaskService) PostTaskUpdate(ctx context.Context, taskID string, userID string, req schemas.AddTaskUpdateRequest, callerOrgID string) error {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	uID := util.ParseUUID(userID)

	// 1. Insert Update
	updateRec, err := qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
		TaskID:  tID,
		UserID:  uuid.NullUUID{UUID: uID, Valid: true},
		Content: req.Content,
	})
	if err != nil {
		return err
	}

	// update attachments
	for _, att := range req.Attachments {
		insertAttachmentWithTranscription(ctx, qtx, db.InsertAttachmentParams{
			TaskID:        uuid.NullUUID{},
			TaskUpdateID:  uuid.NullUUID{UUID: updateRec.ID, Valid: true},
			TaskCommentID: uuid.NullUUID{},
			FileName:      att.FileName,
			FileUrl:       att.FileURL,
			FileType:      att.FileType,
			FileSizeBytes: sql.NullInt64{Int64: att.FileSize, Valid: true},
			UploadedBy:    uID,
		})

	}

	// 2. Data for Notifications
	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	participants, _ := qtx.GetTaskParticipants(ctx, tID)

	var authorName string = "Someone"
	for _, p := range participants {
		if p.ID == uID {
			authorName = strings.TrimSpace(p.FirstName.String + " " + p.LastName.String)
			break
		}
	}

	snippet := req.Content
	if len(snippet) > 40 {
		snippet = snippet[:37] + "..."
	}

	// 3. Handle @Mentions First
	mentionedMap := make(map[string]bool)
	for _, mIDStr := range req.MentionedUserIDs {
		mID := util.ParseUUID(mIDStr)
		mentionedMap[mIDStr] = true

		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  mID,
			Title:   "You were mentioned!",
			Message: fmt.Sprintf("%s mentioned you: %s", authorName, snippet),
		})
	}

	// 4. Handle Standard Participants (skip author and anyone already mentioned)
	for _, p := range participants {
		if p.ID != uID && !mentionedMap[p.ID.String()] {
			_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
				UserID:  p.ID,
				Title:   fmt.Sprintf("Update: %s", taskTitle),
				Message: fmt.Sprintf("%s posted: %s", authorName, snippet),
			})
		}
	}

	return tx.Commit()
}

func (s *TaskService) PostUpdateComment(ctx context.Context, taskID, updateID, userID string, req schemas.AddCommentRequest, callerOrgID string) error { // <-- UPDATED SIGNATURE
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	uID := util.ParseUUID(updateID)
	cID := util.ParseUUID(userID)

	// 1. Insert Comment
	c, err := qtx.AddUpdateComment(ctx, db.AddUpdateCommentParams{
		TaskUpdateID: uID,
		UserID:       uuid.NullUUID{UUID: cID, Valid: true},
		Content:      req.Content,
	})
	if err != nil {
		return err
	}

	// insert attachments
	for _, att := range req.Attachments {
		err = insertAttachmentWithTranscription(ctx, qtx, db.InsertAttachmentParams{
			TaskID:        uuid.NullUUID{},
			TaskUpdateID:  uuid.NullUUID{},
			TaskCommentID: uuid.NullUUID{UUID: c, Valid: true},
			FileName:      att.FileName,
			FileUrl:       att.FileURL,
			FileType:      att.FileType,
			FileSizeBytes: sql.NullInt64{Int64: att.FileSize, Valid: true},
			UploadedBy:    cID,
		})
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Notifications run outside the transaction so a failure never rolls back the comment.
	go func() {
		nctx := context.Background()
		q := s.queries

		uniqueMentionedIds := make([]string, 0)
		mentionMap := make(map[string]bool)
		for _, id := range req.MentionedUserIDs {
			if !mentionMap[id] {
				mentionMap[id] = true
				uniqueMentionedIds = append(uniqueMentionedIds, id)
			}
		}

		taskTitle, _ := q.GetTaskDetailsForNotifications(nctx, tID)
		commentAuthor, _ := q.GetUserNameByID(nctx, cID)
		commentAuthorName := strings.TrimSpace(commentAuthor.FirstName.String + " " + commentAuthor.LastName.String)
		if commentAuthorName == "" {
			commentAuthorName = "Someone"
		}

		for _, mIDStr := range uniqueMentionedIds {
			mID := util.ParseUUID(mIDStr)
			_ = q.CreateNotification(nctx, db.CreateNotificationParams{
				UserID:  mID,
				Title:   "Mentioned in comment!",
				Message: fmt.Sprintf("%s mentioned you in a comment on: %s", commentAuthorName, taskTitle),
			})
		}

		updateAuthor, err := q.GetTaskUpdateAuthor(nctx, uID)
		updateAuthorIdStr := updateAuthor.UUID.String()
		if err == nil && updateAuthor.UUID != cID && !mentionMap[updateAuthorIdStr] {
			_ = q.CreateNotification(nctx, db.CreateNotificationParams{
				UserID:  updateAuthor.UUID,
				Title:   "New comment on your task update",
				Message: "Someone replied to your task update.",
			})
		}
	}()

	return nil
}

// 2. Fetch tasks where the employee is an Assignee or Subscriber
func (s *TaskService) GetEmployeeTasks(ctx context.Context, teamID string, userID string, limit, offset int32, callerOrgID string) (*schemas.PaginatedTaskResponse, error) {
	tID := util.ParseUUID(teamID)
	if err := s.assertTeamInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	dbTasks, err := s.queries.GetEmployeeTasks(ctx, db.GetEmployeeTasksParams{
		TeamID: tID,
		UserID: util.ParseUUID(userID),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
	var totalCount int64 = 0

	if len(dbTasks) > 0 {
		totalCount = dbTasks[0].TotalCount
	}

	for _, t := range dbTasks {
		var dueDate *time.Time
		if t.DueDate.Valid {
			dueDate = &t.DueDate.Time
		}
		var createdAt *time.Time
		if t.CreatedAt.Valid {
			createdAt = &t.CreatedAt.Time
		}

		tasks = append(tasks, schemas.TaskResponse{
			ID:                t.ID.String(),
			TeamID:            t.TeamID.String(),
			Title:             t.Title,
			Description:       t.Description.String,
			Status:            string(t.Status.TaskStatus),
			FulfillmentStatus: string(t.FulfillmentStatus.TaskFulfillmentStatus),
			ReviewStatus:      string(t.ReviewStatus),
			CreatedBy:         t.CreatedBy.String(),
			CreatorName:       strings.TrimSpace(t.FirstName.String + " " + t.LastName.String),
			DueDate:           dueDate,
			CreatedAt:         createdAt,
		})
	}

	if tasks == nil {
		tasks = []schemas.TaskResponse{}
	}

	return &schemas.PaginatedTaskResponse{
		TotalCount: totalCount,
		Tasks:      tasks,
	}, nil
}

func (s *TaskService) SubmitTaskForReview(ctx context.Context, taskID string, userID string) error {
	tID := util.ParseUUID(taskID)
	uID := util.ParseUUID(userID)

	isAssignee, err := s.queries.IsTaskAssignee(ctx, db.IsTaskAssigneeParams{TaskID: tID, UserID: uID})
	if err != nil || !isAssignee {
		return fmt.Errorf("only assignees can submit a task for review")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	err = qtx.SubmitTaskState(ctx, tID)
	if err != nil {
		return fmt.Errorf("failed to update state: %w", err)
	}

	// Assignee's work is done; stop reminders from firing while it's awaiting admin review.
	_ = qtx.CancelTaskReminders(ctx, tID)

	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	userRec, _ := qtx.GetUserNameByID(ctx, uID)
	userName := strings.TrimSpace(userRec.FirstName.String + " " + userRec.LastName.String)

	_, _ = qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
		TaskID: tID, UserID: uuid.NullUUID{UUID: uID, Valid: true}, Content: "Task submitted for Admin review.",
	})

	admins, _ := qtx.GetTeamAdminsByTask(ctx, tID)
	for _, adminID := range admins {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID: adminID, Title: "Task Ready for Review", Message: fmt.Sprintf("%s submitted: %s", userName, taskTitle),
		})
	}
	return tx.Commit()
}
func (s *TaskService) ApproveTask(ctx context.Context, taskID string, adminID string, callerOrgID string) error {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	aID := util.ParseUUID(adminID)

	err = qtx.ApproveTaskState(ctx, tID)
	if err != nil {
		return err
	}

	_ = s.scoreService.RecordApprovalTx(ctx, qtx, tID, time.Now())

	_ = qtx.DeleteTaskReminders(ctx, tID)

	_, _ = qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
		TaskID: tID, UserID: uuid.NullUUID{UUID: aID, Valid: true}, Content: "Task Approved and Closed.",
	})

	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	participants, _ := qtx.GetTaskParticipants(ctx, tID)
	for _, p := range participants {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID: p.ID, Title: "Task Approved", Message: fmt.Sprintf("Yay '%s' was approved.", taskTitle),
		})
	}

	assigneePhones, _ := qtx.GetTaskAssigneePhones(ctx, tID)

	if err := tx.Commit(); err != nil {
		return err
	}

	s.notifyAssigneesWhatsapp(ctx, assigneePhones, taskTitle, "approved and closed")

	return nil
}

// Best-effort WhatsApp fan-out to a task's assignees. Call only after the
// state-changing transaction has committed — a failed send shouldn't roll back
// an approval/rejection that already happened.
func (s *TaskService) notifyAssigneesWhatsapp(ctx context.Context, phones []sql.NullString, taskTitle string, status string) {
	for _, phone := range phones {
		if !phone.Valid || phone.String == "" {
			continue
		}
		_ = s.onionApp.Enqueue(ctx, "send_task_status_whatsapp", map[string]any{
			"rPN":      phone.String,
			"taskName": taskTitle,
			"status":   status,
		})
	}
}

// Handles BOTH Reject and Reopen since the database logic/reminders are identical,
// just the final Database State changes.
func (s *TaskService) ActionTask(ctx context.Context, action string, taskID string, userID string, req schemas.ActionTaskRequest, callerOrgID string) error {
	tID := util.ParseUUID(taskID)
	if err := s.assertTaskInOrg(ctx, tID, util.ParseUUID(callerOrgID)); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	uID := util.ParseUUID(userID)

	var safeDueDate sql.NullTime
	if req.DueDate != nil {
		safeDueDate = sql.NullTime{Time: *req.DueDate, Valid: true}
	}

	var actionMsg string
	if action == "REJECT" {
		err = qtx.RejectTaskState(ctx, db.RejectTaskStateParams{ID: tID, DueDate: safeDueDate})
		actionMsg = "TASK REJECTED"
	} else {
		err = qtx.ReopenTaskState(ctx, db.ReopenTaskStateParams{ID: tID, DueDate: safeDueDate})
		actionMsg = "TASK REOPENED"
	}
	if err != nil {
		return err
	}

	if action == "REJECT" {
		_ = s.scoreService.RecordRejectionTx(ctx, qtx, tID)
	} else {
		_ = s.scoreService.RecordReopenTx(ctx, qtx, tID)
	}

	if strings.TrimSpace(req.Note) != "" {
		qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
			TaskID: tID, UserID: uuid.NullUUID{UUID: uID, Valid: true}, Content: fmt.Sprintf("%s: %s", actionMsg, req.Note),
		})
	}

	// Just delete reminders from DB
	_ = qtx.DeleteTaskReminders(ctx, tID)

	// Rebuild the fresh ones from the Reopen/Reject Modal payload
	for _, rem := range req.Reminders {
		remParams := db.CreateReminderParams{
			TaskID:      tID,
			ScheduledAt: rem.ScheduledAt,
			Channel:     db.ReminderChannel(rem.Channel),
		}
		if rem.RecurrenceValue != nil && rem.RecurrenceUnit != nil {
			remParams.RecurrenceValue = sql.NullInt32{Int32: int32(*rem.RecurrenceValue), Valid: true}
			remParams.RecurrenceUnit = db.NullRecurrenceUnit{RecurrenceUnit: db.RecurrenceUnit(*rem.RecurrenceUnit), Valid: true}
		}
		_, _ = qtx.CreateReminder(ctx, remParams)
	}

	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	participants, _ := qtx.GetTaskParticipants(ctx, tID)
	for _, p := range participants {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID: p.ID, Title: "Task " + strings.Title(strings.ToLower(action)), Message: fmt.Sprintf("'%s' requires your attention.", taskTitle),
		})
	}

	var assigneePhones []sql.NullString
	if action == "REJECT" {
		assigneePhones, _ = qtx.GetTaskAssigneePhones(ctx, tID)
	}

	// Diff Task Attachments instead of wiping
	s3URLsToDelete := s.diffAttachments(ctx, qtx, uuid.NullUUID{UUID: tID, Valid: true}, uID, req.Attachments)

	if err := tx.Commit(); err != nil {
		return err
	}

	if action == "REJECT" {
		s.notifyAssigneesWhatsapp(ctx, assigneePhones, taskTitle, "rejected and reassigned")
	}

	if len(s3URLsToDelete) > 0 {
		go s.s3Service.DeleteObjects(context.Background(), s3URLsToDelete)
	}
	return nil
}

func (s *TaskService) GetEmployeeTeams(ctx context.Context, userID string) ([]schemas.TeamResponse, error) {
	dbTeams, err := s.queries.GetEmployeeTeams(ctx, util.ParseUUID(userID))
	if err != nil {
		return nil, err
	}

	var teams []schemas.TeamResponse
	for _, t := range dbTeams {
		teams = append(teams, schemas.TeamResponse{
			ID:          t.ID.String(),
			Name:        t.Name,
			MemberCount: int(t.MemberCount),
			Role:        string(t.TeamRole),
		})
	}

	if teams == nil {
		teams = []schemas.TeamResponse{}
	}
	return teams, nil
}

func (s *TaskService) GetTranscription(ctx context.Context, attachmentID string, callerOrgID string) (*schemas.TranscriptionResponse, error) {
	aID := util.ParseUUID(attachmentID)
	if err := s.assertAttachmentInOrg(ctx, aID, util.ParseUUID(callerOrgID)); err != nil {
		return nil, err
	}

	t, err := s.queries.GetTranscriptionByAttachmentID(ctx, aID)
	if err != nil {
		return nil, err
	}
	return &schemas.TranscriptionResponse{
		Status:         string(t.Status.TranscriptionStatus),
		TranscriptText: t.TranscriptText.String,
		ErrorMessage:   t.ErrorMessage.String,
	}, nil
}
