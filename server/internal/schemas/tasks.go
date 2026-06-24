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
	Attachments   []AttachmentPayload     `json:"attachments"`
}

type UpdateTaskRequest struct {
	Title         string                  `json:"title" binding:"required,max=255"`
	Description   string                  `json:"description"`
	DueDate       *time.Time              `json:"due_date"`
	AssigneeIDs   []string                `json:"assignee_ids" binding:"required,min=1"`
	SubscriberIDs []string                `json:"subscriber_ids"`
	Reminders     []CreateReminderPayload `json:"reminders"`
	Attachments   []AttachmentPayload     `json:"attachments"`
}

type CreateReminderPayload struct {
	ScheduledAt     time.Time `json:"scheduled_at" binding:"required"`
	Channel         string    `json:"channel" binding:"required,oneof=WHATSAPP EMAIL"`
	RecurrenceValue *int      `json:"recurrence_value" binding:"omitempty,min=1,max=365"`
	RecurrenceUnit  *string   `json:"recurrence_unit" binding:"omitempty,required_with=RecurrenceValue,oneof=MINUTES HOURS DAYS WEEKS MONTHS"`
}

type AddTaskUpdateRequest struct {
	Content          string              `json:"content"`
	MentionedUserIDs []string            `json:"mentioned_user_ids"`
	Attachments      []AttachmentPayload `json:"attachments"`
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
	ReviewStatus      string     `json:"review_status"`
	CreatedBy         string     `json:"created_by"`
	CreatorName       string     `json:"creator_name"`
	DueDate           *time.Time `json:"due_date"`
	CreatedAt         *time.Time `json:"created_at"`
}

type PaginatedTaskResponse struct {
	TotalCount int64          `json:"total_count"`
	Tasks      []TaskResponse `json:"tasks"`
}

// FIX: Clean mapping to prevent React `{String, Valid}` crash
type TaskUpdateResponse struct {
	ID           string              `json:"id"`
	TaskID       string              `json:"task_id"`
	UserID       string              `json:"user_id"`
	FirstName    string              `json:"first_name"`
	LastName     string              `json:"last_name"`
	Content      string              `json:"content"`
	CreatedAt    string              `json:"created_at"`
	CommentCount int64               `json:"comment_count"`
	Attachments  []AttachmentPayload `json:"attachments"`
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
	Attachments  []AttachmentPayload       `json:"attachments"`
}

type ActionTaskRequest struct {
	Note        string                  `json:"note"`
	DueDate     *time.Time              `json:"due_date"`
	Reminders   []CreateReminderPayload `json:"reminders"`
	Attachments []AttachmentPayload     `json:"attachments"`
}
type AddCommentRequest struct { // <-- NEW
	Content          string   `json:"content" binding:"required"`
	MentionedUserIDs []string `json:"mentioned_user_ids"`
}

type TaskUpdateCommentResponse struct { // <-- NEW
	ID          string              `json:"id"`
	UserID      string              `json:"user_id"`
	FirstName   string              `json:"first_name"`
	LastName    string              `json:"last_name"`
	Content     string              `json:"content"`
	CreatedAt   string              `json:"created_at"`
	Attachments []AttachmentPayload `json:"attachments"`
}

type TranscriptionResponse struct {
	Status         string `json:"status"`
	TranscriptText string `json:"transcript_text,omitempty"`
	ErrorMessage   string `json:"error_message,omitempty"`
}

type AttachmentPayload struct {
	ID                    string `json:"id,omitempty"`
	FileName              string `json:"file_name"`
	FileURL               string `json:"file_url"`
	FileType              string `json:"file_type"`
	FileSize              int64  `json:"file_size"`
	TranscriptionStatus   string `json:"transcription_status,omitempty"`
	TranscriptionText     string `json:"transcription_text,omitempty"`
}
