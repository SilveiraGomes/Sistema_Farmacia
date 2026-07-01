import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ConfirmationProvider from './components/ConfirmationProvider';
import { LicenseProvider } from './licensing/LicenseContext';
import './assets/output.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LicenseProvider>
      <AuthProvider>
        <ConfirmationProvider>
          <App />
        </ConfirmationProvider>
      </AuthProvider>
    </LicenseProvider>
  </React.StrictMode>
);
