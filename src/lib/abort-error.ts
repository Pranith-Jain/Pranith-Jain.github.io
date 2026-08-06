/**
 * Shared abort-error detection.
 *
 * When an AbortController.abort() is called without a reason, the fetch
 * rejects with a DOMException whose name is 'AbortError' and whose message is
 * 'signal is aborted without reason' (or 'The operation was aborted' in some
 * browsers). When AbortSignal.timeout() fires, the rejection name is
 * 'TimeoutError'.
 *
 * These are NOT real errors — they are expected control flow when a component
 * unmounts, re-fetches, or a request is superseded. Surfacing them to the user
 * (via setError or an ErrorBoundary) is a bug. Every catch block around a
 * fetch that uses an AbortController should call this first and return early.
 *
 *   try { await fetch(url, { signal }) } catch (err) {
 *     if (isAbortError(err)) return; // expected — unmount or re-fetch
 *     setError(message(err));
 *   }
 */

/** True when the error is an AbortError (controller.abort() without a reason). */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error) {
    return err.name === 'AbortError';
  }
  return false;
}

/**
 * True when the error is a timeout abort (AbortSignal.timeout() fired).
 * These are also expected when a request exceeds its deadline — callers
 * usually want to show a "timed out" message, not a crash.
 */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'TimeoutError';
  }
  if (err instanceof Error) {
    return err.name === 'TimeoutError';
  }
  return false;
}

/**
 * True for any abort-family error (AbortError or TimeoutError). Use this when
 * you want to silently swallow both unmount aborts and deadline aborts.
 */
export function isAbortOrTimeoutError(err: unknown): boolean {
  return isAbortError(err) || isTimeoutError(err);
}
