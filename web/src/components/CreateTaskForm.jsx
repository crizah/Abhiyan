import React, { useState } from 'react';
import { Form, Input, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { uploadFileToS3 } from '../utils/s3Uploader';
import apiClient from '../utils/apiClient';

export const CreateTaskForm = ({ onTaskCreated }) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Custom S3 handler intercepting normal AntD action
  const handleCustomUpload = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    try {
      const s3Metadata = await uploadFileToS3(file, 'uploads', onProgress);
      
      // Merge successfully uploaded S3 data into the state representation
      file.s3Data = s3Metadata; 
      onSuccess("OK");
    } catch (err) {
      onError(err);
    }
  };

  const onFileChange = ({ fileList: newFileList }) => {
    setFileList(newFileList);
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      // Extract the uploaded URLs from successfully completed uploads
      const attachments = fileList
        .filter(file => file.status === 'done' && file.s3Data)
        .map(file => file.s3Data);

      const payload = {
        title: values.title,
        description: values.description,
        attachments: attachments // Sent directly to CreateTask Go controller
      };

      await apiClient.post('/api/tasks', payload);
      message.success('Task created successfully!');
      form.resetFields();
      setFileList([]);
      if (onTaskCreated) onTaskCreated();
    } catch (err) {
      message.error('Failed to save task.');
    } finally {
      setSubmitting(false);
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

      <Form.Item label="Upload Attachments">
        <Upload
          customRequest={handleCustomUpload}
          fileList={fileList}
          onChange={onFileChange}
          multiple
        >
          <Button icon={<UploadOutlined />}>Select Files</Button>
        </Upload>
      </Form.Item>

      <Button type="primary" htmlType="submit" loading={submitting}>
        Create Task
      </Button>
    </Form>
  );
};