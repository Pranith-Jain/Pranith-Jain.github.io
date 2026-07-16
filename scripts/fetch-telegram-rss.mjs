import { writeFileSync } from 'node:fs';

const OUT_FILE = 'telegram-rss-cache.json';

const CHANNELS = [
  { handle: 'vxunderground', name: 'vx-underground', blurb: 'Malware-source archive + threat-actor commentary', topic: 'malware' },
  { handle: 'androidmalware', name: 'Android Malware', blurb: 'Daily Android-malware sample drops + analysis', topic: 'malware' },
  { handle: 'secharvester', name: 'SecHarvester', blurb: 'High-volume threat-intel firehose', topic: 'leaks' },
  { handle: 'group_ib', name: 'Group-IB', blurb: 'Official Group-IB threat-intel channel', topic: 'osint' },
  { handle: 'ctinow', name: 'CTI Now', blurb: 'Real-time CTI aggregator — IOCs, advisories, leaks', topic: 'osint' },
  { handle: 'Cyber_Ti_Reports_VN', name: 'Cyber TI Reports', blurb: 'Curated CTI report digest (multi-language)', topic: 'osint' },
  { handle: 'defendor_eng', name: 'Defendor (EN)', blurb: 'Defensive-CTI / IR write-ups + threat-actor tracking', topic: 'osint' },
  { handle: 'cyberosintosint', name: 'Cyber OSINT', blurb: 'OSINT-style cyber-news firehose', topic: 'osint' },
  { handle: 'CTIUpdates', name: 'CTI Updates', blurb: 'Real-time CTI feed — IOCs, threat reports, advisories', topic: 'osint' },
  { handle: 'cve0day', name: 'CVE 0day', blurb: 'CVE / 0day disclosure firehose', topic: 'osint' },
  { handle: 'cvenotify', name: 'CVE Notify', blurb: 'High-cadence CVE alerts (NVD-style)', topic: 'osint' },
  { handle: 'cvefeed', name: 'CVE & Vulnerability RSS', blurb: 'CVE / vulnerability RSS aggregator', topic: 'osint' },
  { handle: 'CyberSecurityPulse', name: 'CyberSecurityPulse', blurb: 'Telefónica Tech daily CTI pulse — incidents, advisories, research', topic: 'news' },
  { handle: 'phishingradar', name: 'Phishing Radar', blurb: 'Phishing + scam warnings (DE) — brand-impersonation alerts', topic: 'news' },
  { handle: 'mythreatintel', name: 'My Threat Intel', blurb: 'Spanish CTI firehose — CVE + ransomware-victim alerts', topic: 'osint' },
  { handle: 'falconfeedsio', name: 'FalconFeeds.io', blurb: 'Official FalconFeeds — ransomware victim tracker + breach announcements', topic: 'leaks' },
  { handle: 'RansomLook', name: 'RansomLook', blurb: 'Ransomware operator tracker — group claims, victims, leak-site activity', topic: 'leaks' },
  { handle: 'BleepingComputer', name: 'BleepingComputer', blurb: 'Breaking incident news', topic: 'news' },
  { handle: 'TheHackerNews', name: 'The Hacker News', blurb: 'Security news headlines', topic: 'news' },
  { handle: 'cyber_security_channel', name: 'Cyber Security Channel', blurb: 'High-volume security-news aggregator', topic: 'news' },
  { handle: 'cyberscoop', name: 'CyberScoop', blurb: 'CyberScoop news + government-cyber coverage', topic: 'news' },
  { handle: 'dailybountywriteup', name: 'Daily Bounty Writeup', blurb: 'Curated bug-bounty write-ups + disclosed vuln reports', topic: 'osint' },
  { handle: 'threatinteltrends', name: 'CTT CTI Trends', blurb: 'Community-driven CTI trends — threat actor tracking, campaign intel, and curated security news', topic: 'osint' },
  { handle: 'malwr', name: 'Malware Analysis', blurb: 'Malware analysis reports, sample drops, and reverse-engineering write-ups', topic: 'malware' },
];

const RSS_BRIDGES = [
  (handle) => `https://tg.i-c-a.su/rss/channel/${encodeURIComponent(handle)}`,
  (handle) => `https://rsshub.app/telegram/channel/${encodeURIComponent(handle)}`,
];

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_LEN = 800;
const MAX_MESSAGE_AGE_DAYS = 30;
const MAX_MESSAGES_PER_CHANNEL = 50;
const CONCURRENCY = 4;
const DELAY_BETWEEN_MS = 3_000;
const MAX_RETRIES = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRssToMessages(xml) {
  const items = [];
  const blocks = xml.split('<item>').slice(1);
  for (const block of blocks) {
    const content = block.split('</item>')[0];
    if (!content) continue;
    const link = /<link>(.*?)<\/link>/.exec(content)?.[1];
    if (!link) continue;
    const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(content)?.[1];
    const description =
      /<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(content)?.[1] ||
      /<description>(.*?)<\/description>/.exec(content)?.[1];
    const title =
      /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content)?.[1] || /<title>(.*?)<\/title>/.exec(content)?.[1];

    let text = (description || title || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .trim();
    if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN - 1) + '\u2026';

    const datetime = pubDate ? new Date(pubDate).toISOString() : '';
    items.push({ permalink: link, datetime, views: undefined, text });
  }
  const cutoff = Date.now() - MAX_MESSAGE_AGE_DAYS * 86_400_000;
  return items.filter((m) => new Date(m.datetime).getTime() >= cutoff).slice(0, MAX_MESSAGES_PER_CHANNEL);
}

