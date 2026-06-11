import apiClient from '../../config/axios';

export const authAPI = {
    registerOrg: async (data) => {
        const response = await apiClient.post('/auth/register-org', data);
        return response.data;
    },
    
    login: async (credentials) => {
        const response = await apiClient.post('/auth/login', credentials);
        // Save the token on successful login
        if (response.data.access_token) {
            localStorage.setItem('access_token', response.data.access_token);
        }
        return response.data;
    },

    acceptInvite: async (data) => {
        const response = await apiClient.post('/auth/accept-invite', data);
        return response.data;
    }
};