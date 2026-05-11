import type { Context } from 'hono';
import type { Env } from '../env';
import { SNAPSHOT_CACHE_KEY } from './snapshot';
import { CVE_RECENT_CACHE_KEY } from './cve-recent';
import { MALWARE_SAMPLES_CACHE_KEY } from './malware-samples';
import { PHISHING_URLS_CACHE_KEY } from './phishing-urls';
import { REDDIT_FEED_CACHE_KEY } from './reddit-feed';
import { X_FEED_CACHE_KEY } from './x-feed';
import { TELEGRAM_FEED_CACHE_KEY } from './telegram-feed';
import { RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { ONION_WATCH_CACHE_KEY } from './onion-watch';
import { THREAT_MAP_CACHE_KEY } from './threat-map';
import { DETECTION_RULES_CACHE_KEY } from './detection-rules';

/**
 * Feed-status dashboard. Reads every per-feed edge-cache entry directly
 * (cache.match) so we get exactly the body a real user request would see.
 *
 * We CAN'T fetch /api/v1/<feed> from inside the worker — Cloudflare blocks
 * same-zone subrequests with HTTP 522. So the original "probe over HTTP"
 * design failed, and we now read the Cache API entries each feed handler
 * writes. When a cache entry doesn't exist we report status='cold' — the
 * feed isn't broken per se, just hasn't been hit yet (or its cache TTL
 * lapsed and no one re-requested).
 */

const CACHE_TTL = 5 * 60;
const FEED_STATUS_CACHE_KEY = 'https://feed-status-cache.internal/v2-cachereads';

type Status = 'ok' | 'degraded' | 'down' | 'cold';

interface FeedStatusRow {
  id: string;
  label: string;
  page_path: string;
  api_path: string;
  status: Status;
  reason: string;
  metrics?: Record<string, number>;
  upstream_age_s?: number;
}

export interface FeedStatusResponse {
  generated_at: string;
  rows: FeedStatusRow[];
  overall: Status;
}

interface FeedProbeSpec {
  id: string;
  label: string;
  page_path: string;
  api_path: string;
  cache_key: string;
  evaluate: (body: unknown) => { status: Status; reason: string; metrics?: Record<string, number>; ageS?: number };
}

function ageSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

function intField(obj: unknown, key: string): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

function strField(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

function arrField(obj: unknown, key: string): unknown[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : undefined;
}

const PROBES: FeedProbeSpec[] = [
  {
    id: 'snapshot',
    label: 'Snapshot (composite)',
    page_path: '/threatintel',
    api_path: '/api/v1/snapshot',
    cache_key: SNAPSHOT_CACHE_KEY,
    evaluate: (body) => {
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const sources = ['ransomware', 'telegram', 'onion', 'threat_map', 'rules', 'briefings'];
      const okCount = sources.filter((k) => {
        const v = (body as Record<string, unknown>)[k];
        return v && typeof v === 'object' && (v as { ok?: boolean }).ok === true;
      }).length;
      const status: Status = okCount >= 5 ? 'ok' : okCount >= 2 ? 'degraded' : 'down';
      return {
        status,
        reason: `${okCount} / ${sources.length} composer sources reporting ok`,
        metrics: { sources_ok: okCount, sources_total: sources.length },
        ageS,
      };
    },
  },
  {
    id: 'cve-recent',
    label: 'CVE — NVD + CISA KEV',
    page_path: '/threatintel/cve-list',
    api_path: '/api/v1/cve-recent',
    cache_key: CVE_RECENT_CACHE_KEY,
    evaluate: (body) => {
      const count = intField(body, 'count') ?? 0;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const sources = arrField(body, 'sources') ?? [];
      const nvd = sources.find((s) => (s as { id?: string }).id === 'nvd-published-14d');
      const kev = sources.find((s) => (s as { id?: string }).id === 'cisa-kev-added-30d');
      const nvdCount = (nvd as { count?: number })?.count ?? 0;
      const kevCount = (kev as { count?: number })?.count ?? 0;
      const status: Status = nvdCount > 0 && kevCount > 0 ? 'ok' : count > 0 ? 'degraded' : 'down';
      return {
        status,
        reason:
          nvdCount > 0 && kevCount > 0
            ? `NVD ${nvdCount} + KEV ${kevCount} entries`
            : nvdCount === 0
              ? 'NVD rate-limited — serving KEV only'
              : 'KEV unreachable — serving NVD only',
        metrics: { count, nvd: nvdCount, kev: kevCount },
        ageS,
      };
    },
  },
  {
    id: 'malware-samples',
    label: 'Malware samples (MalwareBazaar)',
    page_path: '/threatintel/malware-samples',
    api_path: '/api/v1/malware-samples',
    cache_key: MALWARE_SAMPLES_CACHE_KEY,
    evaluate: (body) => {
      const count = intField(body, 'count') ?? 0;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = count >= 20 ? 'ok' : count > 0 ? 'degraded' : 'down';
      return {
        status,
        reason: count > 0 ? `${count} samples from MalwareBazaar recent CSV` : 'MalwareBazaar upstream unreachable',
        metrics: { count },
        ageS,
      };
    },
  },
  {
    id: 'phishing-urls',
    label: 'Phishing URLs (PhishTank + OpenPhish)',
    page_path: '/threatintel/phishing-urls',
    api_path: '/api/v1/phishing-urls',
    cache_key: PHISHING_URLS_CACHE_KEY,
    evaluate: (body) => {
      const total = intField(body, 'total') ?? 0;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const sources = arrField(body, 'sources') ?? [];
      const okSrc = sources.filter((s) => (s as { ok?: boolean }).ok === true).length;
      const status: Status = okSrc >= 2 ? 'ok' : okSrc === 1 ? 'degraded' : 'down';
      return {
        status,
        reason: `${okSrc} / ${sources.length} sources reachable · ${total} URLs`,
        metrics: { total, sources_ok: okSrc },
        ageS,
      };
    },
  },
  {
    id: 'reddit-feed',
    label: 'Reddit firehose',
    page_path: '/threatintel/reddit',
    api_path: '/api/v1/reddit-feed',
    cache_key: REDDIT_FEED_CACHE_KEY,
    evaluate: (body) => {
      const items = (arrField(body, 'items') ?? []).length;
      const subs = arrField(body, 'subs') ?? [];
      const ok = subs.filter((s) => (s as { ok?: boolean }).ok === true).length;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = ok >= subs.length * 0.7 ? 'ok' : ok >= 2 ? 'degraded' : 'down';
      return {
        status,
        reason: `${ok} / ${subs.length} subreddits returning · ${items} posts`,
        metrics: { items, subs_ok: ok, subs_total: subs.length },
        ageS,
      };
    },
  },
  {
    id: 'x-feed',
    label: 'Social firehose (Bluesky + Mastodon)',
    page_path: '/threatintel/x',
    api_path: '/api/v1/x-feed',
    cache_key: X_FEED_CACHE_KEY,
    evaluate: (body) => {
      const items = (arrField(body, 'items') ?? []).length;
      const handles = arrField(body, 'handles') ?? [];
      const ok = handles.filter((h) => (h as { ok?: boolean }).ok === true).length;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = ok >= handles.length * 0.6 ? 'ok' : ok >= 2 ? 'degraded' : 'down';
      return {
        status,
        reason: `${ok} / ${handles.length} accounts returning · ${items} posts`,
        metrics: { items, handles_ok: ok, handles_total: handles.length },
        ageS,
      };
    },
  },
  {
    id: 'telegram-feed',
    label: 'Telegram firehose',
    page_path: '/threatintel/cybersec',
    api_path: '/api/v1/telegram-feed',
    cache_key: TELEGRAM_FEED_CACHE_KEY,
    evaluate: (body) => {
      const items = (arrField(body, 'items') ?? []).length;
      const channels = arrField(body, 'channels') ?? [];
      const ok = channels.filter((c) => (c as { ok?: boolean }).ok === true).length;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = ok >= channels.length * 0.7 ? 'ok' : ok >= 2 ? 'degraded' : 'down';
      return {
        status,
        reason: `${ok} / ${channels.length} channels returning · ${items} messages`,
        metrics: { items, channels_ok: ok, channels_total: channels.length },
        ageS,
      };
    },
  },
  {
    id: 'ransomware-recent',
    label: 'Ransomware activity (Ransomlook)',
    page_path: '/threatintel/ransomware-activity',
    api_path: '/api/v1/ransomware-recent',
    cache_key: RANSOMWARE_RECENT_CACHE_KEY,
    evaluate: (body) => {
      const count = intField(body, 'count') ?? 0;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = count >= 20 ? 'ok' : count > 0 ? 'degraded' : 'down';
      return {
        status,
        reason: count > 0 ? `${count} recent leak-site claims` : 'Ransomlook upstream unreachable',
        metrics: { count },
        ageS,
      };
    },
  },
  {
    id: 'onion-watch',
    label: 'Onion mirror inventory (Ransomlook)',
    page_path: '/threatintel/onion-watch',
    api_path: '/api/v1/onion-watch',
    cache_key: ONION_WATCH_CACHE_KEY,
    evaluate: (body) => {
      const groups = (arrField(body, 'groups') ?? []).length;
      const reachable = intField(body, 'reachable_count') ?? 0;
      const total = intField(body, 'total_count') ?? 0;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status =
        total >= 20 && reachable === 0
          ? 'degraded'
          : reachable >= groups * 0.5
            ? 'ok'
            : reachable > 0
              ? 'degraded'
              : 'down';
      return {
        status,
        reason:
          total >= 20 && reachable === 0
            ? `Ransomlook prober offline (0 reachable across ${total} mirrors)`
            : `${reachable} / ${groups} groups reachable · ${total} mirrors`,
        metrics: { groups, reachable, total },
        ageS,
      };
    },
  },
  {
    id: 'threat-map',
    label: 'Threat map (geo + IOC types)',
    page_path: '/threatintel/threat-map',
    api_path: '/api/v1/threat-map',
    cache_key: THREAT_MAP_CACHE_KEY,
    evaluate: (body) => {
      const totalIps = intField(body, 'total_ips') ?? 0;
      const countries = (arrField(body, 'countries') ?? []).length;
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = totalIps >= 100 ? 'ok' : totalIps > 0 ? 'degraded' : 'down';
      return {
        status,
        reason: `${totalIps} IPs across ${countries} countries`,
        metrics: { total_ips: totalIps, countries },
        ageS,
      };
    },
  },
  {
    id: 'detection-rules',
    label: 'Detection rules (multi-source commits)',
    page_path: '/threatintel/rules',
    api_path: '/api/v1/rules',
    cache_key: DETECTION_RULES_CACHE_KEY,
    evaluate: (body) => {
      const sources = (arrField(body, 'sources') ?? []).length;
      const commits = arrField(body, 'recent_commits') ?? [];
      const ageS = ageSeconds(strField(body, 'generated_at'));
      const status: Status = sources >= 8 && commits.length >= 30 ? 'ok' : sources > 0 ? 'degraded' : 'down';
      return {
        status,
        reason: `${sources} repos · ${commits.length} recent commits`,
        metrics: { sources, commits: commits.length },
        ageS,
      };
    },
  },
];

async function probeOne(spec: FeedProbeSpec): Promise<FeedStatusRow> {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    const cached = await cache.match(spec.cache_key);
    if (!cached) {
      return {
        id: spec.id,
        label: spec.label,
        page_path: spec.page_path,
        api_path: spec.api_path,
        status: 'cold',
        reason: 'no cached payload (visit the page once to warm the cache)',
      };
    }
    const body = (await cached.json()) as unknown;
    const evaluated = spec.evaluate(body);
    return {
      id: spec.id,
      label: spec.label,
      page_path: spec.page_path,
      api_path: spec.api_path,
      status: evaluated.status,
      reason: evaluated.reason,
      metrics: evaluated.metrics,
      upstream_age_s: evaluated.ageS,
    };
  } catch (e) {
    return {
      id: spec.id,
      label: spec.label,
      page_path: spec.page_path,
      api_path: spec.api_path,
      status: 'down',
      reason: `cache read error: ${(e as Error).message}`,
    };
  }
}

export async function feedStatusHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(FEED_STATUS_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const rows = await Promise.all(PROBES.map(probeOne));
  const downs = rows.filter((r) => r.status === 'down').length;
  const degraded = rows.filter((r) => r.status === 'degraded').length;
  const cold = rows.filter((r) => r.status === 'cold').length;
  const overall: Status =
    downs >= 3 ? 'down' : downs >= 1 || degraded >= 3 ? 'degraded' : cold >= rows.length / 2 ? 'cold' : 'ok';

  const body: FeedStatusResponse = {
    generated_at: new Date().toISOString(),
    rows,
    overall,
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
