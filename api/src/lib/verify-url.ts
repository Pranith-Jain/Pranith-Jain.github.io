export interface VerifyResult {
  ok: boolean;
  status: number | null;
  statusText: string;
  error?: string;
}

export async function verifyUrl(url: string, timeoutMs = 5000): Promise<VerifyResult> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(id);
    if (r.ok) {
      return { ok: true, status: r.status, statusText: r.statusText };
    }
    // 4xx/5xx — the URL genuinely doesn't resolve
    return { ok: false, status: r.status, statusText: r.statusText };
  } catch (err) {
    // Network error (timeout, DNS failure, etc.) — might be transient;
    // treated as 'unchecked' rather than 'broken' by callers.
    return {
      ok: false,
      status: null,
      statusText: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function verifyUrls(urls: string[], timeoutMs = 5000): Promise<Map<string, VerifyResult>> {
  const results = new Map<string, VerifyResult>();
  const entries = await Promise.allSettled(urls.map((u) => verifyUrl(u, timeoutMs)));
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const result = entries[i];
    if (url) {
      if (result?.status === 'fulfilled') {
        results.set(url, result.value);
      } else {
        results.set(url, { ok: false, status: null, statusText: 'error', error: 'promise rejected' });
      }
    }
  }
  return results;
}

export type LinkStatus = 'ok' | 'broken' | 'unchecked';

export function statusLabel(s: LinkStatus): string {
  return s === 'ok' ? 'verified' : s === 'broken' ? 'broken' : 'unchecked';
}
