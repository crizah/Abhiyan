import axios from 'axios';
import { message } from 'antd';
import apiClient from '../config/axios';

/**
 * Uploads a file directly to S3 without sending signature-breaking content-type headers.
 */
export const uploadFileToS3 = async (file, onProgress = () => {}) => {
  try {
    const { data } = await apiClient.get('/upload/presigned-url', {
      params: { file_name: file.name }
    });

    // Sent as plain binary stream to bypass AWS 403 Signature Mismatch
    await axios.put(data.upload_url, file, {
      headers: { 'Content-Type': '' }, 
      onUploadProgress: (e) => onProgress({ percent: (e.loaded / e.total) * 100 })
    });

    return {
      file_name: file.name,
      file_url: data.file_url,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size
    };
  } catch (error) {
    message.error(`Upload failed for ${file.name}`);
    throw error;
  }
};