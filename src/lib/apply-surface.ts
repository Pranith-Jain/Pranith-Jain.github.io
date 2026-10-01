/**
 * Sets `data-surface` on `<html>` so CSS can style each presentation surface
 * independently.
 *
 * Why this is DOM-level and not React-level: the styling that depends on it
 * (smooth-scroll anchor offsets) must apply to the document scroll container
 * *before* React mounts. Doing it in a component effect would leave the first
 * paint with the wrong offset, which is exactly when a visitor clicking an
 * in-page anchor is most likely to be looking.
 *
 * Attribute selectors also beat a class here: `html[data-surface='portfolio']`
 * is unambiguous, can't collide with the existing `.dark` theme class, and
 * needs no extra class-toggle bookkeeping when the surface changes.
 *
 * Runs before `createRoot` so the attribute is present for the very first
 * style resolution.
 */
import { TOOL_HOSTS, currentSurface } from './surface';

export function applySurfaceAttribute(): void {
  const html = document.documentElement;
  const surface = currentSurface();

  // `currentSurface()` derives from hostname, so this is belt-and-braces for
  // the prerendered tools HTML being opened on a tools host via a stale link.
  const resolved = TOOL_HOSTS.includes(location.hostname.toLowerCase()) ? 'tools' : surface;

  if (html.dataset.surface !== resolved) {
    html.dataset.surface = resolved;
  }
}
