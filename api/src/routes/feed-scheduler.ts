import type { Context } from 'hono';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';
import { badRequest, notFound, serviceUnavailable } from '../lib/api-error';
import { ensureGraphTables, upsertNode, type NodeType } from './threat-graph';
import { recordIocObservation } from './ioc-lifecycle';
import { pinnedFetchFollow } from '../lib/ssrf-guard';
import { safeNull, safeNullLog } from '../lib/safe-catch';
import type { D1Database } from '@cloudflare/workers-types';

interface FeedJob {
  id: string;
  name: string;
  source_url: string;
  interval_minutes: number;
  parser: 'plaintext-ips' | 'plaintext-domains' | 'plaintext-urls' | 'plaintext-hashes' | 'csv' | 'json';
  enabled: boolean;
  created_at: string;
  last_run_at: string | null;
  last_status: 'pending' | 'running' | 'ok' | 'error' | null;
  last_item_count: number;
  last_error: string | null;
  tags: string[];
}

interface FeedRunHistory {
  job_id: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'error';
  item_count: number;
  error: string | null;
}

const JOBS_KV_KEY = 'feed-scheduler:jobs:v1';
const JOBS_CACHE_KEY = 'https://feed-jobs-cache.internal/v1';
// Backstop TTL only — every saveJobs() write-throughs this Cache-API entry, so
// it stays coherent regardless of TTL. 300s (was 30s) cuts KV reads from an
// admin dashboard that polls the jobs list.
const JOBS_CACHE_TTL = 300;
const HISTORY_ALL_KV_KEY = 'feed-scheduler:history:all';
const MAX_HISTORY = 20;

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

async function readJobsCached(): Promise<FeedJob[] | null> {
  const cache = cacheApi();
  if (!cache) return null;
  try {
    const r = await cache.match(JOBS_CACHE_KEY);
    return r ? ((await r.json()) as FeedJob[]) : null;
  } catch {
    return null;
  }
}

