import axios from 'axios';

// Build-time (Vercel): REACT_APP_BACKEND_URL is baked in by the build process
// Runtime (Docker/nginx): window.RUNTIME_CONFIG is injected by entrypoint.sh
// Local dev: falls back to localhost
let BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  window.RUNTIME_CONFIG?.REACT_APP_BACKEND_URL ||
  'http://localhost:8082/api/v1';

const runtimeUrl = window.RUNTIME_CONFIG?.REACT_APP_BACKEND_URL;
if (runtimeUrl && runtimeUrl !== '${REACT_APP_BACKEND_URL}') {
  BACKEND_URL = runtimeUrl;
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