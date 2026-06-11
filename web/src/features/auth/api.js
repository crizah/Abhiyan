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
