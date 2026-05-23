import type { Context } from 'hono';
import type { Env } from '../env';
import { WRITEUP_SOURCES, type WriteupSourceSpec } from '../lib/writeup-sources';

/**
 * Source labels marked as `tier: 'signal'`. Computed once at module load
 * so the per-request filter is a Set lookup rather than a scan. The
 * `signal` tier is a tight curated subset of elite vendor / independent
 * research labs — the sources an analyst reads every time they ship.
 */
const SIGNAL_LABELS: Set<string> = new Set(
  WRITEUP_SOURCES.filter((s) => s.tier === 'signal').map((s) => {
    if (s.kind === 'manual') return s.source;
    if (s.kind === 'medium') return s.label ?? 'Medium';
    if (s.kind === 'devto') return s.label ?? 'dev.to';
    if (s.kind === 'hashnode') return s.label ?? 'Hashnode';
    return s.label;
  })
);

/**
 * Unified writeups aggregator.
 *
 * Pulls every source listed in WRITEUP_SOURCES (Medium, dev.to, Hashnode,
 * generic RSS, plus curated manual entries), parses RSS where applicable,
 * dedupes by URL, sorts newest-first, and returns a single JSON payload
 * the /writeups page renders.
 *
 * Cache 1h server-side. Adding a new platform = one line in WRITEUP_SOURCES.
 */

// v10 — 2026-05-21: tier split (signal sources separated from firehose),
// added Red Canary / Rapid7 / Securelist / Datadog Security Labs / ThreatSignal.
// Bumping the version busts the cache once on deploy so new sources show
// up immediately rather than waiting for the 1h TTL.
// Bumped v10 → v11 alongside MAX_ITEMS 150→500, MAX_PER_SOURCE 15→30, and
// the 7d cutoff filter applied to the post-dedup merged list.
export const WRITEUPS_CACHE_KEY = 'https://writeups-cache.internal/v11-7d-window';
const CACHE_KEY = WRITEUPS_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 12_000;
/** Hard cap on total items in the response (post-merge, post-sort).
 *  Bumped from 150 → 500 so the firehose surfaces a meaningful 7-day
 *  sample across ~30 sources without saturating a single chatty feed. */
const MAX_ITEMS = 500;
/** Per-source cap so a single chatty feed (e.g. Huntress at ~600 items)
 *  can't drown the rest. Raised in step with MAX_ITEMS. */
const MAX_PER_SOURCE = 30;
/** Drop items older than this many days from the published-aware sort.
 *  Older items are still kept in the per-source fetch (so we don't
 *  re-pull them on the next miss) but won't be merged into the response. */
const MAX_ITEM_AGE_DAYS = 7;

export interface Writeup {
  title: string;
  url: string;
  /** Display label for the source (Medium, dev.to, Personal Blog, etc). */
  source: string;
  /** ISO 8601 publish date when known, else undefined. */
  published?: string;
  /** Short summary — first ~280 chars of the body, plain text. */
  description?: string;
  /** Per-post tags from RSS category fields (when available). */
  tags?: string[];
  /** Per-post author when the feed exposes one. */
  author?: string;
  /** Type of source for UI filtering. */
  kind: 'medium' | 'devto' | 'hashnode' | 'rss' | 'manual';
}

