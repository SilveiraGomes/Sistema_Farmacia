import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ConfirmationProvider from './components/ConfirmationProvider';
import './assets/output.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <ConfirmationProvider>
        <App />
      </ConfirmationProvider>
    </AuthProvider>
  </React.StrictMode>
);
