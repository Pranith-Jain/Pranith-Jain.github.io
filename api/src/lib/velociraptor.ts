/**
 * Velociraptor endpoint connector — REST client for the Velociraptor server's
 * HTTP JSON gateway (server config `API.bindings`).
 *
 * Fleet-parity AIR-ops bridge: the investigator can enumerate managed
 * endpoints, launch artifact collections, and pull results — evidence
 * acquisition without leaving the investigation loop.
 *
 * Auth: Bearer token (VELO_API_TOKEN) or Basic (VELO_USERNAME/VELO_PASSWORD),
 * matching what a reverse-proxied gateway typically accepts.
 *
 * Degradation: when VELO_API_URL is unset every call returns
 * { configured: false, hint } — tools stay registered so the planner can see
 * the capability, but calls are honest no-ops instead of failures.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

export interface VeloConfig {
  baseUrl: string;
  authHeader: string;
}

export function veloConfig(env: { VELO_API_URL?: string; VELO_API_TOKEN?: string; VELO_USERNAME?: string; VELO_PASSWORD?: string }): VeloConfig | null {
  const raw = env.VELO_API_URL?.trim().replace(/\/+$/, '');
  if (!raw) return null;
  let authHeader = '';
  if (env.VELO_API_TOKEN?.trim()) {
    authHeader = `Bearer ${env.VELO_API_TOKEN.trim()}`;
  } else if (env.VELO_USERNAME?.trim() && env.VELO_PASSWORD) {
    const basic = btoa(`${env.VELO_USERNAME.trim()}:${env.VELO_PASSWORD}`);
    authHeader = `Basic ${basic}`;
  }
  return { baseUrl: raw, authHeader };
}

/** Typed result — never throws past the caller. */
export type VeloResult<T> =
  | { ok: true; data: T; elapsedMs: number }
  | { ok: false; error: string; status?: number; configured?: boolean };

async function veloCall<T>(
  cfg: VeloConfig,
  method: string,
  body: Record<string, unknown>,
  init?: { self?: Fetcher; timeoutMs?: number }
): Promise<VeloResult<T>> {
  const started = Date.now();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.authHeader) headers.authorization = cfg.authHeader;
  const url = `${cfg.baseUrl}/api/v1/${method}`;
  try {
    const req = new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const res = init?.self ? await init.self.fetch(req) : await fetch(req);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `velociraptor ${res.status}: ${text.slice(0, 300)}`, status: res.status };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: `velociraptor returned non-JSON (${text.slice(0, 120)})`, status: res.status };
    }
    return { ok: true, data: data as T, elapsedMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes('abort') ? `velociraptor timeout after ${DEFAULT_TIMEOUT_MS}ms` : msg };
  }
}

// ── Proto shapes (subset we consume) ───────────────────────────────────────

export interface VeloClientSummary {
  client_id?: string;
  hostname?: string;
  os_info?: { system?: string; release?: string; machine?: string; fqdn?: string };
  last_seen_at?: number; // ns since epoch in velociraptor protos
  labels?: string[];
  online?: boolean;
}

export interface VeloFlowSummary {
  flow_id?: string;
  artifacts?: Array<{ artifact?: string; parameters?: { env?: Array<{ key?: string; value?: string }> } }>;
  state?: 'RUNNING' | 'FINISHED' | 'ERROR' | 'PENDING' | string;
  create_time?: number;
  request?: { artifacts?: string[] };
}

export interface VeloTableResult {
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  total_rows?: number;
}

function nsToIso(ns: unknown): string | undefined {
  if (typeof ns !== 'number' || ns <= 0) return undefined;
  // Velociraptor timestamps are nanoseconds since epoch.
  const ms = ns > 1e15 ? Math.round(ns / 1e6) : ns;
  return new Date(ms).toISOString();
}

function normalizeClient(c: VeloClientSummary): Record<string, unknown> {
  return {
    client_id: c.client_id,
    hostname: c.hostname ?? c.os_info?.fqdn,
    // (test asserts hostname 'DC01' preferred over fqdn)
    os: c.os_info ? `${c.os_info.system ?? ''} ${c.os_info.release ?? ''}`.trim() || undefined : undefined,
    arch: c.os_info?.machine,
    lastSeen: nsToIso(c.last_seen_at),
    labels: c.labels ?? [],
  };
}

// ── Public operations ──────────────────────────────────────────────────────

export async function veloListClients(
  env: Parameters<typeof veloConfig>[0],
  opts: { search?: string; limit?: number; self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; clients?: Record<string, unknown>[]; count?: number; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) {
    return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'set VELO_API_URL (+ VELO_API_TOKEN or VELO_USERNAME/VELO_PASSWORD) to enable endpoint acquisition' } };
  }
  const r = await veloCall<{ clients?: VeloClientSummary[] }>(
    cfg,
    'ListClients',
    { query: opts.search ?? '', limit: Math.min(Math.max(opts.limit ?? 50, 1), 500) },
    { self: opts.self }
  );
  if (!r.ok) return r;
  const clients = (r.data.clients ?? []).map(normalizeClient);
  return { ok: true, elapsedMs: r.elapsedMs, data: { configured: true, clients, count: clients.length } };
}

export async function veloGetClient(
  env: Parameters<typeof veloConfig>[0],
  clientId: string,
  opts: { self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; client?: Record<string, unknown>; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'VELO_API_URL not configured' } };
  const r = await veloCall<{ client?: VeloClientSummary }>(cfg, 'GetClient', { client_id: clientId }, { self: opts.self });
  if (!r.ok) return r;
  if (!r.data.client) return { ok: false, error: `client ${clientId} not found` };
  return { ok: true, elapsedMs: r.elapsedMs, data: { configured: true, client: normalizeClient(r.data.client) } };
}

