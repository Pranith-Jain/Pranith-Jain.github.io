import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Module-level in-memory cache. Persists across hook instances within
 * the same page load. Cleared on full-page navigation (hard refresh).
 * TTL-matched to the backend Cache-Control max-age when known.
 */
const cache = new Map<string, { data: unknown; fetchedAt: number; ttl: number }>();

/**
 * Options for useDataFetch.
 *
 * @param url - The URL to fetch. Pass `null` to skip the fetch.
 * @param ttl - Cache TTL in milliseconds. Defaults to 30_000 (30s).
 * @param onError - Callback fired on fetch error (for logging / toast).
 * @param staleWhileRevalidate - When true, returns stale data immediately
 *   while re-fetching in the background. Defaults to true.
 */
export interface UseDataFetchOptions<T> {
  url: string | null;
  ttl?: number;
  onError?: (err: Error) => void;
  staleWhileRevalidate?: boolean;
  /**
   * Optional initial data to return while the first fetch completes.
   * Avoids flash-of-loading when the data is known (e.g. SSR-prerendered).
   */
  initial?: T;
}

/**
 * Result of useDataFetch.
 */
export interface UseDataFetchResult<T> {
  /** Parsed response data, or null before first successful fetch. */
  data: T | null;
  /** True while a fetch is in-flight (no cached data available). */
  loading: boolean;
  /** True when showing stale data while re-fetching in background. */
  stale: boolean;
  /** Error message if the most recent fetch failed. */
  error: string | null;
  /** Manually trigger a re-fetch. */
  refetch: () => void;
}

/**
 * Data-fetching hook with stale-while-revalidate semantics.
 *
 * Returns cached data immediately (if available) while re-fetching in
 * the background. Eliminates loading spinners on back-navigation and
 * reduces redundant API calls when multiple components mount near-
 * simultaneously.
 *
 * Cache is keyed by URL and shared across all hook instances.
 *
 * @example
 * const { data, loading, error } = useDataFetch<BriefingItem[]>({
 *   url: '/api/v1/briefings/list?limit=14&type=daily',
 *   ttl: 60_000,
 * });
 */
export function useDataFetch<T = unknown>({
  url,
  ttl = 30_000,
  onError,
  staleWhileRevalidate = true,
  initial,
}: UseDataFetchOptions<T>): UseDataFetchResult<T> {
  const [data, setData] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial && !!url);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchFn = useRef(async (u: string) => {
    // Check cache first.
    const cached = cache.get(u);
    if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
      setData(cached.data as T);
      setLoading(false);
      setStale(false);
      return;
    }

    if (cached && staleWhileRevalidate) {
      // Stale data available — serve immediately, revalidate in background.
      setData(cached.data as T);
      setStale(true);
      setLoading(false);
    } else {
      setLoading(true);
      setStale(false);
    }

    // Abort any in-flight request for this URL.
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    try {
      const res = await fetch(u, { signal: ctrl.signal });
      if (!mountedRef.current || ctrl.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (!mountedRef.current || ctrl.signal.aborted) return;

      // Update cache.
      cache.set(u, { data: json as unknown, fetchedAt: Date.now(), ttl });
      setData(json);
      setError(null);
      setLoading(false);
      setStale(false);
    } catch (err) {
      if (!mountedRef.current || ctrl.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLoading(false);
      setStale(false);
      onError?.(err instanceof Error ? err : new Error(msg));
    }
  });

  useEffect(() => {
    mountedRef.current = true;
    if (url) {
      fetchFn.current(url);
    }
    return () => {
      mountedRef.current = false;
      if (ctrlRef.current) ctrlRef.current.abort();
    };
  }, [url, ttl]);

  const refetch = useCallback(() => {
    if (url) fetchFn.current(url);
  }, [url]);

  return { data, loading, stale, error, refetch };
}
