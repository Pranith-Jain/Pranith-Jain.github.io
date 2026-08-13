#!/usr/bin/env node
/**
 * Sync ThreatCluster (threatcluster.io) public feeds into a local staging
 * directory.
 *
 * ThreatCluster aggregates threat intelligence from trusted cybersecurity
 * sources into clusters. Its public feeds refresh hourly and need no API
 * key. We replicate five of them into threat-intel-staging/threatcluster/:
 *
 *   1. Threat Feed           /feed.xml                  — top 50 trending clusters (7 days)
 *   2. Vulnerabilities Feed  /vulnerabilities/feed.xml  — latest CVEs (7 days)
 *   3. Exploits Feed         /exploits/feed.xml         — CVEs with public PoCs (30 days)
 *   4. Dark Web Victims      /dark-web/feed.xml         — ransomware leak-site victims (14 days)
 *   5. IOC Blocklist         /api/iocs/public/feed.json — high-confidence domains/IPs (30 days)
 *
 * We also capture a slim pass-through of the MISP-compatible manifest
 * (/misp/manifest.json — uuid → event metadata) for correlation. The
 * SmartNews feed is intentionally skipped: it carries the same clusters
 * as the Threat Feed and exists only for SmartNews platform submission.
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml)
 *   2. Manual: `node scripts/sync-threatcluster.mjs`
 *
 * After sync, run `node scripts/build-threatcluster.mjs` to slice the
 * staged data into public/data/threat-intel/threatcluster/.
 *
 * RSS is parsed with the same hand-rolled regex approach as
 * scripts/fetch-telegram-rss.mjs — no XML dependency.
 *
 * Source: https://threatcluster.io/feeds (free, no API key, public feeds)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const OUT = join(STAGING, 'threatcluster');
const UA = 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)';

const FEEDS = [
  {
    id: 'clusters',
    title: 'Threat Feed',
    url: 'https://threatcluster.io/feed.xml',
    window: '7 days',
  },
  {
    id: 'vulnerabilities',
    title: 'Vulnerabilities Feed',
    url: 'https://threatcluster.io/vulnerabilities/feed.xml',
    window: '7 days',
  },
  {
    id: 'exploits',
    title: 'Exploits Feed',
    url: 'https://threatcluster.io/exploits/feed.xml',
    window: '30 days',
  },
  {
    id: 'victims',
    title: 'Dark Web Victims Feed',
    url: 'https://threatcluster.io/dark-web/feed.xml',
    window: '14 days',
  },
];

const IOCS_URL = 'https://threatcluster.io/api/iocs/public/feed.json';
const MISP_URL = 'https://threatcluster.io/misp/manifest.json';

function ensureOut() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

async function fetchText(url, { accept = 'application/rss+xml, application/xml, text/xml' } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fetch failed: ${url} → ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`    fetched ${text.length} bytes`);
  return text;
}

/** Parse an RSS 2.0 document into normalized items (regex-based, no deps). */
function parseRss(xml) {
  const channel = xml.split('</channel>')[0] ?? '';
  const lastBuildDate = /<lastBuildDate>(.*?)<\/lastBuildDate>/.exec(channel)?.[1] ?? null;
  const items = [];
  const blocks = xml.split('<item>').slice(1);
  for (const block of blocks) {
    const content = block.split('</item>')[0];
    if (!content) continue;
    const grab = (tag) => {
      const m = new RegExp(`<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(content) ||
        new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(content);
      return m ? decodeEntities(m[1]).trim() : '';
    };
    const title = grab('title');
    const link = grab('link');
    const guid = grab('guid');
    const pubDate = grab('pubDate');
    const description = grab('description');
    const categories = [...content.matchAll(/<category>(.*?)<\/category>/g)]
      .map((m) => decodeEntities(m[1]).trim())
      .filter(Boolean);
    if (!title && !link) continue;
    items.push({ title, link, guid, pubDate, description, categories });
  }
  return { lastBuildDate, items };
}

/**
 * Normalize an RSS parse into per-feed staging JSON with an ISO pubDate.
 */
function toStaged(feed, parsed) {
  return {
    source: 'threatcluster.io',
    url: feed.url,
    lastBuildDate: parsed.lastBuildDate,
    syncedAt: new Date().toISOString(),
    itemCount: parsed.items.length,
    items: parsed.items.map((it) => ({
      title: it.title,
      link: it.link,
      guid: it.guid,
      pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      description: it.description,
      categories: it.categories,
    })),
  };
}

async function fetchFeed(feed) {
  console.log(`• ${feed.title}`);
  console.log(`  → ${feed.url}`);
  try {
    const xml = await fetchText(feed.url);
    const staged = toStaged(feed, parseRss(xml));
    writeFileSync(join(OUT, `${feed.id}.json`), JSON.stringify(staged, null, 2));
    console.log(`    ✔ staged ${staged.itemCount} items (last build: ${staged.lastBuildDate ?? '?'})`);
    return staged.itemCount;
  } catch (err) {
    console.error(`  ✘ ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

async function fetchIocs() {
  console.log('• IOC Blocklist (JSON)');
  console.log(`  → ${IOCS_URL}`);
  try {
    const json = JSON.parse(await fetchText(IOCS_URL, { accept: 'application/json' }));
    const staged = {
      source: 'threatcluster.io',
      url: IOCS_URL,
      generatedAt: json.generated_at ?? null,
      syncedAt: new Date().toISOString(),
      filters: json.filters ?? null,
      count: json.count ?? (json.iocs ?? []).length,
      iocs: (json.iocs ?? []).map((ioc) => ({
        type: ioc.type,
        value: ioc.value,
        confidence: ioc.confidence,
        reason: ioc.reason ?? null,
        first_seen: ioc.first_seen ?? null,
        last_seen: ioc.last_seen ?? null,
        source_count: ioc.source_count ?? (ioc.sources ?? []).length,
        sources: (ioc.sources ?? []).map((s) => ({
          source: s.source,
          url: s.url,
          pub_date: s.pub_date ?? null,
        })),
      })),
    };
    writeFileSync(join(OUT, 'iocs.json'), JSON.stringify(staged, null, 2));
    console.log(`    ✔ staged ${staged.count} IOCs (generated: ${staged.generatedAt ?? '?'})`);
    return staged.count;
  } catch (err) {
    console.error(`  ✘ ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

async function fetchMispManifest() {
  console.log('• MISP feed manifest (slim pass-through)');
  console.log(`  → ${MISP_URL}`);
  try {
    const json = JSON.parse(await fetchText(MISP_URL, { accept: 'application/json' }));
    const events = Object.entries(json ?? {}).map(([uuid, ev]) => ({
      uuid,
      info: ev.info ?? null,
      date: ev.date ?? null,
      analysis: ev.analysis,
      threat_level_id: ev.threat_level_id,
      timestamp: ev.timestamp ?? null,
      tags: (ev.Tag ?? []).map((t) => t.name),
      orgc: ev.Orgc?.name ?? null,
    }));
    const staged = {
      source: 'threatcluster.io',
      url: MISP_URL,
      syncedAt: new Date().toISOString(),
      eventCount: events.length,
      events,
    };
    writeFileSync(join(OUT, 'misp.json'), JSON.stringify(staged, null, 2));
    console.log(`    ✔ staged ${events.length} MISP events`);
    return events.length;
  } catch (err) {
    console.error(`  ✘ ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

async function main() {
  console.log('ThreatCluster sync — staging into', OUT);
  ensureOut();

  const counts = {};
  for (const feed of FEEDS) {
    counts[feed.id] = await fetchFeed(feed);
  }
  counts.iocs = await fetchIocs();
  counts.mispEvents = await fetchMispManifest();

  console.log('\nStaged:');
  for (const feed of FEEDS) {
    console.log(`    ${feed.id.padEnd(18)} ${String(counts[feed.id]).padStart(3)} items`);
  }
  console.log(`    iocs                ${String(counts.iocs).padStart(3)} indicators`);
  console.log(`    mispEvents          ${String(counts.mispEvents).padStart(3)} events`);
  console.log('\nNext: node scripts/build-threatcluster.mjs');
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});