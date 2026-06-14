package schemas

import "time"

// --- REQUESTS ---

type CreateTaskRequest struct {
	TeamID        string                  `json:"team_id" binding:"required,uuid"`
	Title         string                  `json:"title" binding:"required,max=255"`
	Description   string                  `json:"description"`
	DueDate       *time.Time              `json:"due_date"`
	AssigneeIDs   []string                `json:"assignee_ids" binding:"required,min=1"`
	SubscriberIDs []string                `json:"subscriber_ids"`
	Reminders     []CreateReminderPayload `json:"reminders"`
}

type UpdateTaskRequest struct {
	Title         string                  `json:"title" binding:"required,max=255"`
	Description   string                  `json:"description"`
	DueDate       *time.Time              `json:"due_date"`
	AssigneeIDs   []string                `json:"assignee_ids" binding:"required,min=1"`
	SubscriberIDs []string                `json:"subscriber_ids"`
	Reminders     []CreateReminderPayload `json:"reminders"`
}

type CreateReminderPayload struct {
	ScheduledAt     time.Time `json:"scheduled_at" binding:"required"`
	Channel         string    `json:"channel" binding:"required,oneof=WHATSAPP EMAIL"`
	RecurrenceValue *int      `json:"recurrence_value" binding:"omitempty,min=1,max=365"`
	RecurrenceUnit  *string   `json:"recurrence_unit" binding:"omitempty,required_with=RecurrenceValue,oneof=MINUTES HOURS DAYS WEEKS MONTHS"`
}

type AddTaskUpdateRequest struct {
	Content string `json:"content" binding:"required"`
}

type UpdateTaskStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=OPEN CLOSED FAILED"`
}

// --- RESPONSES ---

type TaskResponse struct {
	ID                string     `json:"id"`
	TeamID            string     `json:"team_id"`
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	TeamName          string     `json:"team_name,omitempty"`
	Status            string     `json:"status"`
	FulfillmentStatus string     `json:"fulfillment_status"`
	CreatedBy         string     `json:"created_by"`
	CreatorName       string     `json:"creator_name"`
	DueDate           *time.Time `json:"due_date"`
	CreatedAt         *time.Time `json:"created_at"`
}

// FIX: Clean mapping to prevent React `{String, Valid}` crash
type TaskUpdateResponse struct {
	ID        string `json:"id"`
	TaskID    string `json:"task_id"`
	UserID    string `json:"user_id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

type TaskParticipantResponse struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type ReminderResponse struct {
	ID              string    `json:"id"`
	ScheduledAt     time.Time `json:"scheduled_at"`
	Channel         string    `json:"channel"`
	Status          string    `json:"status"`
	RecurrenceValue *int      `json:"recurrence_value,omitempty"`
	RecurrenceUnit  *string   `json:"recurrence_unit,omitempty"`
}

type FullTaskDetailsResponse struct {
	Task         TaskResponse              `json:"task"`
	Participants []TaskParticipantResponse `json:"participants"`
	Reminders    []ReminderResponse        `json:"reminders"`
}