async function fetchRssFeed(handle) {
  for (const buildUrl of RSS_BRIDGES) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = buildUrl(handle);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const r = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'pranithjain-dfir/1.0 (RSS reader; +https://pranithjain.qzz.io)',
            accept: 'application/rss+xml, application/xml, text/xml',
          },
        });
        clearTimeout(timer);
        if (!r.ok) {
          if (attempt < MAX_RETRIES) { await sleep(2000); continue; }
          continue;
        }
        const xml = await r.text();
        if (!xml.includes('<item>')) {
          if (attempt < MAX_RETRIES) { await sleep(2000); continue; }
          continue;
        }
        const msgs = parseRssToMessages(xml);
        if (msgs.length > 0) return msgs;
      } catch {
        if (attempt < MAX_RETRIES) { await sleep(2000); continue; }
      }
    }
  }
  return [];
}

function scoreChannel(messages) {
  if (messages.length === 0) {
    return { score: 0, signals: { recent_pct: 0, dupe_pct: 0, median_text_len: 0, posts_per_day: 0 } };
  }
  const now = Date.now();
  const recentMs = 30 * 24 * 3600 * 1000;
  let recent = 0;
  const lengths = [];
  const normalized = new Map();
  const timestamps = [];
  for (const m of messages) {
    const t = Date.parse(m.datetime);
    if (Number.isFinite(t)) {
      timestamps.push(t);
      if (now - t <= recentMs) recent += 1;
    }
    const len = (m.text ?? '').length;
    lengths.push(len);
    const key = (m.text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (key) normalized.set(key, (normalized.get(key) ?? 0) + 1);
  }
  const recentPct = recent / messages.length;
  let dupes = 0;
  for (const c of normalized.values()) if (c > 1) dupes += c - 1;
  const dupePct = dupes / messages.length;
  lengths.sort((a, b) => a - b);
  const medianLen = lengths[Math.floor(lengths.length / 2)] ?? 0;
  let postsPerDay = 0;
  if (timestamps.length >= 2) {
    timestamps.sort((a, b) => a - b);
    const spanDays = Math.max(0.5, (timestamps[timestamps.length - 1] - timestamps[0]) / (24 * 3600 * 1000));
    postsPerDay = messages.length / spanDays;
  }
  const sRecent = recentPct;
  const sDupe = 1 - Math.min(1, dupePct * 2);
  const sLen = Math.min(1, medianLen / 200);
  let sCadence;
  if (postsPerDay <= 0.05) sCadence = 0;
  else if (postsPerDay >= 25) sCadence = 0.3;
  else if (postsPerDay < 0.3) sCadence = postsPerDay / 0.3;
  else if (postsPerDay <= 15) sCadence = 1;
  else sCadence = 1 - (postsPerDay - 15) / 10;
  const score = Math.round(((sRecent + sDupe + sLen + sCadence) / 4) * 100);
  return {
    score,
    signals: {
      recent_pct: Math.round(recentPct * 100),
      dupe_pct: Math.round(dupePct * 100),
      median_text_len: medianLen,
      posts_per_day: Math.round(postsPerDay * 10) / 10,
    },
  };
}

async function buildCache() {
  const warnings = [];
  const channelStatus = [];
  const allItems = [];

  const queue = [...CHANNELS];
  async function worker() {
    while (queue.length > 0) {
      const ch = queue.shift();
      if (!ch) return;
      const messages = await fetchRssFeed(ch.handle);
      if (messages.length === 0) {
        warnings.push(`could not fetch ${ch.handle} from any RSS bridge`);
        channelStatus.push({ handle: ch.handle, name: ch.name, topic: ch.topic, ok: false, count: 0 });
        continue;
      }
      const quality = scoreChannel(messages);
      let textCount = 0;
      for (const m of messages) {
        if (!m.text) continue;
        textCount += 1;
        allItems.push({
          channel_handle: ch.handle,
          channel_name: ch.name,
          channel_topic: ch.topic,
          channel_blurb: ch.blurb,
          permalink: m.permalink,
          datetime: m.datetime,
          text: m.text,
          views: m.views,
        });
      }
      channelStatus.push({ handle: ch.handle, name: ch.name, topic: ch.topic, ok: true, count: textCount, quality });
      if (queue.length > 0) await sleep(DELAY_BETWEEN_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  allItems.sort((a, b) => b.datetime.localeCompare(a.datetime));

  return {
    generated_at: new Date().toISOString(),
    channels: channelStatus.sort((a, b) => a.name.localeCompare(b.name)),
    items: allItems,
    warnings,
  };
}

async function main() {
  console.log('Building Telegram RSS cache...');
  const cache = await buildCache();
  const liveCount = cache.items.filter((i) => i.datetime > new Date(Date.now() - 86400000).toISOString()).length;
  const channelsOk = cache.channels.filter((c) => c.ok).length;
  console.log(`  channels ok: ${channelsOk}/${cache.channels.length}, items: ${cache.items.length} (${liveCount} from last 24h), warnings: ${cache.warnings.length}`);

  if (cache.items.length === 0 && cache.channels.every((c) => !c.ok)) {
    console.error('Refusing to publish an empty cache (all channels failed)');
    process.exit(1);
  }

  writeFileSync(OUT_FILE, JSON.stringify(cache));
  console.log(`Wrote ${OUT_FILE} (${cache.items.length} items) — workflow will publish to telegram-rss-cache branch`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
