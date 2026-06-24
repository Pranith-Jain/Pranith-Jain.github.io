import type { SocialSchedule, SocialContent } from '../types';
import { AUTOPOST_PLATFORMS, type AutopostPlatform, type AutopostQueueItem } from '../storage/social-schedule';

export interface AutopostPostResult {
  ok: boolean;
  postUrl?: string;
  error?: string;
}

/**
 * Dependencies for the drip auto-post runner. Everything that touches the
 * network or KV is injected, so the gate logic is unit-testable in isolation.
 */
export interface AutopostDeps {
  /** Master switch — `SOCIAL_AUTOPOST_ENABLED === 'true'`. When false the
   *  runner is a pure no-op (never posts). */
  enabled: boolean;
  now: Date;
  /** Advisory candidate queue (one KV blob). */
  readQueue: () => Promise<AutopostQueueItem[]>;
  /** Persist the pruned queue. */
  writeQueue: (items: AutopostQueueItem[]) => Promise<void>;
  /** Authoritative per-slug schedule (the queue is only a hint). */
  getSchedule: (slug: string) => Promise<SocialSchedule | null>;
  /** Generated social copy for a slug. */
  getContent: (slug: string) => Promise<SocialContent | null>;
  /** Post to a platform. Must not throw — return {ok:false,error} instead. */
  post: (platform: AutopostPlatform, content: SocialContent) => Promise<AutopostPostResult>;
  /** Persist the outcome (posted+url | failed+error+attempt). */
  recordResult: (slug: string, platform: AutopostPlatform, result: AutopostPostResult) => Promise<void>;
  /** Max posts PER PLATFORM per tick (the drip rate). Default 1. */
  dripPerPlatform?: number;
  /** Give up auto-posting after this many failed attempts. Default 3. */
  maxAttempts?: number;
}

export interface AutopostResult {
  enabled: boolean;
  posted: Array<{ slug: string; platform: AutopostPlatform; postUrl?: string }>;
  failed: Array<{ slug: string; platform: AutopostPlatform; error?: string }>;
  skipped: number;
  reason?: string;
}

interface DueCandidate {
  slug: string;
  platform: AutopostPlatform;
  scheduledAt: string;
}

/**
 * Release approved + due social posts on a drip — at most `dripPerPlatform`
 * per platform per tick, so a backlog goes out gradually rather than as a
 * burst. Three independent gates must ALL hold for anything to post:
 *   1. `enabled` (the SOCIAL_AUTOPOST_ENABLED master switch)
 *   2. the entry's authoritative status is 'approved' (human-OK'd)
 *   3. `scheduledAt` is in the past (due)
 * Instagram is structurally excluded (the queue only holds X/LinkedIn).
 * A failed post is recorded and retried on later ticks up to `maxAttempts`.
 */
export async function runSocialAutopost(deps: AutopostDeps): Promise<AutopostResult> {
  const result: AutopostResult = { enabled: deps.enabled, posted: [], failed: [], skipped: 0 };
  if (!deps.enabled) {
    result.reason = 'disabled';
    return result;
  }

  const dripPerPlatform = deps.dripPerPlatform ?? 1;
  const maxAttempts = deps.maxAttempts ?? 3;
  const nowMs = deps.now.getTime();

  const queue = await deps.readQueue();
  if (queue.length === 0) {
    result.reason = 'empty-queue';
    return result;
  }

  // Confirm each queue candidate against the authoritative schedule. Build the
  // due set, and decide which queue entries are stale and should be pruned.
  const due: DueCandidate[] = [];
  const keep: AutopostQueueItem[] = [];
  // Dedupe queue by slug+platform; cache schedule reads per slug.
  const seen = new Set<string>();
  const schedCache = new Map<string, SocialSchedule | null>();
  for (const item of queue) {
    const dedupKey = `${item.slug} ${item.platform}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    if (!schedCache.has(item.slug)) schedCache.set(item.slug, await deps.getSchedule(item.slug));
    const entry = schedCache.get(item.slug)?.[item.platform];

    // Not approved (pending/posted/failed-maxed) → drop from queue.
    if (!entry || entry.status !== 'approved') continue;
    // Approved but exhausted retries → drop.
    if ((entry.attempts ?? 0) >= maxAttempts) continue;

    // Approved: stays in the queue until it actually posts.
    keep.push({ slug: item.slug, platform: item.platform });

    // Due only when a scheduledAt is set and in the past.
    if (entry.scheduledAt && Date.parse(entry.scheduledAt) <= nowMs) {
      due.push({ slug: item.slug, platform: item.platform, scheduledAt: entry.scheduledAt });
    }
  }

  // Most-overdue first, then drip-cap per platform.
  due.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const perPlatformCount = new Map<AutopostPlatform, number>();
  const selected: DueCandidate[] = [];
  for (const c of due) {
    const n = perPlatformCount.get(c.platform) ?? 0;
    if (n >= dripPerPlatform) continue;
    perPlatformCount.set(c.platform, n + 1);
    selected.push(c);
  }

  const postedKeys = new Set<string>();
  for (const c of selected) {
    const content = await deps.getContent(c.slug);
    if (!content) {
      result.skipped += 1;
      continue;
    }
    const r = await deps.post(c.platform, content);
    await deps.recordResult(c.slug, c.platform, r);
    if (r.ok) {
      result.posted.push({ slug: c.slug, platform: c.platform, postUrl: r.postUrl });
      postedKeys.add(`${c.slug} ${c.platform}`);
    } else {
      result.failed.push({ slug: c.slug, platform: c.platform, error: r.error });
    }
  }

  // Prune: drop entries that just posted; keep the rest (approved-not-yet-due,
  // approved-not-selected-this-drip, and retryable failures stay queued).
  const pruned = keep.filter((k) => !postedKeys.has(`${k.slug} ${k.platform}`));
  await deps.writeQueue(pruned);

  return result;
}

/** Re-exported for callers wiring the cron (keeps the platform list one place). */
export { AUTOPOST_PLATFORMS };
export type { AutopostPlatform };
