package schemas

import "time"

type CreateReminderRequest struct {
	TaskID      string    `json:"task_id" binding:"required,uuid"`
	ScheduledAt time.Time `json:"scheduled_at" binding:"required"`
	Channel     string    `json:"channel" binding:"required,oneof=WHATSAPP EMAIL"`

	// Custom Recurrence Guards:
	// omitempty: Optional field
	// min=1,max=365: Prevents insane recurrences (e.g., every 10,000 days)
	RecurrenceValue *int `json:"recurrence_value" binding:"omitempty,min=1,max=365"`

	// required_with: If they send a Value, they MUST send a Unit
	// oneof: Only allows your specific ENUM values
	RecurrenceUnit *string `json:"recurrence_unit" binding:"omitempty,required_with=RecurrenceValue,oneof=MINUTES HOURS DAYS WEEKS MONTHS"`
}

type CreateTaskRequest struct {
	TeamID      string     `json:"team_id" binding:"required,uuid"`
	Title       string     `json:"title" binding:"required,max=255"`
	Description string     `json:"description"`
	DueDate     *time.Time `json:"due_date"`

	// Arrays of UUIDs sent from the frontend multi-select dropdowns
	AssigneeIDs   []string `json:"assignee_ids" binding:"required,min=1"`
	SubscriberIDs []string `json:"subscriber_ids"`

	// Optional Reminder Configuration
	Reminders []CreateReminderPayload `json:"reminders"`
}

type CreateReminderPayload struct {
	ScheduledAt time.Time `json:"scheduled_at" binding:"required"`
	Channel     string    `json:"channel" binding:"required,oneof=WHATSAPP EMAIL"`

	// Custom Recurrence Guards
	RecurrenceValue *int    `json:"recurrence_value" binding:"omitempty,min=1,max=365"`
	RecurrenceUnit  *string `json:"recurrence_unit" binding:"omitempty,required_with=RecurrenceValue,oneof=MINUTES HOURS DAYS WEEKS MONTHS"`
}

type AddTaskUpdateRequest struct {
	Content string `json:"content" binding:"required"`
}

type UpdateTaskStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=OPEN CLOSED"`
}

type UpdateFulfillmentRequest struct {
	FulfillmentStatus string `json:"fulfillment_status" binding:"required,oneof=PENDING COMPLETED"`
}
