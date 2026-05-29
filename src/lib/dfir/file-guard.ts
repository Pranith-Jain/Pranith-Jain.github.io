/**
 * Shared guards for the client-side forensic parsers (EVTX, PE, registry hive,
 * prefetch, hashing, …). These parse untrusted binaries synchronously on the
 * main thread, so two things matter:
 *   1. Reject oversized files up front with a friendly message rather than
 *      letting a multi-hundred-MB file freeze (or OOM) the tab.
 *   2. Yield a frame before the synchronous parse so a "parsing…" spinner can
 *      actually paint instead of the UI appearing hung.
 */

export const MAX_PARSE_BYTES = 64 * 1024 * 1024; // 64 MB

/** Returns an error string if the file is too large, else null. */
export function fileTooLarge(size: number): string | null {
  if (size > MAX_PARSE_BYTES) {
    return `File too large (${(size / 1048576).toFixed(1)} MB, max ${MAX_PARSE_BYTES / 1048576} MB)`;
  }
  return null;
}

/** Resolve after a macrotask so React can paint a pending state before a blocking parse. */
export const yieldToPaint = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
