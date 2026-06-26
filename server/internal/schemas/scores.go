package schemas

import "time"

type ToggleLeaderboardRequest struct {
	Visible bool `json:"visible"`
}

type ScoreBreakdownResponse struct {
	TotalPoints    int64                `json:"total_points"`
	OnTimeCount    int64                `json:"on_time_count"`
	LateCount      int64                `json:"late_count"`
	MissedCount    int64                `json:"missed_count"`
	RejectionCount int64                `json:"rejection_count"`
	Events         []ScoreEventResponse `json:"events"`
}

type ScoreEventResponse struct {
	ID              string     `json:"id"`
	TaskID          string     `json:"task_id"`
	TaskTitle       string     `json:"task_title"`
	TeamID          string     `json:"team_id"`
	TeamName        string     `json:"team_name"`
	EventType       string     `json:"event_type"`
	PointsAwarded   int        `json:"points_awarded"`
	DueDateSnapshot *time.Time `json:"due_date_snapshot"`
	EventAt         time.Time  `json:"event_at"`
}

type LeaderboardEntry struct {
	Rank           int    `json:"rank"`
	UserID         string `json:"user_id"`
	FullName       string `json:"full_name"`
	Email          string `json:"email"`
	TotalPoints    int64  `json:"total_points"`
	OnTimeCount    int64  `json:"on_time_count"`
	CompletedCount int64  `json:"completed_count"`
	IsCurrentUser  bool   `json:"is_current_user,omitempty"`
}

type LeaderboardResponse struct {
	Entries []LeaderboardEntry `json:"entries"`
	Teams   []TeamVisibility   `json:"teams,omitempty"`
}

type TeamVisibility struct {
	TeamID             string `json:"team_id"`
	TeamName           string `json:"team_name"`
	LeaderboardVisible bool   `json:"leaderboard_visible"`
}

type ScoreReportRow struct {
	UserID         string `json:"user_id"`
	FullName       string `json:"full_name"`
	Email          string `json:"email"`
	TotalPoints    int64  `json:"total_points"`
	OnTimeCount    int64  `json:"on_time_count"`
	LateCount      int64  `json:"late_count"`
	MissedCount    int64  `json:"missed_count"`
	RejectionCount int64  `json:"rejection_count"`
}
