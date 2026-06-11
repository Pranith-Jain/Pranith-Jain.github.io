import type { Env } from '../../env';
import { FEED_SOURCES, UNCAPPED, buildSummary, type IocEntry, type SourceId } from '../ioc-feed-parsers';
import { fetchResilient } from '../fetch-resilient';
import { readLastGood, writeLastGood } from '../lastgood';
import { NVD_UA, NVD_API, KEV_FEED, LASTGOOD_TTL_SEC, nvdHeaders } from './config';
import type { KevDoc, KevEntry, NvdCve, NvdResponse } from './types';

export async function withLastGood<T>(env: Env | undefined, cacheKey: string, live: () => Promise<T>): Promise<T> {
  try {
    const v = await live();
    if (env) await writeLastGood(env, cacheKey, v, { ttlSeconds: LASTGOOD_TTL_SEC });
    return v;
  } catch (err) {
    if (!env) throw err;
    const hit = await readLastGood<T>(env, cacheKey);
    if (hit !== null) return hit;
    throw err;
  }
}

export async function fetchKev(): Promise<KevEntry[]> {
  const res = await fetchResilient(
    KEV_FEED,
    {
      headers: { 'user-agent': NVD_UA, accept: 'application/json' },
      cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
    } as RequestInit,
    { attempts: 3, timeoutMs: 20_000 }
  );
  if (!res.ok) throw new Error(`KEV fetch failed: ${res.status}`);
  const doc = (await res.json()) as KevDoc;
  return doc.vulnerabilities ?? [];
}

export async function fetchNvdRecent(start: Date, end: Date, apiKey?: string): Promise<NvdCve[]> {
  const fmt = (d: Date) => d.toISOString().replace(/Z$/, '+00:00');
  const out: NvdCve[] = [];
  const PAGE = 2000;
  const HARD_CAP = 4000;
  let startIndex = 0;
  let anyPageOk = false;
  for (let i = 0; i < 4 && out.length < HARD_CAP; i++) {
    const url =
      `${NVD_API}?pubStartDate=${encodeURIComponent(fmt(start))}` +
      `&pubEndDate=${encodeURIComponent(fmt(end))}` +
      `&resultsPerPage=${PAGE}&startIndex=${startIndex}`;
    let pageOk = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt + Math.random() * 800));
      try {
        const res = await fetch(url, {
          headers: nvdHeaders(apiKey),
          signal: AbortSignal.timeout(20_000),
          cf: { cacheTtlByStatus: { '200-299': 1800, '400-599': 0 }, cacheEverything: true },
        } as RequestInit);
        if (!res.ok) {
          lastErr = new Error(`NVD ${res.status}`);
          if (res.status !== 429 && res.status < 500) break;
          continue;
        }
        const json = (await res.json()) as NvdResponse & { totalResults?: number };
        const batch = json.vulnerabilities ?? [];
        for (const v of batch) if (v.cve) out.push(v.cve);
        pageOk = true;
        anyPageOk = true;
        if (batch.length < PAGE) return out;
        startIndex += PAGE;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!pageOk) {
      if (!anyPageOk) throw lastErr instanceof Error ? lastErr : new Error('NVD unreachable');
      break;
    }
  }
  return out;
}

export async function fetchCirclRecent(start: Date, end: Date): Promise<NvdCve[]> {
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400_000);
  const limit = Math.min(2000, Math.max(300, days * 220));
  const res = await fetchResilient(
    `https://cve.circl.lu/api/last/${limit}`,
    { headers: { 'user-agent': NVD_UA, accept: 'application/json' } } as RequestInit,
    { attempts: 2, timeoutMs: 15_000 }
  );
  if (!res.ok) throw new Error(`CIRCL last ${res.status}`);
  const items = (await res.json()) as Record<string, unknown>[];
  const out: NvdCve[] = [];
  for (const it of Array.isArray(items) ? items : []) {
    const cveId = resolveCirclCveId(it);
    if (!cveId) continue;
    const pubIso = resolveCirclPublished(it);
    if (!pubIso) continue;
    const pub = new Date(pubIso);
    if (Number.isNaN(pub.getTime()) || pub < start || pub >= end) continue;
    const baseScore = resolveCirclBaseScore(it);
    if (baseScore == null) continue;
    const description = resolveCirclDescription(it);
    const cweIds = resolveCirclCweIds(it);
    out.push({
      id: cveId,
      descriptions: [{ lang: 'en', value: description }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore } }] },
      weaknesses: cweIds.map((c) => ({ description: [{ lang: 'en', value: c }] })),
    });
  }
  return out;
}

export function resolveCirclCveId(it: Record<string, unknown>): string | null {
  const cveMeta = (it.cveMetadata as Record<string, unknown> | undefined) ?? {};
  if (typeof cveMeta.cveId === 'string' && /^CVE-\d{4}-\d+$/.test(cveMeta.cveId)) {
    return cveMeta.cveId;
  }
  const aliases = Array.isArray(it.aliases) ? (it.aliases as unknown[]) : [];
  for (const a of aliases) {
    if (typeof a === 'string' && /^CVE-\d{4}-\d+$/.test(a)) return a;
  }
  if (typeof it.id === 'string' && /^CVE-\d{4}-\d+$/.test(it.id)) return it.id;
  return null;
}

