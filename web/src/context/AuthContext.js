import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Now we store the actual user data!
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decodedToken = jwtDecode(token);
        setUser(decodedToken);
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Invalid token");
        localStorage.removeItem('access_token');
      }
    }
    setIsLoading(false);
  }, []);

 const login = (token) => {
    console.log("1. Raw token received:", token);
    
    if (!token) {
      console.error("Token is missing! Axios didn't pass it correctly.");
      return; 
    }

    try {
      const decodedToken = jwtDecode(token);
      console.log("2. Decoded Payload:", decodedToken);
      
      localStorage.setItem('access_token', token);
      setUser(decodedToken);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("3. CRASH! Failed to decode token. Is this a real JWT? Error:", error);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, isLoading }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);