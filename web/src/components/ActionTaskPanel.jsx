import React, { useState } from 'react';
import { Input, Upload, Button, message } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/s3Uploader';
import apiClient from '../utils/apiClient';

export const ActionTaskPanel = ({ taskId, currentStatus, onActionComplete }) => {
  const [comment, setComment] = useState('');
  const [fileList, setFileList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleCustomUpload = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    try {
      const s3Metadata = await uploadFileToS3(file, onProgress);
      file.s3Data = s3Metadata;
      onSuccess("OK");
    } catch (err) {
      onError(err);
    }
  };

  const handleActionSubmit = async () => {
    if (!comment.trim() && fileList.length === 0) {
      message.warning("Cannot post an empty update!");
      return;
    }

    setSubmitting(true);
    try {
      const attachments = fileList
        .filter(file => file.status === 'done' && file.s3Data)
        .map(file => file.s3Data);

      const payload = {
        status: currentStatus, 
        comment: comment,
        attachments: attachments // Handled via qtx.DeleteTaskAttachments & loops inside Go action router
      };

      await apiClient.post(`/api/tasks/${taskId}/action`, payload);
      message.success('Update recorded successfully.');
      
      // Wipe the entry fields upon confirmation
      setComment('');
      setFileList([]);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      message.error('Failed to post status action update.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '16px', background: '#f9f9f9', borderRadius: '8px' }}>
      <h4>Post Update / Add Voice Note</h4>
      <Input.TextArea 
        rows={3} 
        value={comment} 
        onChange={(e) => setComment(e.target.value)} 
        placeholder="Type updates or description notes..." 
        style={{ marginBottom: '12px' }}
      />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Upload
          customRequest={handleCustomUpload}
          fileList={fileList}
          onChange={({ fileList: newFileList }) => setFileList(newFileList)}
          showUploadList={{ showRemoveIcon: true }}
        >
          <Button icon={<PaperClipOutlined />}>Attach Files/Audio</Button>
        </Upload>

        <Button 
          type="primary" 
          onClick={handleActionSubmit} 
          loading={submitting}
        >
          Submit Update
        </Button>
      </div>
    </div>
  );
};