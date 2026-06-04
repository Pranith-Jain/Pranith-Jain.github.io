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

interface VcEnvelope {
  _meta?: { total_documents?: number };
  data?: Array<Record<string, unknown>>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

async function vcGet(path: string, token: string, signal?: AbortSignal): Promise<VcEnvelope | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': UA },
      signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as VcEnvelope;
  } catch {
    return null;
  }
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

/** IP intelligence from the ipintel-3d index (C2 / initial-access / honeypot, ASN, country, CVEs). */
export async function vulncheckIp(token: string, ip: string, signal?: AbortSignal): Promise<VcIpIntel | null> {
  if (!token) return null;
  const res = await vcGet(`/index/ipintel-3d?ip=${encodeURIComponent(ip)}`, token, signal);
  if (!res) return null;
  const data = res.data ?? [];
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
    found: data.length > 0,
    ip,
    country,
    asn,
    hostnames: [...hostnames].slice(0, 10),
    tags: [...tags].slice(0, 10),
    cves: [...cves].slice(0, 20),
    detections: res._meta?.total_documents ?? data.length,
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
export async function vulncheckCve(token: string, cve: string, signal?: AbortSignal): Promise<VcCveIntel | null> {
  if (!token) return null;
  const res = await vcGet(`/index/initial-access?cve=${encodeURIComponent(cve)}`, token, signal);
  if (!res) return null;
  const data = res.data ?? [];
  const reported = new Set<string>();
  for (const d of data) {
    const s = str(d.threat_actor) ?? str(d.source) ?? str(d.author) ?? str(d.name);
    if (s) reported.add(s);
    for (const a of arr(d.threat_actors)) {
      const t = str(a) ?? str((a as Record<string, unknown>)?.name);
      if (t) reported.add(t);
    }
  }
  const records = res._meta?.total_documents ?? data.length;
  return { cve: cve.toUpperCase(), exploited: records > 0, records, reported: [...reported].slice(0, 10) };
}
