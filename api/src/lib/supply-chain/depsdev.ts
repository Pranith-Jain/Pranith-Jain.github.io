// api/src/lib/supply-chain/depsdev.ts
// ONE lib fn for the deps.dev v3 source (single-package deep intel:
// resolved version + OpenSSF Scorecard + license + dependency-graph size).
// Never throws; status is honest. Hard-cap 6 sub-calls (spec §4/§11). Caching
// lives in the route handler, never here. See design §3.1, §8.3, §11.
import type { Fetchish, SCFinding, SCSoftwareResult } from './types';

const DEPSDEV_BASE = 'https://api.deps.dev/v3';
const MAX_SUBCALLS = 6;
// deps.dev GetDependencies only covers these systems (spec §11). Others degrade.
const SUPPORTED_GRAPH = new Set(['npm', 'cargo', 'maven', 'pypi']);

export interface DepsDevOptions {
  fetch?: Fetchish;
  signal?: AbortSignal;
}

function ua(): Record<string, string> {
  return { accept: 'application/json', 'user-agent': 'pranithjain-dfir/1.0' };
}

/** Resolve the default ("latest") version for a package. One sub-call. */
export async function resolveLatestVersion(
  system: string,
  name: string,
  opts: DepsDevOptions = {}
): Promise<string | undefined> {
  const { fetch: fetchFn = globalThis.fetch.bind(globalThis), signal } = opts;
  const url = `${DEPSDEV_BASE}/systems/${encodeURIComponent(system)}/packages/${encodeURIComponent(name)}`;
  const res = await fetchFn(url, { headers: ua(), signal: signal ?? AbortSignal.timeout(8000) });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { versions?: Array<{ versionKey?: { version?: string }; isDefault?: boolean }> };
  const versions = data.versions ?? [];
  const def = versions.find((v) => v.isDefault) ?? versions[versions.length - 1];
  return def?.versionKey?.version;
}

/** ONE lib fn for deps.dev. Never throws; status honest; ≤6 sub-calls. */
export async function fetchDepsDev(
  system: string,
  name: string,
  version: string | undefined,
  opts: DepsDevOptions = {}
): Promise<SCSoftwareResult> {
  const { fetch: fetchFn = globalThis.fetch.bind(globalThis), signal } = opts;
  const sig = signal ?? AbortSignal.timeout(9000);
  const sys = system.toLowerCase();
  const fetched_at = new Date().toISOString();
  const base: Omit<SCSoftwareResult, 'status'> = {
    source: 'deps.dev',
    fetched_at,
    package: name,
    ecosystem: sys,
    version,
    total: 0,
    malicious_count: 0,
    findings: [],
  };
  let budget = MAX_SUBCALLS;
  const spend = () => budget-- > 0;

  try {
    // 1) Resolve version if not pinned. Inspect the status code so a 404 (package
    //    not found) degrades to 'empty' but a 5xx/non-ok upstream is reported as
    //    'error' (honest status — never collapse an upstream failure to empty).
    let resolved = version;
    if (!resolved) {
      if (!spend()) return { ...base, status: 'error', error: 'sub-call budget exhausted' };
      const pkgUrl = `${DEPSDEV_BASE}/systems/${encodeURIComponent(sys)}/packages/${encodeURIComponent(name)}`;
      const pkgRes = await fetchFn(pkgUrl, { headers: ua(), signal: sig });
      if (pkgRes.status === 404) return { ...base, status: 'empty' };
      if (!pkgRes.ok) return { ...base, status: 'error', error: `HTTP ${pkgRes.status}` };
      const pkgData = (await pkgRes.json()) as {
        versions?: Array<{ versionKey?: { version?: string }; isDefault?: boolean }>;
      };
      const versions = pkgData.versions ?? [];
      const def = versions.find((v) => v.isDefault) ?? versions[versions.length - 1];
      resolved = def?.versionKey?.version;
      if (!resolved) return { ...base, status: 'empty' };
    }

    // 2) Version detail: licenses, advisoryKeys (→ findings), projectKeys (→ scorecard).
    if (!spend()) return { ...base, version: resolved, status: 'ok' };
    const verUrl =
      `${DEPSDEV_BASE}/systems/${encodeURIComponent(sys)}/packages/${encodeURIComponent(name)}` +
      `/versions/${encodeURIComponent(resolved)}`;
    const verRes = await fetchFn(verUrl, { headers: ua(), signal: sig });
    if (verRes.status === 404) return { ...base, version: resolved, status: 'empty' };
    if (!verRes.ok) return { ...base, version: resolved, status: 'error', error: `HTTP ${verRes.status}` };
    const ver = (await verRes.json()) as {
      licenses?: string[];
      advisoryKeys?: Array<{ id?: string }>;
      projectKeys?: Array<{ id?: string }>;
    };
    const findings: SCFinding[] = (ver.advisoryKeys ?? [])
      .map((a) => a.id)
      .filter((id): id is string => !!id)
      .map((id) => ({ id, malicious: id.startsWith('MAL-'), aliases: [] }));

    const detail: Record<string, unknown> = {};
    if (ver.licenses?.length) detail.licenses = ver.licenses;

    // 3) Scorecard from the first project key (one sub-call, budget-permitting).
    const projectId = (ver.projectKeys ?? []).map((p) => p.id).find((id): id is string => !!id);
    if (projectId && spend()) {
      const projRes = await fetchFn(`${DEPSDEV_BASE}/projects/${encodeURIComponent(projectId)}`, {
        headers: ua(),
        signal: sig,
      });
      if (projRes.ok) {
        const proj = (await projRes.json()) as { scorecard?: { overallScore?: number } };
        if (typeof proj.scorecard?.overallScore === 'number') detail.scorecard_score = proj.scorecard.overallScore;
      }
    }

    // 4) Resolved dependency-graph size — ONLY for supported ecosystems (spec §11).
    if (SUPPORTED_GRAPH.has(sys) && spend()) {
      const depUrl =
        `${DEPSDEV_BASE}/systems/${encodeURIComponent(sys)}/packages/${encodeURIComponent(name)}` +
        `/versions/${encodeURIComponent(resolved)}:dependencies`;
      const depRes = await fetchFn(depUrl, { headers: ua(), signal: sig });
      if (depRes.ok) {
        const dep = (await depRes.json()) as { nodes?: unknown[] };
        if (Array.isArray(dep.nodes)) detail.dependency_count = dep.nodes.length;
      }
    }

    return {
      ...base,
      version: resolved,
      status: 'ok',
      total: findings.length,
      malicious_count: findings.filter((f) => f.malicious).length,
      findings,
      detail: Object.keys(detail).length ? detail : undefined,
    };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