export function resolveCirclPublished(it: Record<string, unknown>): string {
  const cveMeta = (it.cveMetadata as Record<string, unknown> | undefined) ?? {};
  if (typeof cveMeta.datePublished === 'string' && cveMeta.datePublished) {
    return cveMeta.datePublished;
  }
  const cna = ((it.containers as Record<string, unknown> | undefined)?.cna ?? {}) as Record<string, unknown>;
  if (typeof cna.datePublic === 'string' && cna.datePublic) return cna.datePublic;
  const ds = (it.database_specific as Record<string, unknown> | undefined) ?? {};
  if (typeof ds.nvd_published_at === 'string' && ds.nvd_published_at) {
    return ds.nvd_published_at;
  }
  if (typeof it.published === 'string' && it.published) return it.published;
  return '';
}

export function resolveCirclBaseScore(it: Record<string, unknown>): number | undefined {
  const cna = ((it.containers as Record<string, unknown> | undefined)?.cna ?? {}) as Record<string, unknown>;
  for (const m of (cna.metrics as Record<string, unknown>[]) ?? []) {
    const v = (m.cvssV3_1 ?? m.cvssV3_0) as { baseScore?: number; baseSeverity?: string } | undefined;
    if (v?.baseScore != null) return v.baseScore;
  }
  return undefined;
}

function resolveCirclDescription(it: Record<string, unknown>): string {
  const cna = ((it.containers as Record<string, unknown> | undefined)?.cna ?? {}) as Record<string, unknown>;
  const descs = cna.descriptions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(descs)) {
    const en = descs.find((d) => d.lang === 'en' && typeof d.value === 'string');
    if (en) return String(en.value);
    if (descs[0] && typeof descs[0].value === 'string') return String(descs[0].value);
  }
  return typeof it.details === 'string' ? it.details : '';
}

function resolveCirclCweIds(it: Record<string, unknown>): string[] {
  const cna = ((it.containers as Record<string, unknown> | undefined)?.cna ?? {}) as Record<string, unknown>;
  const out = new Set<string>();
  for (const pt of (cna.problemTypes as Array<Record<string, unknown>>) ?? []) {
    for (const d of (pt.descriptions as Array<Record<string, unknown>>) ?? []) {
      if (typeof d.cweId === 'string') out.add(d.cweId);
    }
  }
  const ds = (it.database_specific as Record<string, unknown> | undefined) ?? {};
  for (const c of (ds.cwe_ids as string[] | undefined) ?? []) {
    if (typeof c === 'string') out.add(c);
  }
  return Array.from(out);
}

export async function fetchNvdByIds(cveIds: string[], apiKey?: string): Promise<Map<string, NvdCve>> {
  const out = new Map<string, NvdCve>();
  const ids = cveIds.slice(0, 30);
  for (const id of ids) {
    try {
      const url = `${NVD_API}?cveId=${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: nvdHeaders(apiKey),
        signal: AbortSignal.timeout(8000),
        cf: { cacheTtlByStatus: { '200-299': 86400, '400-599': 0 }, cacheEverything: true },
      } as RequestInit);
      if (!res.ok) continue;
      const json = (await res.json()) as NvdResponse;
      const cve = json.vulnerabilities?.[0]?.cve;
      if (cve) out.set(id, cve);
    } catch {
    }
  }
  return out;
}

async function fetchAbuseFeed(source: SourceId, timeoutMs = 15_000): Promise<IocEntry[]> {
  const meta = FEED_SOURCES[source];
  const sep = meta.url.includes('?') ? '&' : '?';
  const url = `${meta.url}${sep}_briefing=${Date.now()}`;
  const res = await fetch(url, {
    headers: { 'user-agent': NVD_UA },
    signal: AbortSignal.timeout(timeoutMs),
    cf: { cacheEverything: false },
  } as RequestInit);
  if (!res.ok) throw new Error(`${source} feed ${res.status}`);
  const body = await res.text();
  const summary = buildSummary(source, body, UNCAPPED);
  return summary.entries;
}

export async function fetchFeedResilient(env: Env | undefined, source: SourceId): Promise<IocEntry[]> {
  const key = `briefing-feed-${source}`;
  try {
    const entries = await fetchAbuseFeed(source);
    if (entries.length > 0) {
      if (env) await writeLastGood(env, key, entries, { ttlSeconds: LASTGOOD_TTL_SEC });
      return entries;
    }
    if (env) {
      const hit = await readLastGood<IocEntry[]>(env, key);
      if (hit && hit.length > 0) return hit;
    }
    return entries;
  } catch {
    if (env) {
      const hit = await readLastGood<IocEntry[]>(env, key);
      if (hit) return hit;
    }
    return [];
  }
}
