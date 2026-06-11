// api/src/lib/supply-chain/osv.ts
// ONE upstream client for OSV.dev, shared by routes/osv.ts (browser scanner)
// and the supply-chain agent/gatherer paths. Pure-ish: injectable fetch,
// no env, NEVER caches (caching lives in the route), NEVER throws (honest status).
// Lifted from routes/osv.ts so there is a single OSV client. Spec §2.2/§3.1.
import type { Fetchish, SCFinding, SCSoftwareResult } from './types';

const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN = 'https://api.osv.dev/v1/vulns/';
// Each detail lookup is a subrequest; the free-plan cap is 50 (querybatch used 1).
// 35 distinct advisories is plenty for a realistic lockfile and leaves headroom.
const DETAIL_CAP = 35;
const DETAIL_CONCURRENCY = 6;
const UA = 'pranithjain-dfir/1.0';

export interface OsvPkgQuery {
  name: string;
  ecosystem: string;
  version?: string;
}

export interface OsvBatchOptions {
  fetch?: Fetchish;
  signal?: AbortSignal;
}

export interface OsvBatchResult {
  fetched_at: string;
  detailed_capped: boolean;
  results: SCSoftwareResult[];
}

interface OsvDetail {
  summary?: string;
  cvss?: string;
  severity?: string;
  aliases: string[];
  fixed?: string;
  modified?: string;
}

/** Extract the one citable detail object from a raw OSV /v1/vulns/<id> record. */
function extractDetail(d: Record<string, unknown>): OsvDetail {
  const cvss = Array.isArray(d.severity)
    ? (d.severity as { type?: string; score?: string }[]).find((s) => /CVSS/i.test(String(s.type)))?.score
    : undefined;
  let fixed: string | undefined;
  for (const aff of (d.affected as Record<string, unknown>[]) ?? []) {
    for (const rng of (aff.ranges as Record<string, unknown>[]) ?? []) {
      for (const ev of (rng.events as Record<string, string>[]) ?? []) if (ev.fixed && !fixed) fixed = ev.fixed;
    }
  }
  const dbSpec = d.database_specific as { severity?: string } | undefined;
  return {
    summary: String(d.summary ?? d.details ?? '').slice(0, 240) || undefined,
    cvss,
    severity: typeof dbSpec?.severity === 'string' ? dbSpec.severity.toLowerCase() : undefined,
    aliases: Array.isArray(d.aliases) ? (d.aliases as string[]) : [],
    fixed,
    modified: typeof d.modified === 'string' ? d.modified : undefined,
  };
}

/**
 * Query OSV.dev for a batch of packages. Index-aligned querybatch + capped
 * per-vuln detail fan-out. Returns one SCSoftwareResult per input package with
 * an honest status; MAL- records are isolated into malicious_count/malicious.
 */
export async function queryOsvBatch(pkgs: OsvPkgQuery[], opts: OsvBatchOptions = {}): Promise<OsvBatchResult> {
  const { fetch: fetchFn = globalThis.fetch.bind(globalThis), signal } = opts;
  const fetched_at = new Date().toISOString();
  const errored = (): OsvBatchResult => ({
    fetched_at,
    detailed_capped: false,
    results: pkgs.map((p) => ({
      source: 'osv.dev',
      status: 'error',
      fetched_at,
      package: p.name,
      ecosystem: p.ecosystem,
      version: p.version,
      total: 0,
      malicious_count: 0,
      findings: [],
    })),
  });

  const queries = pkgs.map((p) => ({
    package: { name: p.name, ecosystem: p.ecosystem },
    ...(p.version ? { version: p.version } : {}),
  }));

  let batch: { results?: Array<{ vulns?: Array<{ id: string }> }> };
  try {
    const r = await fetchFn(OSV_BATCH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ queries }),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    if (!r.ok) return errored();
    batch = (await r.json()) as typeof batch;
  } catch {
    return errored();
  }

  // Unique vuln ids → capped detail lookups.
  const idToPkgs = new Map<string, number[]>();
  (batch.results ?? []).forEach((res, i) => {
    for (const v of res.vulns ?? []) {
      const arr = idToPkgs.get(v.id) ?? [];
      arr.push(i);
      idToPkgs.set(v.id, arr);
    }
  });
  const allIds = [...idToPkgs.keys()];
  const ids = allIds.slice(0, DETAIL_CAP);
  const detailed_capped = allIds.length > ids.length;

  const details = new Map<string, OsvDetail>();
  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++]!;
      try {
        const dr = await fetchFn(OSV_VULN + encodeURIComponent(id), {
          headers: { 'user-agent': UA },
          signal: signal ?? AbortSignal.timeout(8000),
        });
        if (!dr.ok) continue;
        details.set(id, extractDetail((await dr.json()) as Record<string, unknown>));
      } catch {
        /* skip a single failed detail lookup */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, worker));

  const results: SCSoftwareResult[] = pkgs.map((p, pi) => {
    const vulnIds = (batch.results?.[pi]?.vulns ?? []).map((v) => v.id);
    const findings: SCFinding[] = vulnIds.map((id) => {
      const d = details.get(id);
      return {
        id,
        malicious: id.startsWith('MAL-'),
        summary: d?.summary,
        cvss: d?.cvss,
        severity: d?.severity,
        aliases: d?.aliases ?? [],
        fixed: d?.fixed,
        modified: d?.modified,
      };
    });
    return {
      source: 'osv.dev',
      status: findings.length === 0 ? 'empty' : 'ok',
      fetched_at,
      package: p.name,
      ecosystem: p.ecosystem,
      version: p.version,
      total: findings.length,
      malicious_count: findings.filter((f) => f.malicious).length,
      findings,
    };
  });

  return { fetched_at, detailed_capped, results };
}

/** Single-package convenience wrapper over queryOsvBatch. */
export async function queryOsvPackage(
  name: string,
  ecosystem: string,
  version?: string,
  opts: OsvBatchOptions = {}
): Promise<SCSoftwareResult> {
  const out = await queryOsvBatch([{ name, ecosystem, version }], opts);
  return out.results[0]!;
}
