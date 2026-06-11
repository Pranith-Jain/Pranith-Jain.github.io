import type { FeedQueueMessage } from '../../lib/live-iocs-slices';

/* ─── Global-pulse feed registry + queue warmer ─────────────────────────── */
// Each feed is warmed into `gp:warm:<key>` by the queue consumer — ONE feed per
// consumer invocation, so each gets its own 50-subrequest budget. The previous
// design fanned out to all ~15 feeds in a single cron invocation, which blew the
// Free-plan 50-subrequest cap ("Too many subrequests") and silently starved the
// rest of the hourly cron (telegram-archive, the briefing LLM, etc.). The read
// path stitches the per-feed keys back together (see the `warm` build below).
export const GP_FEEDS: ReadonlyArray<{ key: string; path: string }> = [
  { key: 'reddit', path: '/api/v1/reddit-feed' },
  { key: 'x', path: '/api/v1/x-feed' },
  { key: 'telegram', path: '/api/v1/telegram-feed' },
  { key: 'actor', path: '/api/v1/actor-timeline' },
  { key: 'iocc', path: '/api/v1/ioc-correlation' },
  { key: 'cve', path: '/api/v1/cve-recent?days=7' },
  { key: 'ransom', path: '/api/v1/ransomware-recent?days=7' },
  { key: 'cybercrime', path: '/api/v1/cyber-crime' },
  { key: 'writeups', path: '/api/v1/writeups' },
  { key: 'malware', path: '/api/v1/malware-samples' },
  { key: 'phishing', path: '/api/v1/phishing-urls' },
  { key: 'scam', path: '/api/v1/crypto-scam-feed' },
  { key: 'breach', path: '/api/v1/breach-disclosures' },
  { key: 'tm', path: '/api/v1/threat-map' },
  { key: 'ioc', path: '/api/v1/live-iocs' },
  { key: 'xclaims', path: '/api/v1/x-claims' },
  { key: 'stealer', path: '/api/v1/stealer-forum-intel' },
  { key: 'secretleaks', path: '/api/v1/secret-leaks' },
  { key: 'malpkg', path: '/api/v1/malicious-packages' },
  { key: 'exploit', path: '/api/v1/exploit-db?latest=1' },
  { key: 'ghsa', path: '/api/v1/github-security?ecosystem=npm' },
  { key: 'kev', path: '/api/v1/cisa-kev?days=30' },
];

// Per-feed warm-slice KV key for a global-pulse feed.
//
// Why KV, not the Cache API (which live-iocs slices use, see live-iocs-slices.ts):
// global-pulse is served from any colo to a global audience, and the read path
// must see whatever the (single-colo) cron+consumer warmed. KV is global; the
// Cache API is per-colo, so a Cache-API slice warmed in one colo would be cold
// for readers in every other colo. The cost is the KV write quota — ≤21 feeds/hour
// ≈ 504 writes/day, under the 1000/day free tier — the deliberate tradeoff for
// cross-colo consistency.
export const gpWarmKey = (key: string): string => `gp:warm:${key}`;

// ALL feeds are warmed every hourly tick — not a rotating subset — so the page
// never has a feed dark waiting for its window to come around (a 7-per-hour
// rotation left ~2/3 of feeds stale for up to 3h). This is only affordable
// because each feed is its OWN consumer invocation (max_batch_size:1), so
// warming 21 feeds costs 21 cheap invocations, not one over-budget one. KV cost:
// ≤21 writes/hour ≈ 504/day, under the 1000/day free tier. GP_STAGGER_SECONDS
// just spaces the sends so a burst doesn't hammer a throttling upstream (t.me);
// the budget guarantee comes from max_batch_size:1, not the stagger.
const GP_STAGGER_SECONDS = 4;

/**
 * Enqueue every global-pulse feed for the queue consumer to warm — one message
 * per feed, each consumed in its own invocation. Cheap (queue sends only, no
 * fetches), so it is safe to call from the cron. `hour` is accepted for
 * call-site symmetry but no longer selects a window (all feeds warm each tick).
 */
export async function enqueueGpFeeds(queue: Queue<FeedQueueMessage>, _hour?: number): Promise<void> {
  await queue.sendBatch(
    GP_FEEDS.map((f, i) => ({
      body: { gp: { key: f.key, path: f.path } },
      delaySeconds: i * GP_STAGGER_SECONDS,
    }))
  );
}

/* ─── Cache keys (all warmed by hourly cron) ────────────────────────────── */

export const GLOBAL_PULSE_CACHE = 'https://global-pulse-cache.internal/v22-cyber-tech-geo';
export const CACHE_TTL = 300;
