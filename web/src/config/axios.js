// src/config/axios.js
import axios from 'axios';

// 1. Set the default local development URL
let BACKEND_URL = 'http://localhost:8082/api/v1';

// 2. Override ONLY if the runtime config exists AND has actually been replaced by entrypoint.sh
const envUrl = window.RUNTIME_CONFIG?.REACT_APP_BACKEND_URL;
if (envUrl && envUrl !== '${REACT_APP_BACKEND_URL}') {
    BACKEND_URL = envUrl;
}

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