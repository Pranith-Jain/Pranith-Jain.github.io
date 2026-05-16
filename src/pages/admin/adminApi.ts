// Tiny fetch client for the admin API. Injects X-Admin-Token from localStorage
// on every request. On 401 we wipe the token and reload so the session falls
// back to the login screen — this also covers token-rotated / expired cases
// without per-component error handling.

const BASE = '/api/v1/admin';

function token(): string {
  return localStorage.getItem('adminToken') ?? '';
}

function headers(): HeadersInit {
  return {
    'X-Admin-Token': token(),
    'content-type': 'application/json',
  };
}

function handleUnauthorized(): void {
  localStorage.removeItem('adminToken');
  // window.location.reload bounces back to the login screen — simplest UX.
  window.location.reload();
}

export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { headers: headers() });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function postJson<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { method: 'POST', headers: headers() });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function postJsonWithBody<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try {
      const err = (await r.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}
