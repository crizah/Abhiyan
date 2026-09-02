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

    googleLogin: async (credential) => {
        const response = await apiClient.post('/auth/google-login', { credential });
        return response.data;
    },

    // Completes a login that came back with requires_org_selection (2+ org memberships).
    selectOrg: async (pendingToken, orgId) => {
        const response = await apiClient.post('/auth/select-org', { pending_token: pendingToken, org_id: orgId });
        return response.data;
    },

    invitePreview: async (token) => {
        const response = await apiClient.get('/auth/invite-preview', { params: { token } });
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
    },

    forgotPassword: async (email) => {
        const response = await apiClient.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (token, newPassword) => {
        const response = await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
        return response.data;
    },
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

    markAttendance: async (targetObjectKey) => {
        const response = await apiClient.post('/attendance/mark', { target_object_key: targetObjectKey });
        return response.data; // { id }
    },

    getToday: async () => {
        const response = await apiClient.get('/attendance/today');
        return response.data; // { status: 'none' | 'pending' | 'matched' | 'unmatched' }
    },
};

export const orgAPI = {
    deleteOrganization: async () => {
        const response = await apiClient.delete('/admin/organization');
        return response.data;
    },

    getFaceRegistrationStatus: async () => {
        const response = await apiClient.get('/admin/face-registration-status');
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
