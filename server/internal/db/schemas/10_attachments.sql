CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Can belong to a base task OR a timeline update
    -- can also belong to comments, but thats for later 
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE, 
    task_update_id UUID REFERENCES task_updates(id) ON DELETE CASCADE, 
    task_comment_id UUID REFERENCES task_update_comments(id) ON DELETE CASCADE,
    
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL, -- The S3 URI
    file_type TEXT NOT NULL, -- e.g., 'audio/webm', 'application/pdf', 'image/png'
    file_size_bytes BIGINT,
    
    
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure it belongs to at least one of them
    CONSTRAINT chk_attachment_link CHECK (task_id IS NOT NULL OR task_update_id IS NOT NULL OR task_comment_id IS NOT NULL)
);

CREATE INDEX idx_attachments_task_id ON attachments(task_id);
CREATE INDEX idx_attachments_update_id ON attachments(task_update_id);
CREATE INDEX idx_attachments_comment_id ON attachments(task_comment_id)