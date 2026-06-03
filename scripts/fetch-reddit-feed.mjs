import { writeFileSync } from 'node:fs';

// Writes the built feed to reddit-feed.json. The GitHub workflow publishes that
// file to the `reddit-feed-data` branch and the Worker reads it from GitHub
// raw — no Cloudflare KV / API token involved.
const OUT_FILE = 'reddit-feed.json';

// Keep in sync with api/src/routes/reddit-feed.ts
const SUBS = [
  { name: 'netsec', label: 'r/netsec', blurb: 'Practical netsec — research, advisories, deep-dives', topic: 'research' },
  { name: 'cybersecurity', label: 'r/cybersecurity', blurb: 'General cybersec news + career', topic: 'news' },
  { name: 'blueteamsec', label: 'r/blueteamsec', blurb: 'Defensive security — DFIR, hunting, IR', topic: 'blue-team' },
  { name: 'redteamsec', label: 'r/redteamsec', blurb: 'Red team tradecraft + offensive research', topic: 'red-team' },
  { name: 'AskNetsec', label: 'r/AskNetsec', blurb: 'Q&A — practical netsec problems', topic: 'help' },
  { name: 'Malware', label: 'r/Malware', blurb: 'Malware analysis + reverse engineering', topic: 'malware' },
  { name: 'ReverseEngineering', label: 'r/ReverseEngineering', blurb: 'RE — IDA, Ghidra, binary internals, CTFs', topic: 'malware' },
  { name: 'computerforensics', label: 'r/computerforensics', blurb: 'Digital forensics — disk, memory, mobile, cloud', topic: 'blue-team' },
  { name: 'OSINT', label: 'r/OSINT', blurb: 'Open-source intelligence tradecraft', topic: 'osint' },
  { name: 'threatintel', label: 'r/threatintel', blurb: 'CTI — actors, campaigns, IOCs', topic: 'research' },
  { name: 'crowdstrike', label: 'r/crowdstrike', blurb: 'CrowdStrike Falcon user community, detections', topic: 'blue-team' },
  { name: 'AzureSentinel', label: 'r/AzureSentinel', blurb: 'Microsoft Sentinel — KQL hunts, content packs', topic: 'blue-team' },
  { name: 'Scams', label: 'r/Scams', blurb: 'Largest scam-victim community — fresh-scam reporting + advice', topic: 'scams' },
  { name: 'IdentityTheft', label: 'r/IdentityTheft', blurb: 'ID theft + credit-card-fraud victim reports, recovery tradecraft', topic: 'scams' },
  { name: 'phishing', label: 'r/phishing', blurb: 'Phishing-campaign samples + analysis · educator-friendly', topic: 'scams' },
  { name: 'scambait', label: 'r/scambait', blurb: 'Scam-baiting community — surfaces fresh fraud playbooks + tactics in real-time', topic: 'scams' },
];

const CONCURRENCY = 4;
const MAX_POSTS_PER_SUB = 100;
const MAX_POST_AGE_DAYS = 7;
const MAX_TEXT_LEN = 400;
const FETCH_TIMEOUT_MS = 15_000;

function normalizeTopic(t) {
  if (!['news', 'research', 'red-team', 'blue-team', 'osint', 'malware', 'help', 'scams'].includes(t)) {
    return 'news';
  }
  return t;
}

function stripHtml(s) {
  if (!s) return '';
  const withBreaks = s.replace(/<br\s*\/?>/gi, '\n').replace(/<p[^>]*>/gi, '\n');
  return withBreaks.replace(/<[^>]+>/g, '').trim();
}

