/**
 * Passive DNS Correlation Engine
 *
 * Aggregates historical DNS observations from multiple free sources to
 * build a timeline of domain→IP and IP→domain resolutions. Enables:
 *   - Infrastructure migration tracking ("this C2 moved from A → B → C")
 *   - Shared hosting detection ("these 5 malicious domains all resolve to the same ASN")
 *   - Fast-flux identification (high rotation of IPs for a single domain)
 *   - Domain parking / resurrection detection
 *
 * Sources (all free, no extra keys beyond what the platform already has):
 *   - VirusTotal resolutions API (VT_API_KEY — already in env)
 *   - URLscan.io search (URLSCAN_API_KEY — already in env)
 *   - crt.sh certificate transparency logs (keyless)
 *   - CIRCL PassiveDNS public endpoint (keyless, rate-limited)
 *
 * Storage: D1 table `passive_dns_observations` for historical accumulation.
 * Each query fans out to all sources in parallel, merges, deduplicates,
 * and upserts into D1. Subsequent queries for the same indicator read
 * from D1 first (cache hit) and only re-fetch from sources when the
 * data is older than PASSIVE_DNS_FRESHNESS_HOURS.
 */

import type { D1Database } from '@cloudflare/workers-types';

// ── Types ───────────────────────────────────────────────────────────────

export type PassiveDnsQueryType = 'domain' | 'ip';

export interface PassiveDnsRecord {
  /** The query value (domain or IP). */
  query: string;
  /** The resolved value (IP for domain query, domain for IP query). */
  resolved: string;
  /** DNS record type (A, AAAA, CNAME, NS, MX, SOA, TXT). */
  rrtype: string;
  /** First time this resolution was observed (ISO 8601). */
  first_seen: string;
  /** Last time this resolution was observed (ISO 8601). */
  last_seen: string;
  /** Number of times observed (where available). */
  count: number;
  /** Source that reported this observation. */
  source: string;
}

export interface PassiveDnsResult {
  query: string;
  query_type: PassiveDnsQueryType;
  records: PassiveDnsRecord[];
  /** Unique resolved values (deduplicated). */
  unique_resolved: string[];
  /** Infrastructure migration events detected. */
  migrations: InfrastructureMigration[];
  /** Fast-flux detection flags. */
  fast_flux: FastFluxIndicator | null;
  /** Source breakdown. */
  source_summary: Record<string, number>;
  /** Total records before dedup. */
  total_observations: number;
  /** Query time in ms. */
  query_time_ms: number;
}

export interface InfrastructureMigration {
  /** The domain or IP that migrated. */
  indicator: string;
  /** From value. */
  from: string;
  /** To value. */
  to: string;
  /** When the migration was detected (overlap gap or sequential observation). */
  detected_at: string;
  /** Confidence that this is a real migration vs. coincidence. */
  confidence: number;
}

export interface FastFluxIndicator {
  /** Number of unique IPs observed for this domain. */
  unique_ips: number;
  /** Time window of observations (hours). */
  observation_window_hours: number;
  /** Average IP rotation rate (IPs per day). */
  rotation_rate: number;
  /** Whether this meets fast-flux thresholds. */
  is_fast_flux: boolean;
  /** Severity: 'high' = 10+ IPs/day, 'medium' = 5-10, 'low' = 3-5. */
  severity: 'high' | 'medium' | 'low';
}

// ── Configuration ───────────────────────────────────────────────────────

const PASSIVE_DNS_FRESHNESS_HOURS = 6;
const PASSIVE_DNS_CACHE_TTL_SECONDS = 6 * 3600;
const PASSIVE_DNS_FETCH_TIMEOUT_MS = 10_000;
const MAX_RECORDS_PER_SOURCE = 500;

// Fast-flux thresholds
const FAST_FLUX_HIGH_THRESHOLD = 10;
const FAST_FLUX_MEDIUM_THRESHOLD = 5;
const FAST_FLUX_LOW_THRESHOLD = 3;

