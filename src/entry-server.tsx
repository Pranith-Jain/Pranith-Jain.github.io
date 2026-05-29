import { StrictMode } from 'react';
// react-dom/server (Node CJS) only exports renderToString / renderToPipeableStream.
// renderToReadableStream lives in react-dom/server.browser (Web Streams API)
// which works in Node 18+ via the global Response/ReadableStream.
// @types/react-dom 18.3 doesn't declare the server.browser subpath, so we
// suppress the TS error explicitly. The runtime export exists in
// react-dom 18.3.1's package.json (verified via Object.keys at npm install).
// @ts-expect-error -- subpath exists at runtime, missing from types
import { renderToReadableStream } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom/server';
import { AppContent } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

/**
 * SSR entry point — Phase 3 streaming refactor (2026-05-12).
 *
 * Phase 1/2 used `renderToString` which doesn't await Suspense boundaries.
 * Every route under <Suspense fallback={...}><LazyRoute /></Suspense> in
 * App.tsx came out as the loading spinner (in LazyRoute.tsx) instead of real content.
 * Only the Home route worked, because Home itself is eagerly imported.
 *
 * Switching to `renderToReadableStream` + `stream.allReady` makes React
 * actually walk through every Suspense boundary, await every lazy
 * import(), and emit the resolved content. The stream is then collected
 * into a string via Response(stream).text().
 *
 * Cost: render() is now async. The prerender script awaits each route.
 * The dynamic imports each lazy() makes also fire during Node SSR — Vite
 * emits each as a separate chunk in .ssr-build/assets/ and Node loads
 * them on demand. Total prerender time scales with route count.
 */

export interface RenderResult {
  /** Server-rendered HTML for the page body (injected into index.html). */
  html: string;
}

export async function render(url: string): Promise<RenderResult> {
  const stream = await renderToReadableStream(
    <StrictMode>
      <ErrorBoundary>
        <StaticRouter location={url}>
          <AppContent />
        </StaticRouter>
      </ErrorBoundary>
    </StrictMode>
  );
  // Wait for every Suspense boundary in the tree to resolve. Without this
  // we'd get the same fallback-only output renderToString produced.
  await stream.allReady;
  const html = await new Response(stream).text();
  return { html };
}
