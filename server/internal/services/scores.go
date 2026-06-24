package services

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/google/uuid"
)

type ScoreService struct {
	db      *sql.DB
	queries *db.Queries
}

func NewScoreService(dbConn *sql.DB) *ScoreService {
	return &ScoreService{
		db:      dbConn,
		queries: db.New(dbConn),
	}
}

func calculatePoints(approvedAt, dueDate, taskCreatedAt time.Time) (db.ScoreEventType, int32) {
	if approvedAt.After(dueDate) {
		return db.ScoreEventTypeLATECOMPLETION, 3
	}

	base := 10

	totalDuration := dueDate.Sub(taskCreatedAt).Hours() / 24
	if totalDuration < 1 {
		totalDuration = 1
	}

	remaining := dueDate.Sub(approvedAt).Hours() / 24
	if remaining < 0 {
		remaining = 0
	}

	bonusRatio := remaining / totalDuration
	bonus := int(math.Min(5, math.Floor(bonusRatio*5)))

	return db.ScoreEventTypeONTIMECOMPLETION, int32(base + bonus)
}

func (s *ScoreService) RecordApprovalTx(ctx context.Context, qtx *db.Queries, taskID uuid.UUID, approvedAt time.Time) error {
	task, err := qtx.GetTaskByID(ctx, taskID)
	if err != nil {
		return err
	}

	if !task.DueDate.Valid {
		return nil
	}

	assignees, err := qtx.GetTaskAssigneesWithContext(ctx, taskID)
	if err != nil {
		return err
	}

	for _, a := range assignees {
		_ = qtx.SupersedeScoreEvents(ctx, db.SupersedeScoreEventsParams{
			TaskID: taskID,
			UserID: a.UserID,
		})

		eventType, points := calculatePoints(approvedAt, task.DueDate.Time, task.CreatedAt.Time)

		_, err := qtx.InsertScoreEvent(ctx, db.InsertScoreEventParams{
			TaskID:          taskID,
			UserID:          a.UserID,
			TeamID:          a.TeamID,
			OrgID:           a.OrgID,
			EventType:       eventType,
			PointsAwarded:   points,
			DueDateSnapshot: task.DueDate,
			EventAt:         approvedAt,
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *ScoreService) RecordRejectionTx(ctx context.Context, qtx *db.Queries, taskID uuid.UUID) error {
	task, err := qtx.GetTaskByID(ctx, taskID)
	if err != nil {
		return err
	}

	if !task.DueDate.Valid {
		return nil
	}

	assignees, err := qtx.GetTaskAssigneesWithContext(ctx, taskID)
	if err != nil {
		return err
	}

	for _, a := range assignees {
		_ = qtx.SupersedeScoreEvents(ctx, db.SupersedeScoreEventsParams{
			TaskID: taskID,
			UserID: a.UserID,
		})

		_, err := qtx.InsertScoreEvent(ctx, db.InsertScoreEventParams{
			TaskID:          taskID,
			UserID:          a.UserID,
			TeamID:          a.TeamID,
			OrgID:           a.OrgID,
			EventType:       db.ScoreEventTypeREJECTION,
			PointsAwarded:   0,
			DueDateSnapshot: task.DueDate,
			EventAt:         time.Now(),
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *ScoreService) RecordReopenTx(ctx context.Context, qtx *db.Queries, taskID uuid.UUID) error {
	assignees, err := qtx.GetTaskAssigneesWithContext(ctx, taskID)
	if err != nil {
		return err
	}

	for _, a := range assignees {
		_ = qtx.SupersedeScoreEvents(ctx, db.SupersedeScoreEventsParams{
			TaskID: taskID,
			UserID: a.UserID,
		})
	}

	return nil
}

func (s *ScoreService) GetUserBreakdown(ctx context.Context, userID string, teamFilter string, limit, offset int32) (*schemas.ScoreBreakdownResponse, error) {
	uID := util.ParseUUID(userID)

	breakdown, err := s.queries.GetUserScoreBreakdown(ctx, db.GetUserScoreBreakdownParams{
		UserID:     uID,
		TeamFilter: teamFilter,
	})
	if err != nil {
		return nil, err
	}

	events, err := s.queries.GetUserScoreEvents(ctx, db.GetUserScoreEventsParams{
		UserID:     uID,
		Limit:      limit,
		Offset:     offset,
		TeamFilter: teamFilter,
	})
	if err != nil {
		return nil, err
	}

	var mapped []schemas.ScoreEventResponse
	for _, e := range events {
		var dueDate *time.Time
		if e.DueDateSnapshot.Valid {
			dueDate = &e.DueDateSnapshot.Time
		}
		mapped = append(mapped, schemas.ScoreEventResponse{
			ID:              e.ID.String(),
			TaskID:          e.TaskID.String(),
			TaskTitle:       e.TaskTitle,
			TeamID:          e.TeamID.String(),
			TeamName:        e.TeamName,
			EventType:       e.EsEventType,
			PointsAwarded:   int(e.PointsAwarded),
			DueDateSnapshot: dueDate,
			EventAt:         e.EventAt,
		})
	}

	if mapped == nil {
		mapped = []schemas.ScoreEventResponse{}
	}

	return &schemas.ScoreBreakdownResponse{
		TotalPoints:    breakdown.TotalPoints,
		OnTimeCount:    breakdown.OnTimeCount,
		LateCount:      breakdown.LateCount,
		MissedCount:    breakdown.MissedCount,
		RejectionCount: breakdown.RejectionCount,
		Events:         mapped,
	}, nil
}

func assignRanks(entries []schemas.LeaderboardEntry) {
	rank := 1
	for i := range entries {
		if i > 0 && entries[i].TotalPoints < entries[i-1].TotalPoints {
			rank = i + 1
		}
		entries[i].Rank = rank
	}
}

func (s *ScoreService) GetLeaderboard(ctx context.Context, teamIDs []uuid.UUID, currentUserID string) (*schemas.LeaderboardResponse, error) {
	var entries []schemas.LeaderboardEntry

	if len(teamIDs) == 1 {
		rows, err := s.queries.GetTeamLeaderboard(ctx, teamIDs[0])
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			entries = append(entries, schemas.LeaderboardEntry{
				UserID:         r.UserID.String(),
				FullName:       strings.TrimSpace(r.FirstName.String + " " + r.LastName.String),
				Email:          r.EmailID,
				TotalPoints:    r.TotalPoints,
				OnTimeCount:    r.OnTimeCount,
				CompletedCount: r.CompletedCount,
				IsCurrentUser:  r.UserID.String() == currentUserID,
			})
		}
	} else {
		rows, err := s.queries.GetAggregatedLeaderboard(ctx, teamIDs)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			entries = append(entries, schemas.LeaderboardEntry{
				UserID:         r.UserID.String(),
				FullName:       strings.TrimSpace(r.FirstName.String + " " + r.LastName.String),
				Email:          r.EmailID,
				TotalPoints:    r.TotalPoints,
				OnTimeCount:    r.OnTimeCount,
				CompletedCount: r.CompletedCount,
				IsCurrentUser:  r.UserID.String() == currentUserID,
			})
		}
	}

	if entries == nil {
		entries = []schemas.LeaderboardEntry{}
	}
	assignRanks(entries)

	visSettings, _ := s.queries.GetLeaderboardVisibilityBulk(ctx, teamIDs)
	visMap := make(map[string]bool)
	for _, v := range visSettings {
		visMap[v.TeamID.String()] = v.LeaderboardVisible
	}

	return &schemas.LeaderboardResponse{
		Entries: entries,
	}, nil
}

func (s *ScoreService) GetAdminLeaderboard(ctx context.Context, teamIDs []uuid.UUID, currentUserID string) (*schemas.LeaderboardResponse, error) {
	resp, err := s.GetLeaderboard(ctx, teamIDs, currentUserID)
	if err != nil {
		return nil, err
	}

	visSettings, _ := s.queries.GetLeaderboardVisibilityBulk(ctx, teamIDs)
	visMap := make(map[string]bool)
	for _, v := range visSettings {
		visMap[v.TeamID.String()] = v.LeaderboardVisible
	}

	return resp, nil
}

func (s *ScoreService) ToggleLeaderboardVisibility(ctx context.Context, teamID string, visible bool, adminID string) error {
	return s.queries.UpsertLeaderboardVisibility(ctx, db.UpsertLeaderboardVisibilityParams{
		TeamID:             util.ParseUUID(teamID),
		LeaderboardVisible: visible,
		UpdatedBy:          uuid.NullUUID{UUID: util.ParseUUID(adminID), Valid: true},
	})
}

func (s *ScoreService) GetEmployeeLeaderboard(ctx context.Context, userID string, teamFilter string) (*schemas.LeaderboardResponse, error) {
	uID := util.ParseUUID(userID)

	userTeams, err := s.queries.GetEmployeeTeams(ctx, uID)
	if err != nil {
		return nil, err
	}

	var teamIDs []uuid.UUID
	for _, t := range userTeams {
		if string(t.TeamRole) == "TEAM_ADMIN" {
			continue
		}
		teamIDs = append(teamIDs, t.ID)
	}

	if teamFilter != "" && teamFilter != "ALL" {
		filterID := util.ParseUUID(teamFilter)
		found := false
		for _, id := range teamIDs {
			if id == filterID {
				found = true
				break
			}
		}
		if !found {
			return &schemas.LeaderboardResponse{Entries: []schemas.LeaderboardEntry{}}, nil
		}
		teamIDs = []uuid.UUID{filterID}
	}

	if len(teamIDs) == 0 {
		return &schemas.LeaderboardResponse{Entries: []schemas.LeaderboardEntry{}}, nil
	}

	visSettings, _ := s.queries.GetLeaderboardVisibilityBulk(ctx, teamIDs)
	visMap := make(map[string]bool)
	for _, v := range visSettings {
		visMap[v.TeamID.String()] = v.LeaderboardVisible
	}

	var visibleTeamIDs []uuid.UUID
	for _, id := range teamIDs {
		if visMap[id.String()] {
			visibleTeamIDs = append(visibleTeamIDs, id)
		}
	}

	if len(visibleTeamIDs) == 0 {
		return &schemas.LeaderboardResponse{Entries: []schemas.LeaderboardEntry{}}, nil
	}

	return s.GetLeaderboard(ctx, visibleTeamIDs, userID)
}

func (s *ScoreService) GetLeaderboardVisibilityBulk(ctx context.Context, teamIDs []uuid.UUID) ([]schemas.TeamVisibility, error) {
	settings, err := s.queries.GetLeaderboardVisibilityBulk(ctx, teamIDs)
	if err != nil {
		return nil, err
	}

	teamNames := make(map[string]string)
	for _, id := range teamIDs {
		teamNames[id.String()] = id.String()
	}

	visMap := make(map[string]bool)
	for _, v := range settings {
		visMap[v.TeamID.String()] = v.LeaderboardVisible
	}

	var result []schemas.TeamVisibility
	for _, id := range teamIDs {
		result = append(result, schemas.TeamVisibility{
			TeamID:             id.String(),
			LeaderboardVisible: visMap[id.String()],
		})
	}

	if result == nil {
		result = []schemas.TeamVisibility{}
	}
	return result, nil
}

type UserNameResult struct {
	FullName string
	Email    string
}

func (s *ScoreService) GetUserName(ctx context.Context, userID string) (*UserNameResult, error) {
	uID := util.ParseUUID(userID)
	user, err := s.queries.GetUserNameByID(ctx, uID)
	if err != nil {
		return nil, err
	}
	email, _ := s.queries.GetEmailByUser(ctx, uID)
	fullName := strings.TrimSpace(user.FirstName.String + " " + user.LastName.String)
	if fullName == "" {
		fullName = "Unknown User"
	}
	return &UserNameResult{FullName: fullName, Email: email}, nil
}

func (s *ScoreService) WriteUserScoreReport(ctx context.Context, userID string, userName string, email string, w io.Writer) error {
	uID := util.ParseUUID(userID)

	breakdown, err := s.queries.GetUserScoreBreakdown(ctx, db.GetUserScoreBreakdownParams{
		UserID:     uID,
		TeamFilter: "",
	})
	if err != nil {
		return err
	}

	events, err := s.queries.GetUserScoreReportData(ctx, uID)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("Employee Report: %s (%s)", userName, email)})
	cw.Write([]string{fmt.Sprintf("Generated: %s", time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	cw.Write([]string{"Summary"})
	cw.Write([]string{"Total Points", "On-Time", "Late", "Missed", "Rejections"})
	cw.Write([]string{
		fmt.Sprintf("%d", breakdown.TotalPoints),
		fmt.Sprintf("%d", breakdown.OnTimeCount),
		fmt.Sprintf("%d", breakdown.LateCount),
		fmt.Sprintf("%d", breakdown.MissedCount),
		fmt.Sprintf("%d", breakdown.RejectionCount),
	})
	cw.Write([]string{})
	cw.Write([]string{"Task Details"})
	cw.Write([]string{"Task", "Team", "Event", "Points", "Due Date", "Event Date"})

	for _, e := range events {
		dueDate := "N/A"
		if e.DueDateSnapshot.Valid {
			dueDate = e.DueDateSnapshot.Time.Format("2006-01-02")
		}
		cw.Write([]string{
			e.TaskTitle,
			e.TeamName,
			e.EsEventType,
			fmt.Sprintf("%d", e.PointsAwarded),
			dueDate,
			e.EventAt.Format("2006-01-02"),
		})
	}

	return nil
}

func (s *ScoreService) WriteBulkScoreReport(ctx context.Context, teamIDs []uuid.UUID, w io.Writer) error {
	rows, err := s.queries.GetBulkUserScoreBreakdowns(ctx, teamIDs)
	if err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	defer cw.Flush()

	cw.Write([]string{fmt.Sprintf("Performance Report - Generated: %s", time.Now().Format(time.RFC3339))})
	cw.Write([]string{})
	cw.Write([]string{"Employee", "Email", "Total Points", "On-Time", "Late", "Missed", "Rejections"})

	for _, r := range rows {
		fullName := strings.TrimSpace(r.FirstName.String + " " + r.LastName.String)
		cw.Write([]string{
			fullName,
			r.EmailID,
			fmt.Sprintf("%d", r.TotalPoints),
			fmt.Sprintf("%d", r.OnTimeCount),
			fmt.Sprintf("%d", r.LateCount),
			fmt.Sprintf("%d", r.MissedCount),
			fmt.Sprintf("%d", r.RejectionCount),
		})
	}

	return nil
}
