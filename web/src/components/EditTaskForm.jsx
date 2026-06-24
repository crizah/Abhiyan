import React, { useState, useEffect } from 'react';
import { Form, Input, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/s3Uploader';
import apiClient from '../utils/apiClient';

export const EditTaskForm = ({ taskId, onTaskUpdated }) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch task on mount to populate existing files
  useEffect(() => {
    const fetchTaskDetails = async () => {
      try {
        const { data } = await apiClient.get(`/api/tasks/${taskId}`);
        form.setFieldsValue({
          title: data.title,
          description: data.description,
        });

        // Map existing DB entries into the AntD component representation
        if (data.attachments) {
          const preloadedFiles = data.attachments.map((att) => ({
            uid: att.id || att.file_url, // fallback
            name: att.file_name,
            status: 'done',
            url: att.file_url,
            s3Data: { // preserve metadata so it passes verification on update
              file_name: att.file_name,
              file_url: att.file_url,
              file_type: att.file_type,
              file_size: att.file_size
            }
          }));
          setFileList(preloadedFiles);
        }
      } catch (err) {
        message.error('Failed to load task details.');
      }
    };
    fetchTaskDetails();
  }, [taskId, form]);

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

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // Harvest both historical files and newly uploaded files
      const attachments = fileList
        .filter(file => file.status === 'done' && file.s3Data)
        .map(file => file.s3Data);

      const payload = {
        title: values.title,
        description: values.description,
        attachments: attachments // Go engine will scrub old links and swap with this exact set
      };

      await apiClient.put(`/api/tasks/${taskId}`, payload);
      message.success('Task details updated!');
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      message.error('Failed to update task.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item name="title" label="Task Title" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={4} />
      </Form.Item>

      <Form.Item label="Task Attachments (Add/Remove)">
        <Upload
          customRequest={handleCustomUpload}
          fileList={fileList}
          onChange={({ fileList: newFileList }) => setFileList(newFileList)}
          multiple
        >
          <Button icon={<UploadOutlined />}>Upload New File</Button>
        </Upload>
      </Form.Item>

      <Button type="primary" htmlType="submit" loading={loading}>
        Save Changes
      </Button>
    </Form>
  );
};