export interface WriteupsResponse {
  generated_at: string;
  sources: Array<{
    kind: string;
    label: string;
    ok: boolean;
    count: number;
    error?: string;
  }>;
  total: number;
  items: Writeup[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; pranithjain-writeups/1.0; +https://pranithjain.qzz.io)',
        accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Strip CDATA + decode HTML entities (named + numeric) commonly emitted by RSS / Atom. */
function unwrap(s: string | undefined): string {
  if (!s) return '';
  let out = s.trim();
  // <![CDATA[ … ]]>
  const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(out);
  if (m) out = m[1] ?? '';
  // Named entities (the common five RSS / Atom feeds emit).
  out = out
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Numeric entities, decimal (e.g. &#8211; en dash) and hex (e.g. &#x2014; em dash).
  out = out
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
  return out;
}

/** Convert HTML to plain text, collapse whitespace, truncate. */
function htmlToText(html: string, max = 280): string {
  // Drop tags and common entities; squeeze whitespace.
  let t = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = t.slice(0, max).trimEnd() + '…';
  return t;
}

/** Tiny RSS 2.0 + Atom feed-item extractor. Auto-detects format on the body. */
function parseFeedItems(body: string, kind: Writeup['kind'], sourceLabel: string): Writeup[] {
  // Detect format: Atom feeds open with <feed xmlns="…/Atom"> or contain <entry>.
  const isAtom = /<feed\b[^>]*xmlns=["'][^"']*Atom/i.test(body) || /<entry\b/i.test(body);
  return isAtom ? parseAtom(body, kind, sourceLabel) : parseRss(body, kind, sourceLabel);
}

function parseRss(body: string, kind: Writeup['kind'], sourceLabel: string): Writeup[] {
  const out: Writeup[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(body))) {
    const block = m[1]!;
    const title = unwrap(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1]);
    const link = unwrap(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1]);
    const pubDate = unwrap(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1]);
    const author =
      unwrap(/<dc:creator>([\s\S]*?)<\/dc:creator>/i.exec(block)?.[1]) ||
      unwrap(/<author>([\s\S]*?)<\/author>/i.exec(block)?.[1]) ||
      undefined;
    const contentEncoded = unwrap(/<content:encoded>([\s\S]*?)<\/content:encoded>/i.exec(block)?.[1]);
    const description = unwrap(/<description>([\s\S]*?)<\/description>/i.exec(block)?.[1]);
    const tags = Array.from(block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi))
      .map((c) => unwrap(c[1]).trim())
      .filter(Boolean);

    if (!title || !link) continue;
    const summary = contentEncoded || description;
    const isoPublished = pubDate ? new Date(pubDate).toISOString() : undefined;

    out.push({
      title: title.trim(),
      url: link.trim(),
      source: sourceLabel,
      published: isoPublished && !Number.isNaN(Date.parse(isoPublished)) ? isoPublished : undefined,
      description: summary ? htmlToText(summary) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      author,
      kind,
    });
  }
  return out;
}

function parseAtom(body: string, kind: Writeup['kind'], sourceLabel: string): Writeup[] {
  const out: Writeup[] = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body))) {
    const block = m[1]!;
    const title = unwrap(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(block)?.[1]);
    // <link href="…" rel="alternate" type="text/html" /> — prefer rel=alternate, fall back to first link.
    let link =
      /<link\s+[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(block)?.[1] ??
      /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i.exec(block)?.[1] ??
      /<link\s+[^>]*href=["']([^"']+)["']/i.exec(block)?.[1];
    link = link ? link.trim() : undefined;
    const published = unwrap(/<published>([\s\S]*?)<\/published>/i.exec(block)?.[1]);
    const updated = unwrap(/<updated>([\s\S]*?)<\/updated>/i.exec(block)?.[1]);
    const dateRaw = published || updated;
    const summary = unwrap(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i.exec(block)?.[1]);
    const content = unwrap(/<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i.exec(block)?.[1]);
    const author =
      unwrap(/<author\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i.exec(block)?.[1]) || undefined;
    const tags = Array.from(block.matchAll(/<category\s+[^>]*term=["']([^"']+)["']/gi))
      .map((c) => c[1]!.trim())
      .filter(Boolean);

    if (!title || !link) continue;
    const body = content || summary;
    const isoPublished = dateRaw ? new Date(dateRaw).toISOString() : undefined;

    out.push({
      title: title.trim(),
      url: link,
      source: sourceLabel,
      published: isoPublished && !Number.isNaN(Date.parse(isoPublished)) ? isoPublished : undefined,
      description: body ? htmlToText(body) : undefined,
      tags: tags.length > 0 ? tags : undefined,
      author,
      kind,
    });
  }
  return out;
}

