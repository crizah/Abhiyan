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
	db       *sql.DB
	queries  *db.Queries
	onionApp *app.App
}

func NewTaskService(dbConn *sql.DB, o *app.App) *TaskService {
	return &TaskService{
		db:       dbConn,
		queries:  db.New(dbConn),
		onionApp: o,
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

	// 2. Add Assignees and get their email ids
	var assigneeEmails []string
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

		email, _ := qtx.GetEmailByUser(ctx, uID)
		assigneeEmails = append(assigneeEmails, email)

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
			ReviewStatus:      string(t.ReviewStatus),
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
	tID := util.ParseUUID(taskID)

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

func (s *TaskService) GetFullTaskDetails(ctx context.Context, taskID string) (*schemas.FullTaskDetailsResponse, error) {
	tID := util.ParseUUID(taskID)

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

	return &schemas.FullTaskDetailsResponse{
		Participants: parts,
		Reminders:    rems,
	}, nil

}

func (s *TaskService) UpdateTaskDetails(ctx context.Context, taskID string, req schemas.UpdateTaskRequest) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)

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

	return tx.Commit()
}

func (s *TaskService) GetAdminAllTasks(ctx context.Context, adminID string) ([]schemas.TaskResponse, error) {
	dbTasks, err := s.queries.GetAdminAllTasks(ctx, util.ParseUUID(adminID))
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
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
			TeamName:          t.TeamName, // Map the team name
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
	return tasks, nil
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

func (s *TaskService) GetTaskUpdates(ctx context.Context, taskID string) ([]schemas.TaskUpdateResponse, error) {
	tID := util.ParseUUID(taskID)

	// 1. Fetch Updates
	updates, err := s.queries.GetTaskUpdates(ctx, tID)
	if err != nil {
		return nil, err
	}

	// 2. Fetch all Comments for this entire task
	dbComments, _ := s.queries.GetTaskUpdateComments(ctx, tID)

	// Group comments by their parent Update ID
	commentsMap := make(map[string][]schemas.TaskUpdateCommentResponse)
	for _, c := range dbComments {
		uID := c.TaskUpdateID.String()
		commentsMap[uID] = append(commentsMap[uID], schemas.TaskUpdateCommentResponse{
			ID:        c.ID.String(),
			UserID:    c.UserID.UUID.String(),
			FirstName: c.FirstName.String,
			LastName:  c.LastName.String,
			Content:   c.Content,
			CreatedAt: c.CreatedAt.Time.Format(time.RFC3339),
		})
	}

	// 3. Map together
	var mapped []schemas.TaskUpdateResponse
	for _, u := range updates {
		uID := u.ID.String()
		mapped = append(mapped, schemas.TaskUpdateResponse{
			ID:        uID,
			TaskID:    u.TaskID.String(),
			UserID:    u.UserID.UUID.String(),
			FirstName: u.FirstName.String,
			LastName:  u.LastName.String,
			Content:   u.Content,
			CreatedAt: u.CreatedAt.Time.Format(time.RFC3339),
			Comments:  commentsMap[uID], // Attach comments or nil
		})
	}

	if mapped == nil {
		mapped = []schemas.TaskUpdateResponse{}
	}
	return mapped, nil
}
func (s *TaskService) PostTaskUpdate(ctx context.Context, taskID string, userID string, req schemas.AddTaskUpdateRequest) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)
	uID := util.ParseUUID(userID)

	// 1. Insert Update
	_, err = qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
		TaskID:  tID,
		UserID:  uuid.NullUUID{UUID: uID, Valid: true},
		Content: req.Content,
	})
	if err != nil {
		return err
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
func (s *TaskService) PostUpdateComment(ctx context.Context, taskID, updateID, userID string, req schemas.AddCommentRequest) error { // <-- UPDATED SIGNATURE
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	uID := util.ParseUUID(updateID)
	cID := util.ParseUUID(userID)
	tID := util.ParseUUID(taskID)

	// 1. Insert Comment
	_, err = qtx.AddUpdateComment(ctx, db.AddUpdateCommentParams{
		TaskUpdateID: uID,
		UserID:       uuid.NullUUID{UUID: cID, Valid: true},
		Content:      req.Content,
	})
	if err != nil {
		return err
	}

	// 2. Notifications Logic

	// De-duplicate mentioned user IDs
	uniqueMentionedIds := make([]string, 0)
	mentionMap := make(map[string]bool)
	for _, id := range req.MentionedUserIDs {
		if !mentionMap[id] {
			mentionMap[id] = true
			uniqueMentionedIds = append(uniqueMentionedIds, id)
		}
	}

	// Reusable notification creation/messaging logic
	createMentionNotification := func(ctx context.Context, qtx *db.Queries, mentionedUserID, commentAuthorName, taskTitle string) {
		mID := util.ParseUUID(mentionedUserID)
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  mID,
			Title:   "Mentioned in comment!",
			Message: fmt.Sprintf("%s mentioned you in a comment on: %s", commentAuthorName, taskTitle),
		})
	}

	createAuthorNotification := func(ctx context.Context, qtx *db.Queries, authorID uuid.UUID) {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:  authorID,
			Title:   "New comment on your task update",
			Message: "Someone replied to your task update.",
		})
	}

	// Fetch required names/titles
	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	commentAuthor, _ := qtx.GetUserNameByID(ctx, cID)
	commentAuthorName := strings.TrimSpace(commentAuthor.FirstName.String + " " + commentAuthor.LastName.String)
	if commentAuthorName == "" {
		commentAuthorName = "Someone"
	}

	// 3. Loop through mentioned users, trigger notifications
	for _, mIDStr := range uniqueMentionedIds {
		createMentionNotification(ctx, qtx, mIDStr, commentAuthorName, taskTitle)
	}

	// 4. Notify the original author of the update (if not commenting on own post and not mentioned)
	updateAuthor, err := qtx.GetTaskUpdateAuthor(ctx, uID)
	updateAuthorIdStr := updateAuthor.UUID.String()
	if err == nil && updateAuthor.UUID != cID && !mentionMap[updateAuthorIdStr] { // Don't notify if author posted comment OR already mentioned
		createAuthorNotification(ctx, qtx, updateAuthor.UUID)
	}

	return tx.Commit()
}

