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
    Authorization: `Bearer ${token()}`,
    'content-type': 'application/json',
  };
}

// Module-level guard: prevent N concurrent in-flight 401s from each firing
// their own `window.location.reload()`. PublishedTab fans out a /social/<slug>
// fetch per row, so a stale token used to schedule M reloads simultaneously.
let reloadingForAuth = false;
function handleUnauthorized(): void {
  if (reloadingForAuth) return;
  reloadingForAuth = true;
  localStorage.removeItem('adminToken');
  // window.location.reload bounces back to the login screen — simplest UX.
  window.location.reload();
}

/** Pull `{error}` out of the body for nicer messages, fall back to status. */
async function extractError(r: Response): Promise<string> {
  let detail = `${r.status} ${r.statusText}`;
  try {
    const err = (await r.clone().json()) as { error?: string };
    if (err.error) detail = err.error;
  } catch {
    /* ignore parse errors */
  }
  return detail;
}

export async function getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + path, { ...init, headers: headers() });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(await extractError(r));
  return r.json() as Promise<T>;
}

export async function postJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + path, { ...init, method: 'POST', headers: headers() });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(await extractError(r));
  return r.json() as Promise<T>;
}

export async function postJsonWithBody<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + path, {
    ...init,
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    handleUnauthorized();
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error(await extractError(r));
  return r.json() as Promise<T>;
}

/**
 * Probe the admin token without mounting the shell. Used by AdminApp on
 * mount: if the cached token is stale, we surface the login screen
 * immediately instead of letting the first tab's fetch trigger a reload
 * loop.
 */
export async function probeAuth(): Promise<boolean> {
  const t = token();
  if (!t) return false;
  try {
    const r = await fetch(`${BASE}/health`, { headers: headers() });
    return r.status !== 401;
  } catch {
    return false;
  }
}
