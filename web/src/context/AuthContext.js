import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../features/auth/api';
import { useRefetchOnResume, markFetched } from '../hooks/useRefetchOnResume';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Run once when the app loads
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Ask the backend to read the cookie and return our profile
        const userData = await authAPI.me();
        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        // If it fails (no cookie, expired cookie), we aren't logged in
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
        markFetched('me');
      }
    };

    checkAuth();
  }, []);

  const login = async () => {
    // Axios already stored the cookie automatically from the login response!
    // We just need to fetch our user profile now to update the UI.
    try {
        const userData = await authAPI.me();
        setUser(userData);
        setIsAuthenticated(true);
    } catch (error) {
        console.error("Failed to fetch user after login");
    } finally {
        markFetched('me');
    }
  };

  useRefetchOnResume('me', login, { minIntervalMs: 60000, enabled: isAuthenticated });

  const logout = async () => {
    try {
      await authAPI.logout(); // Tells Go to delete the cookie
    } catch (error) {
      console.error("Backend logout failed");
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, isLoading }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);