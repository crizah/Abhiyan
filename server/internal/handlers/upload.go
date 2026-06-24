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

func (h *UploadHandler) GetPresignedURL(c *gin.Context) {
	fileName := c.Query("file_name")

	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}

	uploadURL, finalURL, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), fileName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate upload URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_url": uploadURL,
		"file_url":   finalURL,
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
