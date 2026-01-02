import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.error("Root element not found. Application cannot mount.");
}