async function writeJobsCache(jobs: FeedJob[]): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  try {
    await cache.put(
      JOBS_CACHE_KEY,
      new Response(JSON.stringify(jobs), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${JOBS_CACHE_TTL}` },
      })
    );
  } catch {
    /* best-effort */
  }
}

async function listJobs(kv: KVNamespace): Promise<FeedJob[]> {
  const cached = await readJobsCached();
  if (cached) return cached;
  const raw = await safeNullLog('kv-get-feed-jobs', kv.get(JOBS_KV_KEY, 'json'));
  const jobs = (raw as FeedJob[]) ?? [];
  await writeJobsCache(jobs);
  return jobs;
}

async function saveJobs(kv: KVNamespace, jobs: FeedJob[]): Promise<void> {
  await kv.put(JOBS_KV_KEY, JSON.stringify(jobs));
  await writeJobsCache(jobs);
}

export type { FeedJob, FeedRunHistory };
export { listJobs, saveJobs };

/**
 * Append a run to the combined history blob so getFeedJobsHistoryAllHandler
 * can serve all histories with 1 KV read instead of 1 + N reads for N jobs.
 * Reads the existing blob, updates the per-job array, and writes it back.
 */
async function readCombinedHistory(kv: KVNamespace): Promise<Record<string, FeedRunHistory[]>> {
  try {
    const raw = (await kv.get(HISTORY_ALL_KV_KEY, 'json')) as Record<string, FeedRunHistory[]> | null;
    return raw ?? {};
  } catch {
    return {};
  }
}

/**
 * Update the combined history blob for a single job. Called after every per-job
 * history write so getFeedJobsHistoryAllHandler reads 1 KV key instead of N+1.
 * Reuses the already-computed hist array to avoid re-reading per-job history.
 */
async function writeCombinedHistoryForJob(kv: KVNamespace, jobId: string, hist: FeedRunHistory[]): Promise<void> {
  try {
    const raw = (await safeNullLog('kv-get-feed-combined-history', kv.get(HISTORY_ALL_KV_KEY, 'json'))) as Record<string, FeedRunHistory[]> | null;
    const all = raw ?? {};
    all[jobId] = hist;
    await kv.put(HISTORY_ALL_KV_KEY, JSON.stringify(all));
  } catch {
    /* best-effort */
  }
}

function now(): string {
  return new Date().toISOString();
}

const VALID_PARSERS: FeedJob['parser'][] = [
  'plaintext-ips',
  'plaintext-domains',
  'plaintext-urls',
  'plaintext-hashes',
  'csv',
  'json',
];

const PRESETS: { id: string; name: string; source_url: string; parser: FeedJob['parser']; tags: string[] }[] = [
  {
    id: 'cins-army',
    name: 'CINS Army Bad IPs',
    source_url: 'https://cinsscore.com/list/ci-badguys.txt',
    parser: 'plaintext-ips',
    tags: ['blocklist', 'ip'],
  },
  {
    id: 'blocklist-de',
    name: 'Blocklist.de All',
    source_url: 'https://lists.blocklist.de/lists/all.txt',
    parser: 'plaintext-ips',
    tags: ['blocklist', 'ip', 'attacker'],
  },
  {
    id: 'greensnow',
    name: 'GreenSnow',
    source_url: 'https://blocklist.greensnow.co/greensnow.txt',
    parser: 'plaintext-ips',
    tags: ['blocklist', 'ip'],
  },
  {
    id: 'cert-pl',
    name: 'CERT Polska Phishing Domains',
    source_url: 'https://hole.cert.pl/domains/domains.txt',
    parser: 'plaintext-domains',
    tags: ['phishing', 'domain', 'cert-pl'],
  },
  {
    id: 'tor-exit',
    name: 'Tor Exit Nodes',
    source_url: 'https://check.torproject.org/torbulkexitlist',
    parser: 'plaintext-ips',
    tags: ['tor', 'anonymizer', 'ip'],
  },
  {
    id: 'x4bnet-vpn',
    name: 'X4BNet VPN Endpoints',
    source_url: 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt',
    parser: 'plaintext-ips',
    tags: ['vpn', 'proxy', 'ip'],
  },
  {
    id: 'binarydefense',
    name: 'BinaryDefense Ban List',
    source_url: 'https://www.binarydefense.com/banlist.txt',
    parser: 'plaintext-ips',
    tags: ['blocklist', 'ip'],
  },
  {
    id: 'spamhaus-drop',
    name: 'Spamhaus DROP List',
    source_url: 'https://www.spamhaus.org/drop/drop.txt',
    parser: 'plaintext-ips',
    tags: ['blocklist', 'ip', 'spamhaus'],
  },
  {
    id: 'phishing-army',
    name: 'Phishing Army Blocklist',
    source_url: 'https://phishing.army/download/phishing_army_blocklist.txt',
    parser: 'plaintext-domains',
    tags: ['phishing', 'domain'],
  },
];

export async function listFeedJobsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');
  const jobs = await listJobs(kv);
  return c.json({ jobs, presets: PRESETS }, 200, { 'Cache-Control': 'no-store' });
}

export async function createFeedJobHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const parsed = await safeJsonBody<{
    name: string;
    source_url: string;
    parser: FeedJob['parser'];
    interval_minutes?: number;
    tags?: string[];
  }>(c, { maxBytes: 4 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.name?.trim() || !body.source_url?.trim() || !body.parser) {
    return badRequest(c, 'name, source_url, and parser are required');
  }

  if (!VALID_PARSERS.includes(body.parser)) {
    return badRequest(c, `Invalid parser. Must be one of: ${VALID_PARSERS.join(', ')}`);
  }

  try {
    new URL(body.source_url);
  } catch {
    return badRequest(c, 'Invalid source_url');
  }

  const now_ = now();
  const job: FeedJob = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    source_url: body.source_url.trim(),
    parser: body.parser,
    interval_minutes: body.interval_minutes ?? 60,
    enabled: true,
    created_at: now_,
    last_run_at: null,
    last_status: null,
    last_item_count: 0,
    last_error: null,
    tags: body.tags ?? [],
  };

  const jobs = await listJobs(kv);
  jobs.push(job);
  await saveJobs(kv, jobs);
  return c.json({ job }, 201);
}

export async function updateFeedJobHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const parsed = await safeJsonBody<Partial<FeedJob>>(c, { maxBytes: 4 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const jobs = await listJobs(kv);
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return notFound(c, 'job not found');

  const job = { ...jobs[idx]! } as FeedJob;
  if (body.parser !== undefined && !VALID_PARSERS.includes(body.parser)) {
    return badRequest(c, `Invalid parser. Must be one of: ${VALID_PARSERS.join(', ')}`);
  }
  if (body.name !== undefined) job.name = body.name;
  if (body.source_url !== undefined) {
    try {
      new URL(body.source_url);
    } catch {
      return badRequest(c, 'Invalid source_url');
    }
    job.source_url = body.source_url;
  }
  if (body.interval_minutes !== undefined) job.interval_minutes = body.interval_minutes;
  if (body.enabled !== undefined) job.enabled = body.enabled;
  if (body.tags !== undefined) job.tags = body.tags;

  jobs[idx] = job;
  await saveJobs(kv, jobs);
  return c.json({ job });
}

export async function deleteFeedJobHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const jobs = await listJobs(kv);
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return notFound(c, 'job not found');

  jobs.splice(idx, 1);
  await saveJobs(kv, jobs);

  const historyKey = `feed-scheduler:history:${id}`;
  safeNullLog('kv-delete-feed-history', kv.delete(historyKey));
  // Remove job's history from the combined blob
  try {
    const raw = (await safeNullLog('kv-get-feed-history-remove', kv.get(HISTORY_ALL_KV_KEY, 'json'))) as Record<string, FeedRunHistory[]> | null;
    if (raw && raw[id]) {
      delete raw[id];
      await kv.put(HISTORY_ALL_KV_KEY, JSON.stringify(raw));
    }
  } catch {
    /* best-effort */
  }

  return c.json({ ok: true });
}

export async function runFeedJobHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const jobs = await listJobs(kv);
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return notFound(c, 'job not found');

  const job = jobs[idx]!;
  const startedAt = now();
  job.last_status = 'running';
  job.last_run_at = startedAt;
  jobs[idx] = job;
  await saveJobs(kv, jobs);

  try {
    // SSRF-guarded: validates + pins the host and re-validates each redirect
    // hop, blocking private/loopback/link-local/cloud-metadata targets even
    // though this is admin-gated (defence-in-depth on the cron egress path).
    const res = await pinnedFetchFollow(job.source_url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());

    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const count = lines.length;

    job.last_status = 'ok';
    job.last_item_count = count;
    job.last_error = null;
    jobs[idx] = job;
    await saveJobs(kv, jobs);

    const finishedAt = now();
    const history: FeedRunHistory = {
      job_id: id,
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'ok',
      item_count: count,
      error: null,
    };

    const historyKey = `feed-scheduler:history:${id}`;
    const existing = (await safeNullLog('kv-get-feed-run-ok', kv.get(historyKey, 'json'))) as FeedRunHistory[] | null;
    const hist = [history, ...(existing ?? [])].slice(0, MAX_HISTORY);
    await kv.put(historyKey, JSON.stringify(hist));
    await writeCombinedHistoryForJob(kv, id, hist);

    return c.json({ job, run: history });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    job.last_status = 'error';
    job.last_error = errMsg;
    jobs[idx] = job;
    await saveJobs(kv, jobs);

    const finishedAt = now();
    const history: FeedRunHistory = {
      job_id: id,
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'error',
      item_count: 0,
      error: errMsg,
    };

    const historyKey = `feed-scheduler:history:${id}`;
    const existing = (await safeNullLog('kv-get-feed-run-err', kv.get(historyKey, 'json'))) as FeedRunHistory[] | null;
    const hist = [history, ...(existing ?? [])].slice(0, MAX_HISTORY);
    await kv.put(historyKey, JSON.stringify(hist));
    await writeCombinedHistoryForJob(kv, id, hist);

    return c.json({ job, run: history }, 200);
  }
}

export async function getFeedJobHistoryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');

  const historyKey = `feed-scheduler:history:${id}`;
  const history = (await safeNullLog('kv-get-feed-history-get', kv.get(historyKey, 'json'))) as FeedRunHistory[] | null;
  return c.json({ history: history ?? [] }, 200, { 'Cache-Control': 'no-store' });
}

export async function getFeedJobsHistoryAllHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV not available');

  const allHistory = await readCombinedHistory(kv);
  return c.json({ history: allHistory }, 200, { 'Cache-Control': 'no-store' });
}

/**
 * Called by the hourly cron to auto-execute due feed jobs.
 * Runs at most 1 job per tick to stay within the 50-subrequest limit.
 * Saves fetched IOCs to graph_nodes D1 table.
 */
export async function autoRunFeedJobs(
  kv: KVNamespace,
  db: D1Database
): Promise<{ ran: number; saved: number; skipped: number }> {
  const jobs = await listJobs(kv);
  const nowMs = Date.now();
  const due = jobs.filter((j) => {
    if (!j.enabled) return false;
    if (!j.last_run_at) return true;
    return nowMs - new Date(j.last_run_at).getTime() >= j.interval_minutes * 60_000;
  });

  if (due.length === 0) return { ran: 0, saved: 0, skipped: 0 };

  const job = due.sort((a, b) => {
    const aT = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
    const bT = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
    return aT - bT;
  })[0]!;

  await ensureGraphTables(db);

  const startedAt = now();
  job.last_status = 'running';
  job.last_run_at = startedAt;
  const jobsClone = [...jobs];
  const idx = jobsClone.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobsClone[idx] = job;
  await saveJobs(kv, jobsClone);

  let savedCount = 0;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    // SSRF-guarded egress (re-validates + re-pins every redirect hop).
    const res = await pinnedFetchFollow(job.source_url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      let nodeType: NodeType | null = null;

      if (job.parser === 'plaintext-ips') {
        const parts = trimmed.split('.');
        if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && +p <= 255)) {
          nodeType = 'ip';
        }
      } else if (job.parser === 'plaintext-domains') {
        if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(trimmed)) {
          nodeType = 'domain';
        }
      } else if (job.parser === 'plaintext-urls') {
        try {
          new URL(trimmed);
          nodeType = 'url';
        } catch {
          /* skip */
        }
      } else if (job.parser === 'plaintext-hashes') {
        if (/^[a-f0-9]{32}$/.test(trimmed) || /^[a-f0-9]{40}$/.test(trimmed) || /^[a-f0-9]{64}$/.test(trimmed)) {
          nodeType = 'hash';
        }
      }

      if (nodeType) {
        try {
          await upsertNode(db, {
            type: nodeType,
            value: trimmed,
            confidence: 50,
            sources: [`feed:${job.name}`],
            properties: { label: trimmed, feed: job.name, feed_id: job.id },
          });
          savedCount++;
          // Track in IOC lifecycle table
          const lt = nodeType === 'ip' ? 'ipv4' : nodeType;
          safeNull(recordIocObservation(db, trimmed, lt, 50, [`feed:${job.name}`]));
        } catch (nodeErr) {
          console.warn(
            JSON.stringify({
              job: 'feed-scheduler',
              nodeId: trimmed,
              error: nodeErr instanceof Error ? nodeErr.message : String(nodeErr),
            })
          );
        }
      }
    }

    job.last_status = 'ok';
    job.last_item_count = lines.length;
    job.last_error = null;
  } catch (err) {
    job.last_status = 'error';
    job.last_error = err instanceof Error ? err.message : String(err);
    job.last_item_count = 0;
  }

  const finalJobs = await listJobs(kv);
  const finalIdx = finalJobs.findIndex((j) => j.id === job.id);
  if (finalIdx >= 0) {
    finalJobs[finalIdx] = job;
    await saveJobs(kv, finalJobs);
  }

  const historyKey = `feed-scheduler:history:${job.id}`;
  const history: FeedRunHistory = {
    job_id: job.id,
    started_at: startedAt,
    finished_at: now(),
    status: job.last_status === 'ok' ? 'ok' : 'error',
    item_count: job.last_item_count ?? 0,
    error: job.last_error,
  };
  const existing = (await safeNullLog('kv-get-feed-run-history', kv.get(historyKey, 'json'))) as FeedRunHistory[] | null;
  const hist = [history, ...(existing ?? [])].slice(0, MAX_HISTORY);
  await kv.put(historyKey, JSON.stringify(hist));
  await writeCombinedHistoryForJob(kv, job.id, hist);

  return { ran: 1, saved: savedCount, skipped: due.length - 1 };
}
