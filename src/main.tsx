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

// The SSR (React) and client (Preact) use different rendering engines,
// so hydrateRoot frequently fails — Preact's hydration doesn't recognise
// React's Suspense comment-marker output, causing the prerendered DOM
// to be preserved alongside a fresh client-rendered copy ("double page").
//
// Fix: always use createRoot. Prerendered HTML still serves bots and
// first paint; createRoot replaces it on client hydration, eliminating
// the duplicate content.
ReactDOM.createRoot(rootElement).render(tree);

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
