import type { Context } from 'hono';
import type { Env } from '../env';

type AutoTask =
  | { type: 'ip-lookup'; value: string }
  | { type: 'domain-lookup'; value: string }
  | { type: 'cve-lookup'; value: string }
  | { type: 'hash-lookup'; value: string }
  | { type: 'actor-lookup'; value: string };

interface AutomationResult {
  workflow: string;
  target: string;
  tasks: Array<{
    name: string;
    status: 'ok' | 'error' | 'no_data';
    data: unknown;
  }>;
  generated_at: string;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(key));
    if (cached) return (await cached.json()) as T;
  } catch { /* miss */ }
  return null;
}

async function lookupIp(ip: string): Promise<{ name: string; status: 'ok' | 'no_data'; data: unknown }> {
  const liveIocs = await readCache<{ items: Array<{ value: string; kind: string; source: string; first_seen: string }> }>('https://live-iocs-cache.internal/v11-freshness-filter');
  const matches = (liveIocs?.items ?? []).filter((i) => i.value === ip);
  return {
    name: 'Live IOC check',
    status: matches.length > 0 ? 'ok' : 'no_data',
    data: matches.length > 0 ? matches : 'No matching IOCs found',
  };
}

async function lookupDomain(domain: string): Promise<{ name: string; status: 'ok' | 'no_data'; data: unknown }> {
  const liveIocs = await readCache<{ items: Array<{ value: string; kind: string; source: string; first_seen: string }> }>('https://live-iocs-cache.internal/v11-freshness-filter');
  const matches = (liveIocs?.items ?? []).filter((i) => i.value === domain);
  return {
    name: 'Live IOC check',
    status: matches.length > 0 ? 'ok' : 'no_data',
    data: matches.length > 0 ? matches : 'No matching IOCs found',
  };
}

async function lookupCve(cveId: string): Promise<Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }>> {
  const results: Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }> = [];

  // Check CVEs
  const cveData = await readCache<{ cves: Array<{ id: string; description?: string; severity: string; score: number | null; kev?: boolean; published: string }> }>('https://cve-recent-cache.internal/v10-750-paged');
  const match = (cveData?.cves ?? []).find((c) => c.id.toUpperCase() === cveId.toUpperCase());
  results.push({
    name: 'CVE Data',
    status: match ? 'ok' : 'no_data',
    data: match ?? 'CVE not found in recent feed',
  });

  // Check writeups
  const writeups = await readCache<{ items: Array<{ title: string; url: string; source: string; published?: string; description?: string }> }>('https://writeups-cache.internal/v11-7d-window');
  const relatedWriteups = (writeups?.items ?? []).filter(
    (w) => w.title?.includes(cveId.toUpperCase()) || w.description?.includes(cveId.toUpperCase())
  );
  if (relatedWriteups.length > 0) {
    results.push({
      name: 'Analyst Writeups',
      status: 'ok',
      data: relatedWriteups,
    });
  }

  return results;
}

async function lookupHash(hash: string): Promise<Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }>> {
  const results: Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }> = [];

  const liveIocs = await readCache<{ items: Array<{ value: string; kind: string; source: string }> }>('https://live-iocs-cache.internal/v11-freshness-filter');
  const iocMatch = (liveIocs?.items ?? []).filter((i) => i.value === hash);
  if (iocMatch.length > 0) results.push({ name: 'Live IOCs', status: 'ok', data: iocMatch });

  const malSamples = await readCache<{ samples: Array<{ sha256: string; signature: string; first_seen: string; file_type: string }> }>('https://malware-samples-cache.internal/v3-500');
  const sampleMatch = (malSamples?.samples ?? []).filter((s) => s.sha256 === hash);
  if (sampleMatch.length > 0) results.push({ name: 'MalwareBazaar', status: 'ok', data: sampleMatch });

  if (results.length === 0) results.push({ name: 'Hash Lookup', status: 'no_data', data: 'No matches in any feed' });
  return results;
}

