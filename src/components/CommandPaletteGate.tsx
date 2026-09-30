import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

const CommandPalette = lazy(() => import('./dfir/CommandPalette').then((m) => ({ default: m.CommandPalette })));

/**
 * Mounts the Cmd+K palette only after the browser goes idle so its chunk
 * never competes with first paint, and wraps it in the app's error
 * boundary so a failed chunk fetch degrades to "no palette" instead of
 * throwing to the root — a bare `<Suspense fallback={null}>` around a
 * lazy() rejection has no boundary above it in either render path.
 */
export function CommandPaletteGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </ErrorBoundary>
  );
}
