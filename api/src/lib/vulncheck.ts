/**
 * VulnCheck v3 API client (https://api.vulncheck.com/v3).
 *
 * Auth: `Authorization: Bearer <VULNCHECK_API_TOKEN>` (free Community token).
 * Index endpoints return `{ _meta: { total_documents }, data: [...] }`. Fields
 * are read DEFENSIVELY (multiple candidate names) — VulnCheck's per-index shapes
 * vary and providers silently rot, so verify against the live response on first
 * use and tighten the field reads if upstream differs. Each call is ONE
 * subrequest to stay within the Free-plan budget when used in fan-outs.
 */
const BASE = 'https://api.vulncheck.com/v3';
const UA = 'pranithjain.qzz.io dfir';
const TIMEOUT = 10_000;
const MAX_RETRIES = 2;

interface VcEnvelope {
  _meta?: { total_documents?: number };
  data?: Array<Record<string, unknown>>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

type VcError = { status: number; body?: string } | { network: true };

async function vcGet(
  path: string,
  token: string,
  signal?: AbortSignal
): Promise<{ ok: VcEnvelope } | { err: VcError }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
      const combined = signal ? (AbortSignal.any ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal) : ctrl.signal;
      const r = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': UA },
        signal: combined,
      });
      clearTimeout(timer);
      if (r.ok) {
        const body = (await r.json()) as VcEnvelope;
        return { ok: body };
      }
      if (r.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r2) => setTimeout(r2, 1000 * attempt));
        continue;
      }
      return { err: { status: r.status } };
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r2) => setTimeout(r2, 1000 * attempt));
        continue;
      }
      return { err: { network: true } };
    }
  }
  return { err: { network: true } };
}

export interface VcIpIntel {
  found: boolean;
  ip: string;
  country?: string;
  asn?: string;
  hostnames: string[];
  /** Detection tags such as `c2`, `initial-access`, `honeypot`. */
  tags: string[];
  cves: string[];
  detections: number;
}

export interface VcErrorInfo {
  code: 'upstream_5xx' | 'upstream_4xx' | 'network_error';
  status?: number;
}

/** IP intelligence from the ipintel-3d index (C2 / initial-access / honeypot, ASN, country, CVEs). */
export async function vulncheckIp(
  token: string,
  ip: string,
  signal?: AbortSignal
): Promise<{ ok: VcIpIntel } | { err: VcErrorInfo }> {
  if (!token) return { err: { code: 'upstream_4xx', status: 401 } };
  const res = await vcGet(`/index/ipintel-3d?ip=${encodeURIComponent(ip)}`, token, signal);
  if ('err' in res) {
    const code =
      'network' in res.err
        ? ('network_error' as const)
        : res.err.status >= 500
          ? ('upstream_5xx' as const)
          : ('upstream_4xx' as const);
    return { err: { code, status: 'network' in res.err ? undefined : res.err.status } };
  }
  const data = res.ok.data ?? [];
  const tags = new Set<string>();
  const hostnames = new Set<string>();
  const cves = new Set<string>();
  let country: string | undefined;
  let asn: string | undefined;
  for (const d of data) {
    const det = str(d.detection) ?? str(d.type) ?? str(d.feed_id);
    if (det) tags.add(det);
    for (const m of arr(d.matches)) {
      const t = str(m) ?? str((m as Record<string, unknown>)?.type);
      if (t) tags.add(t);
    }
    const h = str(d.hostname);
    if (h) hostnames.add(h);
    country = country ?? str(d.country) ?? str(d.country_code);
    asn = asn ?? str(d.asn);
    for (const c of arr(d.cves ?? d.cve)) {
      const cc = str(c);
      if (cc) cves.add(cc);
    }
  }
  return {
    ok: {
      found: data.length > 0,
      ip,
      country,
      asn,
      hostnames: [...hostnames].slice(0, 10),
      tags: [...tags].slice(0, 10),
      cves: [...cves].slice(0, 20),
      detections: res.ok._meta?.total_documents ?? data.length,
    },
  };
}

export interface VcCveIntel {
  cve: string;
  /** True when VulnCheck has real-world initial-access / exploitation intel. */
  exploited: boolean;
  records: number;
  /** Reported exploitation sources / threat actors, when present. */
  reported: string[];
}

/** CVE exploitation intel from the initial-access index (real-world exploitation signal). */
export async function vulncheckCve(
  token: string,
  cve: string,
  signal?: AbortSignal
): Promise<{ ok: VcCveIntel } | { err: VcErrorInfo }> {
  if (!token) return { err: { code: 'upstream_4xx', status: 401 } };
  const res = await vcGet(`/index/initial-access?cve=${encodeURIComponent(cve)}`, token, signal);
  if ('err' in res) {
    const code =
      'network' in res.err
        ? ('network_error' as const)
        : res.err.status >= 500
          ? ('upstream_5xx' as const)
          : ('upstream_4xx' as const);
    return { err: { code, status: 'network' in res.err ? undefined : res.err.status } };
  }
  const data = res.ok.data ?? [];
  const reported = new Set<string>();
  for (const d of data) {
    const s = str(d.threat_actor) ?? str(d.source) ?? str(d.author) ?? str(d.name);
    if (s) reported.add(s);
    for (const a of arr(d.threat_actors)) {
      const t = str(a) ?? str((a as Record<string, unknown>)?.name);
      if (t) reported.add(t);
    }
  }
  const records = res.ok._meta?.total_documents ?? data.length;
  return { ok: { cve: cve.toUpperCase(), exploited: records > 0, records, reported: [...reported].slice(0, 10) } };
}
