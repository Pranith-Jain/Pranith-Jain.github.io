import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api-client';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 200;

function cacheSet(key: string, data: unknown, ttl: number): void {
  const now = Date.now();
  if (cache.size >= CACHE_MAX) {
    let oldest: string | undefined;
    let oldestTime = now;
    for (const [k, v] of cache) {
      if (v.fetchedAt < oldestTime) {
        oldest = k;
        oldestTime = v.fetchedAt;
      }
    }
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, fetchedAt: now, ttl });
}

function cacheGet(key: string, now: number): { entry: CacheEntry; fresh: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.fetchedAt < entry.ttl) {
    return { entry, fresh: true };
  }
  return { entry, fresh: false };
}

function cacheEvictExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.fetchedAt >= v.ttl) cache.delete(k);
  }
}

setInterval(cacheEvictExpired, 60_000);
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', cacheEvictExpired);
}

export interface UseDataFetchOptions<T> {
  url: string | null;
  ttl?: number;
  onError?: (err: Error) => void;
  staleWhileRevalidate?: boolean;
  initial?: T;
}

export interface UseDataFetchResult<T> {
  data: T | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchAndCache<T>(url: string, ttl: number, signal: AbortSignal): Promise<T> {
  const result = await api.get<T>(url, { signal });
  cacheSet(url, result as unknown, ttl);
  return result;
}

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
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const doFetch = useCallback(async (url: string, ttl: number, signal: AbortSignal) => {
    try {
      const json = await fetchAndCache<T>(url, ttl, signal);
      if (!mountedRef.current || signal.aborted) return;
      setData(json);
      setError(null);
      setLoading(false);
      setStale(false);
    } catch (err) {
      if (!mountedRef.current || signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLoading(false);
      setStale(false);
      onErrorRef.current?.(err instanceof Error ? err : new Error(msg));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!url) return;

    const now = Date.now();
    const hit = cacheGet(url, now);

    if (hit?.fresh) {
      setData(hit.entry.data as T);
      setLoading(false);
      setStale(false);
      return;
    }

    if (hit && staleWhileRevalidate) {
      setData(hit.entry.data as T);
      setStale(true);
      setLoading(false);
    } else {
      setLoading(true);
      setStale(false);
    }

    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    doFetch(url, ttl, ctrl.signal);

    return () => {
      mountedRef.current = false;
      ctrl.abort();
    };
  }, [url, ttl, staleWhileRevalidate, doFetch]);

  const refetch = useCallback(() => {
    if (!url) return;
    cache.delete(url);
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    setLoading(true);
    setStale(false);

    doFetch(url, ttl, ctrl.signal);
  }, [url, ttl, doFetch]);

  return { data, loading, stale, error, refetch };
}
