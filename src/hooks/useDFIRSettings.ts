/**
 * @deprecated `apiUrl` is no longer configurable; the API is same-origin.
 * Kept as a compatibility shim while remaining DFIR tabs are migrated.
 * Returns empty string so callers building `${apiUrl}/path` produce same-origin URLs.
 */
export function useDFIRSettings(): { apiUrl: string } {
  return { apiUrl: '' };
}
