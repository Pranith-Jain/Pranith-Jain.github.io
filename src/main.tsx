import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

const tree = (
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Prerendered routes ship real HTML inside <div id="root">. Hydrate that
// markup so React adopts the existing DOM instead of replacing it. Empty
// SPA-shell routes (vite-built dist/index.html with no inner content)
// still go through createRoot.
//
// Detection: any prerendered output has at least one element child.
if (rootElement.firstElementChild) {
  ReactDOM.hydrateRoot(rootElement, tree);
} else {
  ReactDOM.createRoot(rootElement).render(tree);
}

// Register service worker for offline resilience and asset caching.
// Safe to call unconditionally — browsers ignore SW registration
// when the feature is unsupported or the page is served in a context
// that doesn't allow it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration can fail (private browsing, storage quota, etc).
      // The page still loads fine — SW is purely additive.
    });
  });
}
