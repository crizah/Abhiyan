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
