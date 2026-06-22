import type { Candidate, DedupRecord } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

/* ── RSS/Atom parser ────────────────────────────────────────────── */

const ITEM_RE = /<(?:[a-z]+:)?(?:item|entry)[\s\S]*?<\/(?:[a-z]+:)?(?:item|entry)>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/;
const LINK_RE = /<(?:[a-z]+:)?link[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?link>|<(?:[a-z]+:)?link[^>]*href="([^"]+)"/;
const DATE_RE =
  /<(?:[a-z]+:)?(?:pubDate|published|updated|date)[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?(?:pubDate|published|updated|date)>/;

export interface RssItem {
  title: string;
  link: string;
  date: Date;
}

export function parseRssItems(xml: string, now: Date): RssItem[] {
  const out: RssItem[] = [];
  for (const block of xml.match(ITEM_RE) ?? []) {
    const title = (block.match(TITLE_RE)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const lm = block.match(LINK_RE);
    const link = (lm?.[1] || lm?.[2] || '').trim();
    const ds = block.match(DATE_RE)?.[1];
    const d = ds ? new Date(ds.trim()) : now;
    if (!title) continue;
    out.push({ title, link, date: Number.isFinite(d.getTime()) ? d : now });
  }
  return out;
}

/* ── Shared runner factory ──────────────────────────────────────── */

export interface RssRunnerDeps {
  fetch: typeof globalThis.fetch;
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
}

export interface RssRunnerConfig {
  /** Candidate type (maps to CaseStudyType). */
  type: Candidate['type'];
  /** RSS/Atom feed URLs. */
  feeds: string[];
  /** Max age for items to be considered (ms). */
  windowMs: number;
  /** Source-weight fed into finalScore (0..1). 0.6 is the default for RSS. */
  sourceWeight: number;
  /** Short label for the rationale field (e.g. "OSINT tradecraft"). */
  rationaleLabel: string;
  /** Runner name used in structured logs. */
  runnerName: string;
}

/** Build an async discovery function from a config object.
 *  Every RSS-backed runner (osint, methodology, news, tool, intel, scam)
 *  follows the exact same fetch → parse → score → push pattern.
 *  This factory eliminates copy-paste and guarantees scoring consistency. */
export function createRssRunner(config: RssRunnerConfig) {
  return async (deps: RssRunnerDeps): Promise<Candidate[]> => {
    const out: Candidate[] = [];
    const cutoff = deps.now.getTime() - config.windowMs;
    let feedsOk = 0;
    for (const feed of config.feeds) {
      try {
        const r = await deps.fetch(feed, {
          headers: {
            Accept: 'application/rss+xml, application/xml, */*',
            'User-Agent': 'pranithjain.qzz.io case-study-discovery',
          },
        });
        if (!r.ok) continue;
        feedsOk += 1;
        const xml = await r.text();
        const feedHost = new URL(feed).hostname.replace(/^www\./, '');
        for (const item of parseRssItems(xml, deps.now)) {
          if (item.date.getTime() < cutoff) continue;
          if (!item.link) continue;
          const key = topicKey(config.type, item.link);
          const dedup = await deps.getDedup(key);
          const score = finalScore({
            recency: recencyScore(item.date.toISOString(), deps.now),
            severity: severityScore({}),
            novelty: noveltyScore(dedup, deps.now),
            sourceWeight: config.sourceWeight,
          });
          out.push({
            key,
            type: config.type,
            title: item.title,
            rationale: `${config.rationaleLabel} · ${feedHost} · ${item.date.toISOString().slice(0, 10)}`,
            score,
            evidence: { url: item.link, published: item.date.toISOString(), source: feed },
            discoveredAt: deps.now.toISOString(),
            status: 'pending',
          });
        }
      } catch (err) {
        console.warn(`${config.runnerName}: feed failed ${feed}`, err);
      }
    }
    console.log(
      JSON.stringify({
        job: 'discovery-runner',
        runner: config.runnerName,
        feedsTotal: config.feeds.length,
        feedsOk,
        items: out.length,
      })
    );
    return out;
  };
}