export async function veloListFlows(
  env: Parameters<typeof veloConfig>[0],
  clientId: string,
  opts: { limit?: number; self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; flows?: Record<string, unknown>[]; count?: number; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'VELO_API_URL not configured' } };
  const r = await veloCall<{ flows?: VeloFlowSummary[] }>(
    cfg,
    'GetClientFlows',
    { client_id: clientId, limit: Math.min(Math.max(opts.limit ?? 20, 1), 200) },
    { self: opts.self }
  );
  if (!r.ok) return r;
  const flows = (r.data.flows ?? []).map((f) => ({
    flow_id: f.flow_id,
    artifacts: f.request?.artifacts ?? f.artifacts?.map((a) => a.artifact).filter(Boolean),
    state: f.state,
    created: nsToIso(f.create_time),
  }));
  return { ok: true, elapsedMs: r.elapsedMs, data: { configured: true, flows, count: flows.length } };
}

export interface CollectParams {
  client_id: string;
  /** Artifact names, e.g. Windows.KapeFiles.Collect / Custom.DetectPhish */
  artifacts: string[];
  /** Artifact parameter env vars applied to all collected artifacts. */
  parameters?: Record<string, string>;
  urgent?: boolean;
  timeout?: number;
}

export async function veloCollectArtifact(
  env: Parameters<typeof veloConfig>[0],
  p: CollectParams,
  opts: { self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; flowId?: string; artifacts?: string[]; state?: string; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'VELO_API_URL not configured' } };
  if (!p.artifacts.length) return { ok: false, error: 'artifacts list is empty' };
  const envVars = Object.entries(p.parameters ?? {}).map(([key, value]) => ({ key, value }));
  const r = await veloCall<{ flow_id?: string; state?: string }>(cfg, 'CollectArtifact', {
    client_id: p.client_id,
    artifacts: p.artifacts,
    ...(envVars.length ? { parameters: { env: envVars } } : {}),
    urgent: p.urgent === true,
    ...(p.timeout ? { timeout: p.timeout } : {}),
    allow_queued: true,
  }, { self: opts.self, timeoutMs: 30_000 });
  if (!r.ok) return r;
  return {
    ok: true,
    elapsedMs: r.elapsedMs,
    data: {
      configured: true,
      flowId: r.data.flow_id,
      artifacts: p.artifacts,
      state: r.data.state ?? 'RUNNING',
      hint: r.data.flow_id ? `poll velo_get_flow_status(client_id='${p.client_id}', flow_id='${r.data.flow_id}')` : undefined,
    },
  };
}

export async function veloGetFlowStatus(
  env: Parameters<typeof veloConfig>[0],
  clientId: string,
  flowId: string,
  opts: { self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; flow?: Record<string, unknown>; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'VELO_API_URL not configured' } };
  const r = await veloCall<{ context?: VeloFlowSummary & { total_loaded_files?: number; total_collected_bytes?: number; execution_duration?: number } }>(
    cfg,
    'GetFlowDetails',
    { client_id: clientId, flow_id: flowId },
    { self: opts.self }
  );
  if (!r.ok) return r;
  const ctx = r.data.context;
  if (!ctx) return { ok: false, error: `flow ${flowId} not found` };
  return {
    ok: true,
    elapsedMs: r.elapsedMs,
    data: {
      configured: true,
      flow: {
        flow_id: ctx.flow_id,
        artifacts: ctx.request?.artifacts ?? ctx.artifacts?.map((a) => a.artifact),
        state: ctx.state,
        durationSec: typeof ctx.execution_duration === 'number' ? Number((ctx.execution_duration / 1e9).toFixed(1)) : undefined,
        collectedBytes: ctx.total_collected_bytes,
        filesLoaded: ctx.total_loaded_files,
        created: nsToIso(ctx.create_time),
      },
      hint: ctx.state === 'RUNNING' ? 'still running — poll again' : ctx.state === 'FINISHED' ? "done — fetch rows with velo_get_flow_results" : undefined,
    },
  };
}

export async function veloGetFlowResults(
  env: Parameters<typeof veloConfig>[0],
  clientId: string,
  flowId: string,
  opts: { artifact?: string; offset?: number; rows?: number; self?: Fetcher } = {}
): Promise<VeloResult<{ configured: boolean; artifact?: string; columns?: string[]; rows?: Record<string, unknown>[]; totalRows?: number; truncated?: boolean; hint?: string }>> {
  const cfg = veloConfig(env);
  if (!cfg) return { ok: true, elapsedMs: 0, data: { configured: false, hint: 'VELO_API_URL not configured' } };
  const maxRows = Math.min(Math.max(opts.rows ?? 100, 1), 1000);
  const r = await veloCall<VeloTableResult & { artifact?: string }>(
    cfg,
    'GetFlowResults',
    {
      client_id: clientId,
      flow_id: flowId,
      ...(opts.artifact ? { artifact: opts.artifact } : {}),
      offset: Math.max(opts.offset ?? 0, 0),
      rows: maxRows,
    },
    { self: opts.self, timeoutMs: 45_000 }
  );
  if (!r.ok) return r;
  const rows = r.data.rows ?? [];
  const total = r.data.total_rows ?? rows.length;
  return {
    ok: true,
    elapsedMs: r.elapsedMs,
    data: {
      configured: true,
      artifact: opts.artifact ?? r.data.artifact,
      columns: r.data.columns,
      rows,
      totalRows: total,
      truncated: total > (opts.offset ?? 0) + rows.length,
      hint: total > (opts.offset ?? 0) + rows.length ? `more rows available — re-call with offset=${(opts.offset ?? 0) + rows.length}` : undefined,
    },
  };
}
