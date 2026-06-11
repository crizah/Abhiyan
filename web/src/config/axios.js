// src/config/axios.js
import axios from 'axios';

// Safely grab the backend URL from your injected runtime config
// Fallback to localhost for local development if the config isn't loaded
const BACKEND_URL = window.RUNTIME_CONFIG?.REACT_APP_BACKEND_URL || 'http://localhost:8080/api/v1';

const apiClient = axios.create({
    baseURL: BACKEND_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor: Automatically attach the JWT to every request
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Handle global 401 Unauthorized errors
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // If the token expires, clear it and force a login
            localStorage.removeItem('access_token');
            window.location.href = '/login'; 
        }
        return Promise.reject(error);
    }
);

export default apiClient;