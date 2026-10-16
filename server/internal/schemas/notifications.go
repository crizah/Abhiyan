package schemas

type NotificationResponse struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	IsRead    bool   `json:"is_read"`
	IsSystem  bool   `json:"is_system"` // Identifies our dynamic queue alert
	Type      string `json:"type"`      // e.g., "INFO", "SUCCESS", "WARNING"
	CreatedAt string `json:"created_at"`
}

type TaskCardResponse struct {
	ID         string  `json:"id"`
	TaskID     string  `json:"task_id"`
	Kind       string  `json:"kind"` // "ASSIGNED" or "REVIEW"
	Message    string  `json:"message"`
	TaskTitle  string  `json:"task_title"`
	TeamName   string  `json:"team_name"`
	AssignedBy string  `json:"assigned_by"`
	DueDate    *string `json:"due_date"`
	CreatedAt  string  `json:"created_at"`
}
