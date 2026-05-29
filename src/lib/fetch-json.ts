/**
 * Drop-in replacement for `fetch().json()` that handles non-JSON responses.
 *
 * Usage (minimal change from raw fetch):
 *   BEFORE: const data = await (await fetch('/api/v1/foo')).json();
 *   AFTER:  const data = await fetchJson<FooResponse>('/api/v1/foo');
 *
 * Or with options:
 *   const data = await fetchJson<BarResponse>('/api/v1/bar', {
 *     method: 'POST',
 *     body: JSON.stringify(payload),
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 */

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string; detail?: string };
      msg = parsed.message || parsed.detail || parsed.error || msg;
    } catch {
      if (body) msg = `${msg}: ${body.slice(0, 100)}`;
    }
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `Non-JSON response: ${text.slice(0, 100)}` : 'Non-JSON response');
  }
  return (await res.json()) as T;
}
