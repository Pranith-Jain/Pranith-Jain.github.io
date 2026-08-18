import { memoryCache } from '../infrastructure/cache/memory-cache';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(url: string, init: RequestInit & RequestOptions = {}): Promise<T> {
  const { timeoutMs, ...fetchInit } = init;
  const signal = fetchInit.signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);
  const reqInit: RequestInit = { ...fetchInit };
  if (signal) reqInit.signal = signal;

  const res = await fetch(url, reqInit);

  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json') || ct.includes('application/json')) {
      const parsed = (await res.json().catch(() => null)) as Record<string, string> | null;
      const msg = parsed?.message || parsed?.detail || parsed?.error || `HTTP ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    const text = await res.text().catch(() => '');
    const msg = text ? `HTTP ${res.status}: ${text.slice(0, 100)}` : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, text.slice(0, 200));
  }

  return parseJson<T>(res);
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const ct = res.headers.get('content-type') ?? '';
    const snippet = ct ? ` (${ct})` : '';
    throw new ApiError(res.status, `Malformed JSON${snippet}: ${text.slice(0, 200)}`);
  }
}

function headersWithAccept(extra?: Record<string, string>): Record<string, string> {
  if (!extra) return { accept: 'application/json' };
  return { ...extra, accept: 'application/json' };
}

function headersWithJson(extra?: Record<string, string>): Record<string, string> {
  if (!extra) return { 'content-type': 'application/json', accept: 'application/json' };
  return { 'content-type': 'application/json', accept: 'application/json', ...extra };
}

export const api = {
  async get<T>(url: string, opts?: RequestOptions): Promise<T> {
    return request<T>(url, {
      method: 'GET',
      headers: headersWithAccept(opts?.headers),
      timeoutMs: opts?.timeoutMs ?? 15000,
      signal: opts?.signal,
    });
  },

  async post<T>(url: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: headersWithJson(opts?.headers),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs ?? 30000,
      signal: opts?.signal,
    });
  },

  async delete<T = void>(url: string, opts?: RequestOptions): Promise<T> {
    return request<T>(url, {
      method: 'DELETE',
      headers: headersWithAccept(opts?.headers),
      timeoutMs: opts?.timeoutMs ?? 15000,
      signal: opts?.signal,
    });
  },

  async getOrNull<T>(url: string, opts?: RequestOptions): Promise<T | null> {
    try {
      return await api.get<T>(url, opts);
    } catch {
      return null;
    }
  },

  stream(url: string, onData: (event: string, data: string) => void, onError?: (err: Event) => void): () => void {
    const es = new EventSource(url);
    es.onmessage = (e) => onData('message', e.data);
    es.onerror = (e) => {
      onError?.(e);
      es.close();
    };
    return () => es.close();
  },
};

/**
 * Plain-fetch drop-in that routes through the shared memory cache (30s TTL by
 * default, in-flight dedup, and sessionStorage persistence across reloads).
 * For feed-style pages that previously called `fetch(url).then(r => r.json())`
 * directly and so re-fetched on every mount and every hard reload.
 *
 * Throws an Error with the upstream `error` message (when the body carries
 * one) so callers that surface error details keep working. Failed/error
 * responses are NOT cached - only successful ones are.
 */
export async function fetchJsonCached<T>(url: string, ttl = 30_000, timeoutMs = 20_000): Promise<T> {
  return memoryCache.dedup<T>(
    url,
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const body = (await res.json().catch(() => null)) as T | null;
      if (!res.ok) {
        const msg =
          body && typeof body === 'object' && 'error' in body
            ? ((body as { error?: string }).error ?? `HTTP ${res.status}`)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return body as T;
    },
    ttl
  );
}
