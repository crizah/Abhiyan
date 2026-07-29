package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Onion/app"
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	s3Service      *services.S3Service
	faceValidation *services.FaceValidationService
	onionApp       *app.App
}

func NewUploadHandler(s3Service *services.S3Service, faceValidation *services.FaceValidationService, onionApp *app.App) *UploadHandler {
	return &UploadHandler{
		s3Service:      s3Service,
		faceValidation: faceValidation,
		onionApp:       onionApp,
	}
}

func (h *UploadHandler) GetPresignedUploadsURL(c *gin.Context) {
	fileName := c.Query("file_name")
	folderType := c.Query("type")
	orgID := c.MustGet("org_id").(string)

	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}

	uploadURL, finalURL, objectKey, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), fileName, folderType, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate upload URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_url": uploadURL,
		"file_url":   finalURL,
		"object_key": objectKey,
	})
}

func (h *UploadHandler) DeleteS3Object(c *gin.Context) {
	var req struct {
		FileURL string `json:"file_url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_url is required"})
		return
	}

	orgID := c.MustGet("org_id").(string)
	if !h.s3Service.KeyBelongsToOrg(req.FileURL, orgID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "unauthorized: file does not belong to your organization"})
		return
	}

	h.s3Service.DeleteObjects(c.Request.Context(), []string{req.FileURL})
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *UploadHandler) ValidateFace(c *gin.Context) {
	var req struct {
		ObjectKey string `json:"object_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "object_key is required"})
		return
	}

	userID := c.MustGet("user_id").(string)

	jobID, err := h.faceValidation.InsertJob(c.Request.Context(), userID, req.ObjectKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create validation job"})
		return
	}

	_ = h.onionApp.Enqueue(c.Request.Context(), "validate_face", map[string]any{
		"job_id":     jobID,
		"object_key": req.ObjectKey,
	})

	c.JSON(http.StatusAccepted, gin.H{"job_id": jobID})
}

func (h *UploadHandler) GetValidationStatus(c *gin.Context) {
	jobID := c.Param("job_id")
	userID := c.MustGet("user_id").(string)

	status, reason, err := h.faceValidation.GetJob(c.Request.Context(), jobID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": status, "reason": reason})
}