/** Resolve a source spec to (label, RSS URL). */
function sourceRss(spec: WriteupSourceSpec): { label: string; rssUrl: string | null; kind: Writeup['kind'] } {
  switch (spec.kind) {
    case 'medium': {
      const h = spec.handle.startsWith('@') ? spec.handle : `@${spec.handle}`;
      return {
        label: spec.label ?? 'Medium',
        rssUrl: `https://medium.com/feed/${encodeURIComponent(h)}`,
        kind: 'medium',
      };
    }
    case 'devto':
      return {
        label: spec.label ?? 'dev.to',
        rssUrl: `https://dev.to/feed/${encodeURIComponent(spec.handle)}`,
        kind: 'devto',
      };
    case 'hashnode':
      return { label: spec.label ?? 'Hashnode', rssUrl: `https://${spec.host}/rss.xml`, kind: 'hashnode' };
    case 'rss':
      return { label: spec.label, rssUrl: spec.url, kind: 'rss' };
    case 'manual':
      return { label: spec.source, rssUrl: null, kind: 'manual' };
  }
}

export async function fetchWriteups(): Promise<WriteupsResponse> {
  const sourceMeta: WriteupsResponse['sources'] = [];
  const all: Writeup[] = [];

  // ─── Manual / curated entries first (always succeed, no fetch needed) ──
  const manuals = WRITEUP_SOURCES.filter(
    (s): s is Extract<WriteupSourceSpec, { kind: 'manual' }> => s.kind === 'manual'
  );
  for (const m of manuals) {
    all.push({
      title: m.title,
      url: m.url,
      source: m.source,
      published: m.published,
      description: m.description,
      tags: m.tags,
      kind: 'manual',
    });
  }
  if (manuals.length > 0) {
    sourceMeta.push({ kind: 'manual', label: 'Curated', ok: true, count: manuals.length });
  }

  // ─── RSS-backed sources in parallel ────────────────────────────────────
  const rssSpecs = WRITEUP_SOURCES.filter((s) => s.kind !== 'manual') as Exclude<
    WriteupSourceSpec,
    { kind: 'manual' }
  >[];
  const results = await Promise.all(
    rssSpecs.map(async (spec) => {
      const { label, rssUrl, kind } = sourceRss(spec);
      if (!rssUrl) return { spec, label, kind, ok: false, items: [] as Writeup[], error: 'no rss url' };
      const body = await fetchText(rssUrl);
      if (!body) return { spec, label, kind, ok: false, items: [] as Writeup[], error: 'fetch failed' };
      let parsed: Writeup[];
      try {
        // Untrusted upstream XML — a parser throw must degrade this one
        // source, not reject Promise.all and 502 every writeup feed.
        parsed = parseFeedItems(body, kind, label);
      } catch {
        return { spec, label, kind, ok: false, items: [] as Writeup[], error: 'parse failed' };
      }
      // Trim per-source. Items inside a single feed are typically already
      // newest-first; sort defensively before truncating in case a feed
      // returns oldest-first (rare but seen in the wild).
      parsed.sort((a, b) => {
        if (a.published && b.published) return b.published.localeCompare(a.published);
        if (a.published) return -1;
        if (b.published) return 1;
        return 0;
      });
      const items = parsed.slice(0, MAX_PER_SOURCE);
      return { spec, label, kind, ok: items.length > 0, items };
    })
  );

  for (const r of results) {
    sourceMeta.push({
      kind: r.kind,
      label: r.label,
      ok: r.ok,
      count: r.items.length,
      error: r.ok ? undefined : r.error,
    });
    for (const it of r.items) all.push(it);
  }

  // Dedupe by URL (manual + RSS overlap is possible if the user includes both
  // a Medium handle and a curated one-off pointing at the same Medium post).
  const seen = new Set<string>();
  const deduped: Writeup[] = [];
  for (const it of all) {
    const key = it.url.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  // Filter to the 7d window. Undated items are kept so the firehose
  // doesn't go empty when an upstream feed strips dates.
  const cutoff = Date.now() - MAX_ITEM_AGE_DAYS * 86_400_000;
  const recent = deduped.filter((it) => {
    if (!it.published) return true;
    const t = Date.parse(it.published);
    return !Number.isFinite(t) || t >= cutoff;
  });

  return {
    generated_at: new Date().toISOString(),
    sources: sourceMeta,
    total: recent.length,
    items: roundRobinBySource(recent, MAX_ITEMS),
  };
}

/**
 * Newest-first sort comparator. Undated items sort to the tail.
 */
export function cmpByPublished<T extends { published?: string }>(a: T, b: T): number {
  if (a.published && b.published) return b.published.localeCompare(a.published);
  if (a.published) return -1;
  if (b.published) return 1;
  return 0;
}

/**
 * Round-robin selection across sources so a chatty feed (Unit 42 at 15/wk,
 * Recorded Future at 15/wk, …) can't push slower feeds (BushidoToken at
 * 1/mo, Aqua Security at 2/mo) off the visible list entirely. Each pass
 * picks the newest head-item from every non-drained source, in source-head
 * date order, so the visible list still feels chronological while every
 * source gets representation. Exported for unit testing.
 */
export function roundRobinBySource<T extends { source: string; published?: string }>(
  items: T[],
  maxItems: number
): T[] {
  // Sort once globally so within each source the head is newest.
  const sorted = [...items].sort(cmpByPublished);
  const bySource = new Map<string, T[]>();
  for (const it of sorted) {
    const bucket = bySource.get(it.source) ?? [];
    bucket.push(it);
    bySource.set(it.source, bucket);
  }
  const visible: T[] = [];
  let exhausted = false;
  while (visible.length < maxItems && !exhausted) {
    let picked = false;
    const heads: Array<{ source: string; head: T }> = [];
    for (const [source, bucket] of bySource) {
      const head = bucket[0];
      if (head) heads.push({ source, head });
    }
    heads.sort((a, b) => cmpByPublished(a.head, b.head));
    for (const { source } of heads) {
      if (visible.length >= maxItems) break;
      const bucket = bySource.get(source);
      if (!bucket || bucket.length === 0) continue;
      const next = bucket.shift();
      if (next) {
        visible.push(next);
        picked = true;
      }
    }
    if (!picked) exhausted = true;
  }
  return visible;
}

type TierFilter = 'signal' | 'firehose' | 'all';

/**
 * Filter a writeups response by tier. `signal` and `firehose` are
 * mutually exclusive cuts — a source appears in exactly one of the two
 * surfaces — so an analyst doesn't see the same Unit 42 piece on both
 * `/threatintel/signal` and `/threatintel/writeups`. `all` is the
 * escape hatch (kept off the public routes; used internally if needed).
 */
function filterByTier(body: WriteupsResponse, tier: TierFilter): WriteupsResponse {
  if (tier === 'all') return body;
  const inSignal = (label: string) => SIGNAL_LABELS.has(label);
  const want = tier === 'signal' ? inSignal : (label: string) => !inSignal(label);
  const items = body.items.filter((it) => want(it.source));
  const sources = body.sources.filter((s) => want(s.label));
  return { ...body, sources, total: items.length, items };
}

export async function writeupsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Default tier is FIREHOSE — the broad ecosystem cut minus the signal
  // tier. Signal-tier sources are surfaced on /threatintel/signal only,
  // so there's no overlap between the two pages.
  const q = c.req.query('tier');
  const tier: TierFilter = q === 'signal' ? 'signal' : q === 'all' ? 'all' : 'firehose';
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const makeResp = (body: WriteupsResponse) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });

  // Inflate from the all-sources cache when present; filter post-cache so
  // a tier flip doesn't require a re-fetch upstream.
  const cached = await cache.match(cacheReq);
  if (cached) {
    const body = (await cached.json()) as WriteupsResponse;
    return makeResp(filterByTier(body, tier));
  }

  const body = await fetchWriteups();
  const fullResponse = makeResp(body);
  c.executionCtx.waitUntil(cache.put(cacheReq, fullResponse.clone()));
  if (tier === 'all') return fullResponse;
  return makeResp(filterByTier(body, tier));
}
