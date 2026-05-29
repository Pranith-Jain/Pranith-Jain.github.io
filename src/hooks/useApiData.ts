/**
 * Shared hook for API data fetching with loading, error, and retry.
 *
 * Replaces the pattern of:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   useEffect(() => { fetch(...).then(...).catch(...) }, []);
 *
 * With:
 *   const { data, loading, error, refetch } = useApiData('/api/v1/endpoint');
 *
 * Features:
 *   - Automatic loading/error state management
 *   - Stale-while-revalidate via useDataFetch
 *   - Consistent error messages from api client
 *   - Refetch on URL change
 *   - Optional polling interval
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api-client';
import { ApiError } from '../lib/api-client';

export interface UseApiDataOptions<T> {
  /** Initial data while loading. */
  initial?: T;
  /** Polling interval in ms. 0 = disabled. */
  pollInterval?: number;
  /** Skip the fetch (e.g., when URL depends on user input). */
  enabled?: boolean;
  /** Transform the response before setting data. */
  transform?: (data: unknown) => T;
  /** Callback on error. */
  onError?: (err: Error) => void;
}

export interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Clear error and retry. */
  retry: () => void;
}

export function useApiData<T = unknown>(
  url: string | null,
  options: UseApiDataOptions<T> = {}
): UseApiDataResult<T> {
  const { initial, pollInterval = 0, enabled = true, transform, onError } = options;
  const [data, setData] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial && !!url && enabled);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!url || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.get<T>(url, { signal });
      if (!mountedRef.current) return;
      setData(transform ? transform(result) : result);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      setError(msg);
      onErrorRef.current?.(err instanceof Error ? err : new Error(msg));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, enabled, transform]);

  // Fetch on mount and when URL changes.
  useEffect(() => {
    mountedRef.current = true;
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    fetchData(ctrl.signal);

    return () => {
      mountedRef.current = false;
      ctrl.abort();
    };
  }, [fetchData]);

  // Polling.
  useEffect(() => {
    if (!pollInterval || !url || !enabled) return;
    const interval = setInterval(() => fetchData(), pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, url, enabled, fetchData]);

  const refetch = useCallback(() => {
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    fetchData(ctrl.signal);
  }, [fetchData]);

  const retry = useCallback(() => {
    setError(null);
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch, retry };
}

/**
 * POST mutation hook with loading/error state.
 * For form submissions, button clicks, etc.
 */
export function useApiMutation<TInput, TOutput = void>(url: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TOutput | null>(null);

  const mutate = useCallback(async (input: TInput): Promise<TOutput | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<TOutput>(url, input);
      setData(result);
      return result;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [url]);

  const reset = useCallback(() => {
    setError(null);
    setData(null);
  }, []);

  return { mutate, loading, error, data, reset };
}
