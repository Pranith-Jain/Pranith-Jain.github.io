/**
 * Canonical blob-download helper.
 *
 * Consolidates five near-identical implementations that had drifted across
 * the codebase, plus four page-local copies that were outright broken:
 *
 *   - The page copies called `a.click()` on a **detached** anchor. Firefox
 *     ignores clicks on elements that are not in the document, so every
 *     "Download" button on those four AI-summary pages silently did nothing
 *     in Firefox while working in Chrome.
 *   - They called `URL.revokeObjectURL(url)` **synchronously** right after
 *     `click()`, which races the browser's read of the object URL and can
 *     truncate the download.
 *   - Two exported `downloadBlob` functions lived at
 *     `lib/dfir/report-analyzer/export-pdf` and
 *     `lib/dfir/report-composer/export-pdf`, so a caller had to know which
 *     PDF feature it was in to import the right one.
 *
 * The behaviour here matches the two correct former copies: append to the
 * document, click, remove, and revoke on a timer.
 */

/**
 * Trigger a browser download for `blob`.
 *
 * @param blob    Blob to save.
 * @param filename Suggested filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Must be in the document for `.click()` to dispatch in Firefox.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking synchronously can race the browser reading the URL and produce
  // a zero-byte or truncated file. 1s is long enough for the download to
  // have been handed to the browser's download manager.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download an already-materialised URL (blob: or data:) under `filename`.
 *
 * Use this for canvas exports. `html-to-image`'s `toPng()` returns a **data
 * URL**, not a blob, so those call sites cannot use {@link downloadBlob} —
 * but they were still hand-rolling the anchor dance, including the detached
 * `.click()` that silently fails in Firefox.
 *
 * No revocation happens here: a `data:` URL has no blob to release, and a
 * `blob:` URL passed in by the caller is usually also being rendered in an
 * `<img>`, so revoking it would break the preview.
 */
export function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Build a `Blob` from text and download it.
 *
 * Convenience wrapper for the common "save this report as .md/.json/.txt"
 * case, so callers do not each hand-roll the `new Blob([...])` part.
 */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
}

/** Same as {@link downloadText} but serialises the value as pretty JSON. */
export function downloadJson(filename: string, data: unknown): void {
  downloadText(JSON.stringify(data, null, 2), filename, 'application/json');
}