function parseFeedItems(xml, spec) {
  const items = [];
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1];
      const get = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
        const x = r.exec(block);
        return x ? x[1].trim() : '';
      };
      const title = get('title');
      const pubDate = get('published') || get('updated');
      const linkMatch = /<link[^>]*href="([^"]*)"/.exec(block);
      const link = linkMatch ? linkMatch[1] : '';
      const authorMatch = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/i.exec(block);
      const author = authorMatch ? authorMatch[1].trim() : '';
      let content = get('content') || get('summary');
      content = stripHtml(content);

      if (!title || !link || !pubDate) continue;

      const cutoff = Date.now() - MAX_POST_AGE_DAYS * 86_400_000;
      const t = Date.parse(pubDate);
      if (!Number.isFinite(t) || t < cutoff) continue;

      items.push({
        sub: spec.name,
        sub_label: spec.label,
        sub_topic: normalizeTopic(spec.topic),
        sub_blurb: spec.blurb,
        title: title.slice(0, 240),
        link,
        pub_date: new Date(pubDate).toISOString(),
        text: content.slice(0, MAX_TEXT_LEN),
        author,
      });
    }
  } else {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
      const block = m[1];
      const get = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
        const x = r.exec(block);
        return x ? x[1].trim() : '';
      };
      const title = get('title');
      const pubDate = get('pubDate');
      const link = get('link');
      const author = (get('author') || get('dc:creator')).replace(/^\/u\//, '');
      let content = get('content:encoded') || get('description');
      content = stripHtml(content);

      if (!title || !link || !pubDate) continue;

      const cutoff = Date.now() - MAX_POST_AGE_DAYS * 86_400_000;
      const t = Date.parse(pubDate);
      if (!Number.isFinite(t) || t < cutoff) continue;

      items.push({
        sub: spec.name,
        sub_label: spec.label,
        sub_topic: normalizeTopic(spec.topic),
        sub_blurb: spec.blurb,
        title: title.slice(0, 240),
        link,
        pub_date: new Date(pubDate).toISOString(),
        text: content.slice(0, MAX_TEXT_LEN),
        author,
      });
    }
  }
  return items;
}

async function fetchSub(spec) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(spec.name)}/.rss?limit=${MAX_POSTS_PER_SUB}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml',
      },
    });
    if (!r.ok) return { ok: false, items: [], error: `HTTP ${r.status}` };
    const xml = await r.text();
    if (!xml || xml.length < 100) return { ok: false, items: [], error: 'empty response' };
    const items = parseFeedItems(xml, spec);
    return { ok: true, items };
  } catch (e) {
    return { ok: false, items: [], error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function buildFeed() {
  const warnings = [];
  const subStatus = [];
  const allItems = [];

  const queue = [...SUBS];
  async function worker() {
    while (queue.length > 0) {
      const spec = queue.shift();
      if (!spec) return;
      const r = await fetchSub(spec);
      if (!r.ok) warnings.push(`could not fetch r/${spec.name} (${r.error})`);
      subStatus.push({ name: spec.name, label: spec.label, topic: normalizeTopic(spec.topic), ok: r.ok, count: r.items.length });
      allItems.push(...r.items);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  allItems.sort((a, b) => b.pub_date.localeCompare(a.pub_date));

  return {
    generated_at: new Date().toISOString(),
    subs: subStatus.sort((a, b) => a.label.localeCompare(b.label)),
    items: allItems,
    warnings,
  };
}

async function main() {
  console.log('Building Reddit feed...');
  const feed = await buildFeed();
  const liveCount = feed.items.filter((i) => i.pub_date > new Date(Date.now() - 86400000).toISOString()).length;
  console.log(`  items: ${feed.items.length} (${liveCount} from last 24h), warnings: ${feed.warnings.length}`);

  // Don't publish an empty feed — if every sub failed, keep the last-good data
  // on the branch rather than overwriting it with nothing.
  if (feed.items.length === 0) {
    console.error('Refusing to publish an empty feed (all sources failed)');
    process.exit(1);
  }

  writeFileSync(OUT_FILE, JSON.stringify(feed));
  console.log(`Wrote ${OUT_FILE} (${feed.items.length} items) — workflow will publish to reddit-feed-data branch`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
