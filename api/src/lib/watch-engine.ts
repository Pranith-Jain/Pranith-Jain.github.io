export interface Watch {
  id: string;
  label: string;
  type: 'ransomware-group' | 'cve-keyword' | 'actor' | 'ioc';
  value: string;
  webhook: string;
  created_at: string;
  last_triggered: string | null;
}

export interface AlertEvent {
  watch_id: string;
  label: string;
  type: Watch['type'];
  value: string;
  matched_at: string;
  match: string;
  detail?: string;
}

const WATCHES_KV_KEY = 'watches:v1';
const ALERT_LOG_KV_KEY = 'alert-log:v1';

export async function listWatches(kv: KVNamespace): Promise<Watch[]> {
  const raw = await kv.get(WATCHES_KV_KEY, 'json').catch(() => null);
  return (raw as Watch[]) ?? [];
}

/**
 * Save a watch to KV.
 *
 * Note: KV operations are eventually consistent. Concurrent saves to the
 * same key may result in last-write-wins. For a personal portfolio site
 * with single-user admin, this is acceptable. For multi-user scenarios,
 * implement optimistic locking with version numbers.
 */
export async function saveWatch(kv: KVNamespace, watch: Watch): Promise<void> {
  const watches = await listWatches(kv);
  const idx = watches.findIndex((w) => w.id === watch.id);
  if (idx >= 0) watches[idx] = watch;
  else watches.push(watch);
  await kv.put(WATCHES_KV_KEY, JSON.stringify(watches));
}

export async function deleteWatch(kv: KVNamespace, id: string): Promise<void> {
  const watches = await listWatches(kv);
  await kv.put(WATCHES_KV_KEY, JSON.stringify(watches.filter((w) => w.id !== id)));
}

export async function appendAlertLog(kv: KVNamespace, event: AlertEvent): Promise<void> {
  const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
  const log = (raw as AlertEvent[]) ?? [];
  log.unshift(event);
  if (log.length > 200) log.length = 200;
  await kv.put(ALERT_LOG_KV_KEY, JSON.stringify(log));
}

export async function getAlertLog(kv: KVNamespace): Promise<AlertEvent[]> {
  const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
  return (raw as AlertEvent[]) ?? [];
}

async function readCachedJson<T>(cacheKey: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(cacheKey));
    if (cached) return (await cached.json()) as T;
  } catch { /* cold */ }
  return null;
}

export async function checkWatches(kv: KVNamespace, now: string): Promise<AlertEvent[]> {
  const watches = await listWatches(kv);
  if (watches.length === 0) return [];

  const alerts: AlertEvent[] = [];

  const needsTrigger = (w: Watch): boolean => {
    if (!w.last_triggered) return true;
    const elapsed = Date.parse(now) - Date.parse(w.last_triggered);
    return elapsed > 3600_000;
  };

  for (const watch of watches) {
    if (!needsTrigger(watch)) continue;
    if (!watch.webhook) continue;

    try {
      let matched = false;
      let matchText = '';
      let detail = '';

      if (watch.type === 'ransomware-group') {
        const data = await readCachedJson<{ victims: Array<{ victim: string; group: string }> }>('https://ransomware-recent-cache.internal/v8-af-source');
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const victim = (data.victims ?? []).find((v) => re.test(v.group));
          if (victim) {
            matched = true;
            matchText = `New victim: ${victim.victim}`;
            detail = `Group ${watch.value} — ${victim.victim}`;
          }
        }
      } else if (watch.type === 'cve-keyword') {
        const data = await readCachedJson<{ cves: Array<{ id: string; description?: string }> }>('https://cve-recent-cache.internal/v10-750-paged');
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const match = (data.cves ?? []).find(
            (c) =>
              c.id.toLowerCase().includes(watch.value.toLowerCase()) ||
              re.test(c.description ?? '')
          );
          if (match) {
            matched = true;
            matchText = match.id;
            detail = match.description ? match.description.slice(0, 200) : '';
          }
        }
      } else if (watch.type === 'ioc') {
        const data = await readCachedJson<{ items: Array<{ value: string; kind: string; source: string }> }>('https://live-iocs-cache.internal/v11-freshness-filter');
        if (data) {
          const match = (data.items ?? []).find(
            (i) => i.value.toLowerCase() === watch.value.toLowerCase()
          );
          if (match) {
            matched = true;
            matchText = match.value;
            detail = `${match.kind} · ${match.source}`;
          }
        }
      } else if (watch.type === 'actor') {
        const data = await readCachedJson<{ groups: Array<{ display_name: string; slug: string; posts_in_window: number }> }>('https://actor-timeline-cache.internal/v3-mti');
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const match = (data.groups ?? []).find(
            (g) => re.test(g.display_name) || re.test(g.slug)
          );
          if (match && match.posts_in_window > 0) {
            matched = true;
            matchText = match.display_name;
            detail = `${match.posts_in_window} recent post${match.posts_in_window === 1 ? '' : 's'}`;
          }
        }
      }

      if (matched) {
        const event: AlertEvent = {
          watch_id: watch.id,
          label: watch.label,
          type: watch.type,
          value: watch.value,
          matched_at: now,
          match: matchText,
          detail,
        };
        alerts.push(event);
        watch.last_triggered = now;
        try {
          await fetch(watch.webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: `[Watch Alert] ${watch.label}\nType: ${watch.type}\nMatch: ${matchText}\n${detail ? `Detail: ${detail}` : ''}\nTime: ${now}`,
            }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          /* webhook unreachable — alert still logged */
        }
      }
    } catch {
      /* per-watch error — continue */
    }
  }

  // Batch-persist: write watches and alert log once instead of per-watch.
  // Previously each triggered watch did a read+write of watches:v1 and
  // alert-log:v1 — with 10 triggers that was 20 KV reads + 20 KV writes.
  // Now: 2 reads (already done above) + 2 writes total.
  if (alerts.length > 0) {
    try {
      await kv.put(WATCHES_KV_KEY, JSON.stringify(watches));
    } catch { /* non-fatal */ }

    try {
      const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
      const log = (raw as AlertEvent[]) ?? [];
      for (const event of alerts) log.unshift(event);
      if (log.length > 200) log.length = 200;
      await kv.put(ALERT_LOG_KV_KEY, JSON.stringify(log));
    } catch { /* non-fatal */ }
  }

  return alerts;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
