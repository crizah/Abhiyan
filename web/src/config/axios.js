import axios from 'axios';

let BACKEND_URL = 'http://localhost:8082/api/v1';
const envUrl = window.RUNTIME_CONFIG?.REACT_APP_BACKEND_URL;
if (envUrl && envUrl !== '${REACT_APP_BACKEND_URL}') {
     BACKEND_URL = envUrl;
}

const apiClient = axios.create({
    baseURL: BACKEND_URL,
    withCredentials: true, // <-- CRITICAL: This tells Axios to send/receive cookies
    headers: {
        'Content-Type': 'application/json',
    },
});

// Response Interceptor
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const originalRequest = error.config;
        
        // Ignore 401s from both /login AND /me
        const isAuthRoute = originalRequest.url.includes('login') || originalRequest.url.includes('me');
        
        if (error.response && error.response.status === 401 && !isAuthRoute) {
            window.location.href = '/login'; 
        }
        
        return Promise.reject(error);
    }
);

export default apiClient;