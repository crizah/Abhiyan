package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/services" // update import
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	s3Service *services.S3Service
}

func NewUploadHandler(s3Service *services.S3Service) *UploadHandler {
	return &UploadHandler{s3Service: s3Service}
}

func (h *UploadHandler) GetPresignedUploadsURL(c *gin.Context) {
	// for attachments
	fileName := c.Query("file_name")
	folderType := c.Query("type")

	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}

	uploadURL, finalURL, objectKey, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), fileName, folderType)
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

	h.s3Service.DeleteObjects(c.Request.Context(), []string{req.FileURL})
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