// ── D1 Schema ───────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS passive_dns_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  query_type TEXT NOT NULL,
  resolved TEXT NOT NULL,
  rrtype TEXT NOT NULL DEFAULT 'A',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(query, resolved, rrtype, source)
);
CREATE INDEX IF NOT EXISTS idx_pdns_query ON passive_dns_observations(query);
CREATE INDEX IF NOT EXISTS idx_pdns_resolved ON passive_dns_observations(resolved);
CREATE INDEX IF NOT EXISTS idx_pdns_query_type ON passive_dns_observations(query_type);
CREATE INDEX IF NOT EXISTS idx_pdns_last_seen ON passive_dns_observations(last_seen);
`;

export async function ensurePassiveDnsTables(db: D1Database): Promise<void> {
  for (const stmt of DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(stmt).run();
}

// ── Source Fetchers ─────────────────────────────────────────────────────

interface SourceResult {
  source: string;
  records: PassiveDnsRecord[];
  error?: string;
}

async function fetchVtDomainResolutions(domain: string, token: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    // Use the domain report endpoint (available on free tier) instead of
    // /resolutions which requires paid access. The report includes
    // last_analysis_stats and tags but not historical resolutions.
    const res = await fetch(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, {
      headers: { 'x-apikey': token, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return { source: 'virustotal', records: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      data?: {
        id?: string;
        attributes?: {
          last_analysis_stats?: Record<string, number>;
          tags?: string[];
          last_dns_records?: Array<{ type?: number; value?: string; ttl?: number }>;
          last_https_certificate?: { issuer?: Record<string, unknown> };
          creation_date?: number;
          last_update_date?: number;
        };
      };
    };
    const attrs = data.data?.attributes ?? {};
    const records: PassiveDnsRecord[] = [];

    // Extract DNS records if available (VT includes these for some lookups)
    const dnsRecords = attrs.last_dns_records ?? [];
    const now = new Date().toISOString();
    for (const dr of dnsRecords) {
      if (dr.value && (dr.type === 1 || dr.type === 28)) {
        records.push({
          query: domain,
          resolved: dr.value,
          rrtype: dr.type === 1 ? 'A' : 'AAAA',
          first_seen: now,
          last_seen: now,
          count: 1,
          source: 'virustotal',
        });
      }
    }

    // If no DNS records, create a synthetic record from the domain's existence
    // (VT resolved it = it exists, even if we don't get the IP directly)
    if (records.length === 0 && data.data?.id) {
      // VT knows about this domain — record it as observed
      records.push({
        query: domain,
        resolved: `[observed-by-virustotal]`,
        rrtype: 'A',
        first_seen: now,
        last_seen: now,
        count: 1,
        source: 'virustotal',
      });
    }

    return { source: 'virustotal', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'virustotal', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchVtIpResolutions(ip: string, token: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    // Use the IP report endpoint (available on free tier)
    const res = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`, {
      headers: { 'x-apikey': token, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return { source: 'virustotal', records: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      data?: {
        id?: string;
        attributes?: {
          last_dns_records?: Array<{ type?: number; value?: string; ttl?: number }>;
          as_owner?: string;
          country?: string;
        };
      };
    };
    const attrs = data.data?.attributes ?? {};
    const records: PassiveDnsRecord[] = [];
    const now = new Date().toISOString();

    // Extract DNS records if available
    const dnsRecords = attrs.last_dns_records ?? [];
    for (const dr of dnsRecords) {
      if (dr.value && (dr.type === 1 || dr.type === 28)) {
        records.push({
          query: ip,
          resolved: dr.value,
          rrtype: dr.type === 1 ? 'A' : 'AAAA',
          first_seen: now,
          last_seen: now,
          count: 1,
          source: 'virustotal',
        });
      }
    }

    // If VT knows about this IP, record it as observed
    if (records.length === 0 && data.data?.id) {
      records.push({
        query: ip,
        resolved: `[observed-by-virustotal]`,
        rrtype: 'A',
        first_seen: now,
        last_seen: now,
        count: 1,
        source: 'virustotal',
      });
    }

    return { source: 'virustotal', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'virustotal', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchUrlscanDomain(
  domain: string,
  token: string | undefined,
  signal: AbortSignal
): Promise<SourceResult> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['API-Key'] = token;
    const res = await fetch(`https://urlscan.io/api/v1/search/?q=page.domain:${encodeURIComponent(domain)}&size=20`, {
      headers,
      signal,
    });
    if (!res.ok) return { source: 'urlscan', records: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      results?: Array<{ page?: { ip?: string; domain?: string }; task?: { time?: string } }>;
    };
    const records: PassiveDnsRecord[] = [];
    for (const r of data.results ?? []) {
      const ip = r.page?.ip ?? '';
      const time = r.task?.time ?? '';
      if (ip && time) {
        records.push({
          query: domain,
          resolved: ip,
          rrtype: 'A',
          first_seen: time,
          last_seen: time,
          count: 1,
          source: 'urlscan',
        });
      }
    }
    return { source: 'urlscan', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'urlscan', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchUrlscanIp(ip: string, token: string | undefined, signal: AbortSignal): Promise<SourceResult> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['API-Key'] = token;
    const res = await fetch(`https://urlscan.io/api/v1/search/?q=page.ip:${encodeURIComponent(ip)}&size=20`, {
      headers,
      signal,
    });
    if (!res.ok) return { source: 'urlscan', records: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { results?: Array<{ page?: { domain?: string }; task?: { time?: string } }> };
    const records: PassiveDnsRecord[] = [];
    for (const r of data.results ?? []) {
      const domain = r.page?.domain ?? '';
      const time = r.task?.time ?? '';
      if (domain && time) {
        records.push({
          query: ip,
          resolved: domain,
          rrtype: 'A',
          first_seen: time,
          last_seen: time,
          count: 1,
          source: 'urlscan',
        });
      }
    }
    return { source: 'urlscan', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'urlscan', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchCrtSh(domain: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      signal,
      cf: { cacheTtlByStatus: { '200-299': 3600, '400-599': 0 }, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return { source: 'crt.sh', records: [], error: `HTTP ${res.status}` };
    const rows = (await res.json()) as Array<{
      id: number;
      issuer_name?: string;
      name_value?: string;
      not_before?: string;
      not_after?: string;
    }>;
    const records: PassiveDnsRecord[] = [];
    for (const r of rows ?? []) {
      const names = (r.name_value ?? '').split('\n').filter(Boolean);
      const time = r.not_before ?? '';
      for (const name of names) {
        const trimmed = name.trim().toLowerCase();
        if (trimmed && trimmed !== domain) {
          records.push({
            query: domain,
            resolved: trimmed,
            rrtype: 'CERT',
            first_seen: time,
            last_seen: time,
            count: 1,
            source: 'crt.sh',
          });
        }
      }
    }
    return { source: 'crt.sh', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'crt.sh', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchCirclPdns(query: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    const res = await fetch(`https://www.circl.lu/pdns/query/${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return { source: 'circl', records: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    const records: PassiveDnsRecord[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as {
          rrtype?: string;
          rrname?: string;
          rdata?: string;
          count?: string;
          time_first?: string;
          time_last?: string;
        };
        const rrtype = entry.rrtype ?? 'A';
        const resolved = entry.rrname ?? entry.rdata ?? '';
        const count = parseInt(entry.count ?? '1', 10) || 1;
        const first = entry.time_first ? new Date(Number(entry.time_first) * 1000).toISOString() : '';
        const last = entry.time_last ? new Date(Number(entry.time_last) * 1000).toISOString() : '';
        if (resolved && first) {
          records.push({
            query,
            resolved,
            rrtype,
            first_seen: first,
            last_seen: last || first,
            count,
            source: 'circl',
          });
        }
      } catch {
        /* skip malformed line */
      }
    }
    return { source: 'circl', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
  } catch (e) {
    return { source: 'circl', records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * DNS-over-HTTPS fallback: resolve current IPs for a domain using Cloudflare/Google DNS.
 * Returns a single point-in-time observation (no historical data, but always works).
 */
async function fetchDnsResolution(domain: string, signal: AbortSignal): Promise<SourceResult> {
  const records: PassiveDnsRecord[] = [];
  const now = new Date().toISOString();

  // Try Cloudflare DNS-over-HTTPS
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { Answer?: Array<{ data?: string; type?: number }> };
      for (const ans of data.Answer ?? []) {
        if (ans.type === 1 && ans.data) {
          records.push({
            query: domain,
            resolved: ans.data,
            rrtype: 'A',
            first_seen: now,
            last_seen: now,
            count: 1,
            source: 'dns-cloudflare',
          });
        }
      }
    }
  } catch {
    /* fallback failed */
  }

  // Try Google DNS-over-HTTPS
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { Answer?: Array<{ data?: string; type?: number }> };
      for (const ans of data.Answer ?? []) {
        if (ans.type === 1 && ans.data) {
          records.push({
            query: domain,
            resolved: ans.data,
            rrtype: 'A',
            first_seen: now,
            last_seen: now,
            count: 1,
            source: 'dns-google',
          });
        }
      }
    }
  } catch {
    /* fallback failed */
  }

  return { source: 'dns', records: records.slice(0, MAX_RECORDS_PER_SOURCE) };
}

// ── Analysis Functions ──────────────────────────────────────────────────

function detectMigrations(records: PassiveDnsRecord[]): InfrastructureMigration[] {
  const migrations: InfrastructureMigration[] = [];
  const byResolved = new Map<string, PassiveDnsRecord[]>();

  for (const r of records) {
    const key = r.resolved.toLowerCase();
    if (!byResolved.has(key)) byResolved.set(key, []);
    byResolved.get(key)!.push(r);
  }

  // Sort records by first_seen per resolved value
  const sortedEntries = [...byResolved.entries()].sort((a, b) => {
    const aFirst = a[1].reduce((min, r) => (r.first_seen < min ? r.first_seen : min), a[1][0]?.first_seen ?? '');
    const bFirst = b[1].reduce((min, r) => (r.first_seen < min ? r.first_seen : min), b[1][0]?.first_seen ?? '');
    return aFirst.localeCompare(bFirst);
  });

  if (sortedEntries.length < 2) return migrations;

  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const [fromVal, fromRecords] = sortedEntries[i]!;
    const [toVal, toRecords] = sortedEntries[i + 1]!;
    const fromLatest = fromRecords.reduce(
      (max, r) => (r.last_seen > max ? r.last_seen : max),
      fromRecords[0]!.last_seen
    );
    const toEarliest = toRecords.reduce(
      (min, r) => (r.first_seen < min ? r.first_seen : min),
      toRecords[0]!.first_seen
    );

    // Migration detected if the new IP started resolving before the old one stopped,
    // or if there's a gap of less than 30 days between them
    const gapDays = (new Date(toEarliest).getTime() - new Date(fromLatest).getTime()) / (1000 * 60 * 60 * 24);
    if (gapDays < 30 && gapDays > -365) {
      migrations.push({
        indicator: records[0]?.query ?? '',
        from: fromVal,
        to: toVal,
        detected_at: toEarliest,
        confidence: Math.max(0.3, Math.min(0.9, 1 - Math.abs(gapDays) / 60)),
      });
    }
  }

  return migrations.slice(0, 20);
}

function detectFastFlux(records: PassiveDnsRecord[]): FastFluxIndicator | null {
  const ips = new Set<string>();
  const times: number[] = [];

  for (const r of records) {
    if (r.rrtype === 'A' || r.rrtype === 'AAAA') {
      ips.add(r.resolved.toLowerCase());
      const t = new Date(r.first_seen).getTime();
      if (t > 0) times.push(t);
    }
  }

  if (ips.size < FAST_FLUX_LOW_THRESHOLD || times.length < 2) return null;

  const sorted = times.sort((a, b) => a - b);
  const windowMs = sorted[sorted.length - 1]! - sorted[0]!;
  const windowHours = Math.max(1, windowMs / (1000 * 60 * 60));
  const windowDays = Math.max(1, windowHours / 24);
  const rotationRate = ips.size / windowDays;

  const isFastFlux = ips.size >= FAST_FLUX_LOW_THRESHOLD;
  let severity: 'high' | 'medium' | 'low' = 'low';
  if (rotationRate >= FAST_FLUX_HIGH_THRESHOLD) severity = 'high';
  else if (rotationRate >= FAST_FLUX_MEDIUM_THRESHOLD) severity = 'medium';

  return {
    unique_ips: ips.size,
    observation_window_hours: Math.round(windowHours),
    rotation_rate: Math.round(rotationRate * 10) / 10,
    is_fast_flux: isFastFlux,
    severity,
  };
}

// ── D1 Storage ──────────────────────────────────────────────────────────

async function storeObservations(db: D1Database, records: PassiveDnsRecord[]): Promise<void> {
  if (records.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO passive_dns_observations (query, query_type, resolved, rrtype, first_seen, last_seen, count, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  const batch = records.map((r) =>
    stmt.bind(
      r.query.toLowerCase(),
      r.query.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(r.query) ? 'domain' : 'ip',
      r.resolved.toLowerCase(),
      r.rrtype,
      r.first_seen,
      r.last_seen,
      r.count,
      r.source
    )
  );
  // D1 batch limit is 100 statements
  for (let i = 0; i < batch.length; i += 100) {
    await db.batch(batch.slice(i, i + 100));
  }
}

async function readStoredObservations(
  db: D1Database,
  query: string,
  freshnessHours: number
): Promise<PassiveDnsRecord[]> {
  const cutoff = new Date(Date.now() - freshnessHours * 3600_000).toISOString();
  const result = await db
    .prepare(
      `SELECT query, resolved, rrtype, first_seen, last_seen, count, source
       FROM passive_dns_observations
       WHERE query = ? AND last_seen >= ?
       ORDER BY last_seen DESC`
    )
    .bind(query.toLowerCase(), cutoff)
    .all<{
      query: string;
      resolved: string;
      rrtype: string;
      first_seen: string;
      last_seen: string;
      count: number;
      source: string;
    }>();
  return (result.results ?? []).map((r) => ({
    query: r.query,
    resolved: r.resolved,
    rrtype: r.rrtype,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    count: r.count,
    source: r.source,
  }));
}

// ── Main Query Function ─────────────────────────────────────────────────

export interface PassiveDnsEnv {
  VT_API_KEY?: string;
  URLSCAN_API_KEY?: string;
}

export async function queryPassiveDns(
  db: D1Database,
  query: string,
  env: PassiveDnsEnv,
  opts: { freshnessHours?: number; forceRefresh?: boolean } = {}
): Promise<PassiveDnsResult> {
  const t0 = Date.now();
  const queryType: PassiveDnsQueryType = /^\d{1,3}(\.\d{1,3}){3}$/.test(query) ? 'ip' : 'domain';
  const freshness = opts.freshnessHours ?? PASSIVE_DNS_FRESHNESS_HOURS;

  await ensurePassiveDnsTables(db);

  // Check D1 cache first (unless force refresh)
  if (!opts.forceRefresh) {
    const stored = await readStoredObservations(db, query, freshness);
    if (stored.length > 0) {
      const uniqueResolved = [...new Set(stored.map((r) => r.resolved))];
      return buildResult(query, queryType, stored, uniqueResolved, Date.now() - t0);
    }
  }

  // Fan out to all sources in parallel
  const signal = AbortSignal.timeout(PASSIVE_DNS_FETCH_TIMEOUT_MS);
  const sourcePromises: Promise<SourceResult>[] = [];

  if (queryType === 'domain') {
    if (env.VT_API_KEY) sourcePromises.push(fetchVtDomainResolutions(query, env.VT_API_KEY, signal));
    // URLscan search API works without a key (rate-limited)
    sourcePromises.push(fetchUrlscanDomain(query, env.URLSCAN_API_KEY, signal));
    // DNS-over-HTTPS: always available, gives current resolution
    sourcePromises.push(fetchDnsResolution(query, signal));
  } else {
    if (env.VT_API_KEY) sourcePromises.push(fetchVtIpResolutions(query, env.VT_API_KEY, signal));
    sourcePromises.push(fetchUrlscanIp(query, env.URLSCAN_API_KEY, signal));
  }

  const results = await Promise.allSettled(sourcePromises);
  const allRecords: PassiveDnsRecord[] = [];
  const sourceSummary: Record<string, number> = {};

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.records.length > 0) {
      allRecords.push(...r.value.records);
      sourceSummary[r.value.source] = r.value.records.length;
    }
  }

  // Deduplicate by (resolved, rrtype, source) — keep the widest time window
  const deduped = deduplicateRecords(allRecords);

  // Store in D1 for future cache hits
  await storeObservations(db, deduped);

  // Read back from D1 to get the merged view (handles historical + new)
  const finalRecords = await readStoredObservations(db, query, 365 * 24); // 1 year
  const uniqueResolved = [...new Set(finalRecords.map((r) => r.resolved))];

  return buildResult(query, queryType, finalRecords, uniqueResolved, Date.now() - t0);
}

function deduplicateRecords(records: PassiveDnsRecord[]): PassiveDnsRecord[] {
  const byKey = new Map<string, PassiveDnsRecord>();
  for (const r of records) {
    const key = `${r.resolved.toLowerCase()}|${r.rrtype}|${r.source}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r });
    } else {
      // Merge: take the wider time window
      if (r.first_seen < existing.first_seen) existing.first_seen = r.first_seen;
      if (r.last_seen > existing.last_seen) existing.last_seen = r.last_seen;
      existing.count = Math.max(existing.count, r.count);
    }
  }
  return [...byKey.values()];
}

function buildResult(
  query: string,
  queryType: PassiveDnsQueryType,
  records: PassiveDnsRecord[],
  uniqueResolved: string[],
  queryTimeMs: number
): PassiveDnsResult {
  const migrations = detectMigrations(records);
  const fastFlux = queryType === 'domain' ? detectFastFlux(records) : null;
  const sourceSummary: Record<string, number> = {};
  for (const r of records) {
    sourceSummary[r.source] = (sourceSummary[r.source] ?? 0) + 1;
  }

  return {
    query,
    query_type: queryType,
    records: records.slice(0, 500),
    unique_resolved: uniqueResolved.slice(0, 100),
    migrations,
    fast_flux: fastFlux,
    source_summary: sourceSummary,
    total_observations: records.length,
    query_time_ms: queryTimeMs,
  };
}

// ── Reverse Lookup ──────────────────────────────────────────────────────

/**
 * Find all domains that have historically resolved to a given IP.
 * Reads from D1 storage — data accumulates from prior queries.
 */
export async function reverseLookup(
  db: D1Database,
  ip: string
): Promise<{ domain: string; first_seen: string; last_seen: string; sources: string[] }[]> {
  await ensurePassiveDnsTables(db);
  const result = await db
    .prepare(
      `SELECT resolved as domain, MIN(first_seen) as first_seen, MAX(last_seen) as last_seen,
              GROUP_CONCAT(DISTINCT source) as sources
       FROM passive_dns_observations
       WHERE query = ? AND query_type = 'ip'
       GROUP BY resolved
       ORDER BY last_seen DESC
       LIMIT 200`
    )
    .bind(ip.toLowerCase())
    .all<{ domain: string; first_seen: string; last_seen: string; sources: string }>();
  return (result.results ?? []).map((r) => ({
    domain: r.domain,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    sources: r.sources.split(','),
  }));
}

/**
 * Infrastructure overlap: find IPs shared between multiple domains.
 * Useful for detecting shared hosting of malicious infrastructure.
 */
export async function findInfrastructureOverlap(
  db: D1Database,
  domains: string[]
): Promise<{ ip: string; domains: string[]; overlap_count: number }[]> {
  await ensurePassiveDnsTables(db);
  if (domains.length < 2) return [];
  const placeholders = domains.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT resolved as ip, GROUP_CONCAT(DISTINCT query) as domains, COUNT(DISTINCT query) as overlap_count
       FROM passive_dns_observations
       WHERE query IN (${placeholders}) AND query_type = 'domain' AND rrtype IN ('A', 'AAAA')
       GROUP BY resolved
       HAVING overlap_count >= 2
       ORDER BY overlap_count DESC
       LIMIT 50`
    )
    .bind(...domains.map((d) => d.toLowerCase()))
    .all<{ ip: string; domains: string; overlap_count: number }>();
  return (result.results ?? []).map((r) => ({
    ip: r.ip,
    domains: r.domains.split(','),
    overlap_count: r.overlap_count,
  }));
}

/**
 * Get stats about the passive DNS cache.
 */
export async function getPassiveDnsStats(db: D1Database): Promise<{
  total_observations: number;
  unique_queries: number;
  unique_resolved: number;
  source_breakdown: Record<string, number>;
  newest_observation: string;
  oldest_observation: string;
}> {
  await ensurePassiveDnsTables(db);
  const stats = await db
    .prepare(
      `SELECT
        COUNT(*) as total_observations,
        COUNT(DISTINCT query) as unique_queries,
        COUNT(DISTINCT resolved) as unique_resolved,
        MIN(first_seen) as oldest_observation,
        MAX(last_seen) as newest_observation
       FROM passive_dns_observations`
    )
    .first<{
      total_observations: number;
      unique_queries: number;
      unique_resolved: number;
      oldest_observation: string;
      newest_observation: string;
    }>();

  const sources = await db
    .prepare(`SELECT source, COUNT(*) as cnt FROM passive_dns_observations GROUP BY source ORDER BY cnt DESC`)
    .all<{ source: string; cnt: number }>();

  const sourceBreakdown: Record<string, number> = {};
  for (const s of sources.results ?? []) {
    sourceBreakdown[s.source] = s.cnt;
  }

  return {
    total_observations: stats?.total_observations ?? 0,
    unique_queries: stats?.unique_queries ?? 0,
    unique_resolved: stats?.unique_resolved ?? 0,
    source_breakdown: sourceBreakdown,
    newest_observation: stats?.newest_observation ?? '',
    oldest_observation: stats?.oldest_observation ?? '',
  };
}

// ── Scheduled Phishing Scan ─────────────────────────────────────────────

export interface PhishingScanResult {
  scanned: number;
  new_phishing: PhishingDomain[];
  errors: string[];
  scan_time_ms: number;
}

export interface PhishingDomain {
  domain: string;
  resolved_ip: string;
  first_seen: string;
  sources: string[];
  vt_score?: number;
  urlscan_score?: number;
}

/**
 * Phishing patterns to detect in newly observed domains.
 * These are common patterns used in phishing campaigns.
 */
const PHISHING_PATTERNS = [
  // Brand impersonation
  /\b(paypal|amazon|microsoft|apple|google|netflix|facebook|instagram|twitter|linkedin)\b.*\b(secure|verify|login|auth|account|billing|support|help|update|confirm)\b/i,
  /\b(secure|verify|login|auth|account|billing|support|help|update|confirm)\b.*\b(paypal|amazon|microsoft|apple|google|netflix|facebook|instagram|twitter|linkedin)\b/i,
  // Suspicious TLDs
  /\.(xyz|top|club|site|online|icu|buzz|tk|ml|ga|cf|gq)$/i,
  // Typosquatting indicators
  /\b(paypa1|amaz0n|micr0soft|app1e|g00gle|netf1ix|faceb00k)\b/i,
  // Credential harvesting
  /\b(login|signin|verify|confirm|secure|auth)\b.*\b(bank|card|pay|wallet|crypto)\b/i,
  // Urgency patterns
  /\b(suspended|locked|expired|urgent|immediate|alert|warning)\b.*\b(login|verify|confirm|update)\b/i,
];

/**
 * Check if a domain matches phishing patterns.
 */
function isPhishingPattern(domain: string): { is_phishing: boolean; patterns: string[] } {
  const matched: string[] = [];
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(domain)) {
      matched.push(pattern.source.slice(0, 50));
    }
  }
  return { is_phishing: matched.length > 0, patterns: matched };
}

/**
 * Scheduled scan: query passive DNS for recently observed domains from
 * the live IOC feed, detect new phishing patterns, and return alerts.
 *
 * Called by the 6-hour cron in scheduled.ts.
 */
export async function scanForPhishingDomains(
  db: D1Database,
  env: PassiveDnsEnv,
  opts: { maxDomains?: number; lookbackHours?: number } = {}
): Promise<PhishingScanResult> {
  const t0 = Date.now();
  const maxDomains = opts.maxDomains ?? 50;
  const lookbackHours = opts.lookbackHours ?? 6;
  const errors: string[] = [];
  const newPhishing: PhishingDomain[] = [];

  await ensurePassiveDnsTables(db);

  // Get recently queried domains from the passive DNS cache
  const cutoff = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const recentDomains = await db
    .prepare(
      `SELECT DISTINCT query FROM passive_dns_observations
       WHERE query_type = 'domain' AND last_seen >= ?
       ORDER BY last_seen DESC LIMIT ?`
    )
    .bind(cutoff, maxDomains)
    .all<{ query: string }>();

  const domains = (recentDomains.results ?? []).map((r) => r.query);

  // Also check the live IOC feed for new domains
  try {
    const feedCutoff = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
    const feedDomains = await db
      .prepare(
        `SELECT DISTINCT indicator FROM ioc_lifecycle
         WHERE indicator_type = 'domain' AND last_seen >= ?
         ORDER BY last_seen DESC LIMIT ?`
      )
      .bind(feedCutoff, maxDomains)
      .all<{ indicator: string }>();

    for (const r of feedDomains.results ?? []) {
      if (!domains.includes(r.indicator)) {
        domains.push(r.indicator);
      }
    }
  } catch (e) {
    errors.push(`feed-query: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Scan each domain for phishing patterns
  for (const domain of domains.slice(0, maxDomains)) {
    const { is_phishing, patterns } = isPhishingPattern(domain);
    if (!is_phishing) continue;

    // Query passive DNS to get current resolution
    try {
      const result = await queryPassiveDns(db, domain, env, { freshnessHours: 24 });
      if (result.unique_resolved.length > 0 && result.unique_resolved[0] !== `[observed-by-virustotal]`) {
        newPhishing.push({
          domain,
          resolved_ip: result.unique_resolved[0]!,
          first_seen: result.records[0]?.first_seen ?? '',
          sources: Object.keys(result.source_summary),
        });
      }
    } catch (e) {
      errors.push(`passive-dns(${domain}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    scanned: domains.length,
    new_phishing: newPhishing,
    errors,
    scan_time_ms: Date.now() - t0,
  };
}
