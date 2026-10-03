import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import './index.css';

if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