// 2. Fetch tasks where the employee is an Assignee or Subscriber
func (s *TaskService) GetEmployeeTasks(ctx context.Context, teamID string, userID string) ([]schemas.TaskResponse, error) {
	dbTasks, err := s.queries.GetEmployeeTasks(ctx, db.GetEmployeeTasksParams{
		TeamID: util.ParseUUID(teamID),
		UserID: util.ParseUUID(userID),
	})
	if err != nil {
		return nil, err
	}

	var tasks []schemas.TaskResponse
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
	return tasks, nil
}

func (s *TaskService) SubmitTaskForReview(ctx context.Context, taskID string, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)
	uID := util.ParseUUID(userID)

	// NEW: Use the combined state updater
	err = qtx.SubmitTaskState(ctx, tID)
	if err != nil {
		return fmt.Errorf("failed to update state: %w", err)
	}

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
func (s *TaskService) ApproveTask(ctx context.Context, taskID string, adminID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)
	aID := util.ParseUUID(adminID)

	err = qtx.ApproveTaskState(ctx, tID)
	if err != nil {
		return err
	}

	// 1. Just delete the reminders directly from the DB
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
	return tx.Commit()
}

// Handles BOTH Reject and Reopen since the database logic/reminders are identical,
// just the final Database State changes.
func (s *TaskService) ActionTask(ctx context.Context, action string, taskID string, userID string, req schemas.ActionTaskRequest) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)
	tID := util.ParseUUID(taskID)
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

	if strings.TrimSpace(req.Note) != "" {
		qtx.AddTaskUpdate(ctx, db.AddTaskUpdateParams{
			TaskID: tID, UserID: uuid.NullUUID{UUID: uID, Valid: true}, Content: fmt.Sprintf("%s: %s", actionMsg, req.Note),
		})
	}

	// Just delete reminders from DB
	_ = qtx.DeleteTaskReminders(ctx, tID)

	taskTitle, _ := qtx.GetTaskDetailsForNotifications(ctx, tID)
	participants, _ := qtx.GetTaskParticipants(ctx, tID)
	for _, p := range participants {
		_ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID: p.ID, Title: "Task " + strings.Title(strings.ToLower(action)), Message: fmt.Sprintf("'%s' requires your attention.", taskTitle),
		})
	}

	return tx.Commit()
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
