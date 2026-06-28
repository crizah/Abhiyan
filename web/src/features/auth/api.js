import apiClient from '../../config/axios';

export const authAPI = {
    registerOrg: async (data) => {
        const response = await apiClient.post('/auth/register-org', data);
        return response.data;
    },
    
    login: async (credentials) => {
        const response = await apiClient.post('/auth/login', credentials);
        
        return response.data;
    },

    logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
    },

    me: async () => {
        const response = await apiClient.get('/auth/me');
        return response.data;
    },

    acceptInvite: async (data) => {
        const response = await apiClient.post('/auth/accept-invite', data);
        return response.data;
    }
};

export const attendanceAPI = {
    toggleAttendance: async (enabled) => {
        const response = await apiClient.put('/admin/attendance', { enabled });
        return response.data;
    },

    registerFace: async (facePayload) => {
        const response = await apiClient.put('/users/me/face', { source_face: facePayload });
        return response.data;
    },
};

export const uploadAPI = {
    validateFace: async (objectKey) => {
        const response = await apiClient.post('/upload/validate-face', { object_key: objectKey });
        return response.data; // { job_id }
    },

    getValidationStatus: async (jobId) => {
        const response = await apiClient.get(`/upload/validate-face/${jobId}`);
        return response.data; // { status, reason }
    },

    deleteS3Object: async (fileUrl) => {
        const response = await apiClient.delete('/upload/s3-object', { data: { file_url: fileUrl } });
        return response.data;
    },
};
