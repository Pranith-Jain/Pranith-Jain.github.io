/**
 * CAPEv2 sandbox bridge client.
 *
 * Talks to a self-hosted CAPEv2 instance's native REST API (`/apiv2/...`)
 * reached through a Cloudflare Tunnel. All access is gated on the optional
 * `CAPE_BRIDGE_URL` secret: when unset the bridge reports itself unconfigured
 * and callers degrade to 503, exactly like the other optional providers
 * (SPUR_API_KEY, PDCP_API_KEY, …). The Worker only proxies bytes — it never
 * executes a sample.
 *
 * @see docs/self-hosted/cape-bridge.md
 */

export interface CapeEnv {
  CAPE_BRIDGE_URL?: string;
  CAPE_BRIDGE_TOKEN?: string;
}

export interface CapeTaskRef {
  task_id: number;
}

export interface CapeStatus {
  id: number;
  status: string;
}

export interface CapeIocs {
  domains: string[];
  ips: string[];
  urls: string[];
  hashes: string[];
}

export type CapeVerdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export interface CapeSignature {
  name: string;
  description?: string;
  severity?: number;
}

export interface CapeNormalizedReport {
  task_id: number;
  score: number; // 0-100 (CAPE malscore ×10, clamped)
  verdict: CapeVerdict;
  signatures: CapeSignature[];
  dropped: Array<{ name?: string; sha256?: string }>;
  iocs: CapeIocs;
  target?: { filename?: string; sha256?: string };
}

/** Raised when the bridge is asked to act but `CAPE_BRIDGE_URL` is unset. */
export class CapeUnconfiguredError extends Error {
  constructor() {
    super('CAPE bridge not configured');
    this.name = 'CapeUnconfiguredError';
  }
}

/** Raised when CAPE returns a non-2xx or an unexpected payload. */
export class CapeBridgeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'CapeBridgeError';
    this.status = status;
  }
}

// ─── loose shapes for CAPE's JSON (defensive — versions vary) ────────────────

interface CapeSubmitResponse {
  error?: boolean;
  data?: { task_ids?: number[]; task_id?: number };
  task_ids?: number[];
  task_id?: number;
}

interface CapeViewResponse {
  data?: { id?: number; status?: string };
  id?: number;
  status?: string;
}

