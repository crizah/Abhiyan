package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/gin-gonic/gin"
)

type TaskHandler struct {
	taskService *services.TaskService
}

func NewTaskHandler(taskService *services.TaskService) *TaskHandler {
	return &TaskHandler{taskService: taskService}
}

func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req schemas.CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adminID := c.MustGet("user_id").(string)

	task, err := h.taskService.CreateTask(c.Request.Context(), adminID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Task created successfully", "task": task})
}

func (h *TaskHandler) GetTeamTasks(c *gin.Context) {
	teamID := c.Param("team_id")

	tasks, err := h.taskService.GetTeamTasks(c.Request.Context(), teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tasks"})
		return
	}

	c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) UpdateTaskStatus(c *gin.Context) {
	taskID := c.Param("task_id")
	var req schemas.UpdateTaskStatusRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.taskService.UpdateTaskStatus(c.Request.Context(), taskID, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update task status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Task status updated"})
}

func (h *TaskHandler) GetTaskUpdates(c *gin.Context) {
	taskID := c.Param("task_id")

	updates, err := h.taskService.GetTaskUpdates(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch updates"})
		return
	}

	c.JSON(http.StatusOK, updates)
}

func (h *TaskHandler) PostTaskUpdate(c *gin.Context) {
	taskID := c.Param("task_id")
	userID := c.MustGet("user_id").(string)

	var req schemas.AddTaskUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.taskService.PostTaskUpdate(c.Request.Context(), taskID, userID, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to post update"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Update posted"})
}

func (h *TaskHandler) GetFullTaskDetails(c *gin.Context) {
	taskID := c.Param("task_id")
	details, err := h.taskService.GetFullTaskDetails(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch details"})
		return
	}
	c.JSON(http.StatusOK, details)
}

func (h *TaskHandler) UpdateTaskDetails(c *gin.Context) {
	taskID := c.Param("task_id")
	var req schemas.UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.taskService.UpdateTaskDetails(c.Request.Context(), taskID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update task"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Task updated"})
}

func (h *TaskHandler) GetAdminAllTasks(c *gin.Context) {
	userID := c.MustGet("user_id").(string)

	tasks, err := h.taskService.GetAdminAllTasks(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tasks"})
		return
	}

	c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) ReopenTask(c *gin.Context) {
	taskID := c.Param("task_id")
	userID := c.MustGet("user_id").(string)

	var req schemas.ReopenTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.taskService.ReopenTask(c.Request.Context(), taskID, userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reopen task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Task reopened successfully"})
}
