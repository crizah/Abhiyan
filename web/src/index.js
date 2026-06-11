// src/index.js
import React from 'react';
import ReactDOM from 'react-ui/client';
import App from './App';
import './assets/global.css'; // Optional: for basic resets (margin: 0, padding: 0)

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);