interface RawCapeReport {
  data?: RawCapeReport;
  info?: { score?: number };
  signatures?: Array<{ name?: string; description?: string; severity?: number }>;
  target?: { file?: { name?: string; sha256?: string } };
  dropped?: Array<{ name?: string; sha256?: string }>;
  network?: {
    domains?: Array<{ domain?: string } | string>;
    dns?: Array<{ request?: string }>;
    hosts?: Array<{ ip?: string } | string>;
    http?: Array<{ uri?: string; url?: string }>;
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function isCapeConfigured(env: CapeEnv): boolean {
  return Boolean(env.CAPE_BRIDGE_URL && env.CAPE_BRIDGE_URL.trim());
}

/** Normalized API base, e.g. `https://cape.example.com/apiv2`. */
export function capeApiBase(env: CapeEnv): string {
  const raw = (env.CAPE_BRIDGE_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) throw new CapeUnconfiguredError();
  return raw.endsWith('/apiv2') ? raw : `${raw}/apiv2`;
}

function authHeaders(env: CapeEnv): Record<string, string> {
  const token = env.CAPE_BRIDGE_TOKEN?.trim();
  return token ? { Authorization: `Token ${token}` } : {};
}

function requireConfigured(env: CapeEnv): string {
  if (!isCapeConfigured(env)) throw new CapeUnconfiguredError();
  return capeApiBase(env);
}

/** Defensive cap per collection — a compromised/hostile CAPE host could emit a
 *  pathologically large report; bound work and response size regardless. */
const MAX_REPORT_ITEMS = 1000;

function asArray<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v.slice(0, MAX_REPORT_ITEMS) : [];
}

// ─── client ──────────────────────────────────────────────────────────────────

export async function submitFile(
  env: CapeEnv,
  file: { bytes: ArrayBuffer | Uint8Array; filename: string },
  signal?: AbortSignal
): Promise<CapeTaskRef> {
  const base = requireConfigured(env);
  const form = new FormData();
  form.append('file', new Blob([file.bytes]), file.filename);

  const res = await fetch(`${base}/tasks/create/file/`, {
    method: 'POST',
    headers: { ...authHeaders(env) },
    body: form,
    signal,
  });
  if (!res.ok) throw new CapeBridgeError(`CAPE submit failed: HTTP ${res.status}`);

  const json = (await res.json()) as CapeSubmitResponse;
  const data = json.data ?? json;
  const id = data.task_ids?.[0] ?? data.task_id ?? json.task_ids?.[0] ?? json.task_id;
  if (typeof id !== 'number') throw new CapeBridgeError('CAPE submit: no task id in response');
  return { task_id: id };
}

export async function taskStatus(env: CapeEnv, id: number, signal?: AbortSignal): Promise<CapeStatus> {
  const base = requireConfigured(env);
  const res = await fetch(`${base}/tasks/view/${id}/`, { headers: { ...authHeaders(env) }, signal });
  if (!res.ok) throw new CapeBridgeError(`CAPE status failed: HTTP ${res.status}`);

  const json = (await res.json()) as CapeViewResponse;
  const data = json.data ?? json;
  return { id: typeof data.id === 'number' ? data.id : id, status: String(data.status ?? 'unknown') };
}

export async function fetchReport(env: CapeEnv, id: number, signal?: AbortSignal): Promise<unknown> {
  const base = requireConfigured(env);
  const res = await fetch(`${base}/tasks/report/${id}/`, { headers: { ...authHeaders(env) }, signal });
  if (!res.ok) throw new CapeBridgeError(`CAPE report failed: HTTP ${res.status}`);
  return res.json();
}

export function normalizeReport(raw: unknown, taskId: number): CapeNormalizedReport {
  let r = (raw ?? {}) as RawCapeReport;
  if (r.data && !r.info) r = r.data; // some versions wrap the report under .data

  const malscore = typeof r.info?.score === 'number' ? r.info.score : null;
  const score = malscore === null ? 0 : Math.max(0, Math.min(100, Math.round(malscore * 10)));
  const verdict: CapeVerdict =
    malscore === null ? 'unknown' : malscore >= 7 ? 'malicious' : malscore >= 3 ? 'suspicious' : 'clean';

  const domains = new Set<string>();
  const ips = new Set<string>();
  const urls = new Set<string>();
  const hashes = new Set<string>();

  const net = r.network ?? {};
  for (const d of asArray(net.domains)) {
    const v = typeof d === 'string' ? d : d.domain;
    if (v) domains.add(v);
  }
  for (const d of asArray(net.dns)) {
    if (d.request) domains.add(d.request);
  }
  for (const h of asArray(net.hosts)) {
    const v = typeof h === 'string' ? h : h.ip;
    if (v) ips.add(v);
  }
  for (const u of asArray(net.http)) {
    const v = u.uri ?? u.url;
    if (v) urls.add(v);
  }

  const targetSha = r.target?.file?.sha256;
  if (targetSha) hashes.add(targetSha);

  const dropped = asArray(r.dropped).map((d) => ({ name: d.name, sha256: d.sha256 }));
  for (const d of dropped) {
    if (d.sha256) hashes.add(d.sha256);
  }

  const signatures: CapeSignature[] = asArray(r.signatures)
    .map((s) => ({
      name: String(s.name ?? ''),
      description: s.description,
      severity: typeof s.severity === 'number' ? s.severity : undefined,
    }))
    .filter((s) => s.name);

  const cap = (set: Set<string>): string[] => [...set].slice(0, MAX_REPORT_ITEMS);
  return {
    task_id: taskId,
    score,
    verdict,
    signatures,
    dropped,
    iocs: { domains: cap(domains), ips: cap(ips), urls: cap(urls), hashes: cap(hashes) },
    target: { filename: r.target?.file?.name, sha256: targetSha },
  };
}