async function lookupActor(actor: string): Promise<Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }>> {
  const results: Array<{ name: string; status: 'ok' | 'error' | 'no_data'; data: unknown }> = [];
  const query = actor.toLowerCase();

  const actTimeline = await readCache<{ groups: Array<{ display_name: string; slug: string; posts_in_window: number; all_time_count: number; description?: string; raas?: boolean }> }>('https://actor-timeline-cache.internal/v3-mti');
  const gMatch = (actTimeline?.groups ?? []).filter(
    (g) => g.display_name.toLowerCase().includes(query) || g.slug.toLowerCase().includes(query)
  );
  if (gMatch.length > 0) results.push({ name: 'Actor Timeline', status: 'ok', data: gMatch });

  const ransData = await readCache<{ victims: Array<{ victim: string; group: string; date: string }> }>('https://ransomware-recent-cache.internal/v8-af-source');
  const vMatch = (ransData?.victims ?? []).filter((v) => v.group.toLowerCase().includes(query));
  if (vMatch.length > 0) results.push({ name: 'Ransomware Victims', status: 'ok', data: vMatch });

  const writeups = await readCache<{ items: Array<{ title: string; url: string; source: string; description?: string }> }>('https://writeups-cache.internal/v11-7d-window');
  const wMatch = (writeups?.items ?? []).filter(
    (w) => w.title?.toLowerCase().includes(query) || w.description?.toLowerCase().includes(query)
  );
  if (wMatch.length > 0) results.push({ name: 'Analyst Writeups', status: 'ok', data: wMatch });

  const cveData = await readCache<{ cves: Array<{ id: string; description?: string }> }>('https://cve-recent-cache.internal/v10-750-paged');
  const cMatch = (cveData?.cves ?? []).filter((c) => c.description?.toLowerCase().includes(query));
  if (cMatch.length > 0) results.push({ name: 'Related CVEs', status: 'ok', data: cMatch });

  if (results.length === 0) results.push({ name: 'Actor Lookup', status: 'no_data', data: 'No activity found in any source' });
  return results;
}

async function runTasks(tasks: AutoTask[]): Promise<AutomationResult['tasks']> {
  const results: AutomationResult['tasks'] = [];
  for (const task of tasks) {
    try {
      if (task.type === 'ip-lookup') {
        results.push(await lookupIp(task.value));
      } else if (task.type === 'domain-lookup') {
        results.push(await lookupDomain(task.value));
      } else if (task.type === 'cve-lookup') {
        const cveResults = await lookupCve(task.value);
        results.push(...cveResults);
      } else if (task.type === 'hash-lookup') {
        const hashResults = await lookupHash(task.value);
        results.push(...hashResults);
      } else if (task.type === 'actor-lookup') {
        const actResults = await lookupActor(task.value);
        results.push(...actResults);
      }
    } catch (e) {
      results.push({
        name: task.type,
        status: 'error',
        data: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

function buildWorkflow(target: string): { workflow: string; tasks: AutoTask[] } {
  const lower = target.trim().toLowerCase();

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
    return { workflow: 'IP Investigation', tasks: [{ type: 'ip-lookup', value: lower }] };
  }
  if (/^cve-\d{4}-\d{4,}$/i.test(lower)) {
    return { workflow: 'CVE Investigation', tasks: [{ type: 'cve-lookup', value: lower.toUpperCase() }] };
  }
  if (/^[a-f0-9]{32}$/i.test(lower) || /^[a-f0-9]{40}$/i.test(lower) || /^[a-f0-9]{64}$/i.test(lower)) {
    return { workflow: 'Hash Investigation', tasks: [{ type: 'hash-lookup', value: lower }] };
  }
  if (/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(lower)) {
    return { workflow: 'Domain Investigation', tasks: [{ type: 'domain-lookup', value: lower }] };
  }
  return {
    workflow: 'Threat Actor / Keyword Investigation',
    tasks: [{ type: 'actor-lookup', value: target.trim() }],
  };
}

export async function automationRunHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const { target } = await c.req.json<{ target: string }>();
    if (!target || target.trim().length === 0) {
      return c.json({ error: 'target is required' }, 400);
    }
    if (target.length > 500) {
      return c.json({ error: 'target too long' }, 400);
    }

    const { workflow, tasks } = buildWorkflow(target);
    const taskResults = await runTasks(tasks);

    const result: AutomationResult = {
      workflow,
      target: target.trim(),
      tasks: taskResults,
      generated_at: new Date().toISOString(),
    };

    return c.json(result, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
