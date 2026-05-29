/**
 * Safe fetch helpers for DFIR tools.
 *
 * Prevents "JSON.parse: unexpected character" errors that occur when
 * a backend route returns non-JSON (HTML error page, plain text 503,
 * empty response) and the frontend blindly calls `res.json()`.
 *
 * Usage:
 *   const data = await fetchJson<MyType>('/api/v1/some-endpoint');
 *   // or with options:
 *   const data = await fetchJson<MyType>('/api/v1/some-endpoint', {
 *     method: 'POST',
 *     body: JSON.stringify(input),
 *   });
 */

export class FetchError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Safely parse a response as JSON. Handles non-JSON responses gracefully
 * instead of throwing a raw JSON.parse error.
 */
export async function safeParseJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json') && !ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 200).trim();
    throw new FetchError(
      res.status,
      snippet
        ? `Server returned ${res.status} non-JSON: ${snippet}`
        : `Server returned ${res.status} with no body`,
      snippet
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new FetchError(res.status, `Server returned ${res.status} with malformed JSON`);
  }
}

/**
 * Fetch + parse JSON with proper error handling. Throws FetchError on
 * non-OK responses or non-JSON bodies.
 *
 * @example
 * const data = await fetchJson<DomainLookupResponse>(
 *   `/api/v1/domain/lookup?domain=${encodeURIComponent(domain)}`
 * );
 */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs, ...fetchInit } = init ?? {};
  const signal = fetchInit.signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);

  const res = await fetch(url, { ...fetchInit, signal });

  if (!res.ok) {
    // Try to extract a useful error message from the response body.
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string; detail?: string };
      msg = parsed.message || parsed.detail || parsed.error || msg;
    } catch {
      if (body) msg = `${msg}: ${body.slice(0, 100)}`;
    }
    throw new FetchError(res.status, msg, body);
  }

  return safeParseJson<T>(res);
}

/**
 * Fetch + parse JSON that returns null on any error (network, non-OK, non-JSON).
 * Use for optional/best-effort lookups where failure is acceptable.
 */
export async function fetchJsonOrNull<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    return await fetchJson<T>(url, init);
  } catch {
    return null;
  }
}
