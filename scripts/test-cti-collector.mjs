#!/usr/bin/env node
/**
 * Standalone CTI Collector test — exercises the collector functions
 * directly against live external APIs (no Cloudflare bindings needed).
 *
 * Run: node scripts/test-cti-collector.mjs
 */

// ── Minimal fetch wrappers (same as cti-collector.ts) ──────────────────
const FETCH_TIMEOUT = 15_000;
const HEADERS = { 'User-Agent': 'PranithJain-CTI/1.0' };

async function safeFetch(url, opts = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { ...opts, signal: controller.signal, headers: { ...HEADERS, ...(opts.headers || {}) } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res;
  } catch { return null; }
}

// ── Source fetchers (copied from cti-collector.ts for standalone test) ─

async function fetchThreatFox() {
  const res = await safeFetch('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...HEADERS },
    body: JSON.stringify({ query: 'get_iocs', days: 1 }),
  });
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const data = await res.json();
  if (data.query_status !== 'ok') return { ok: false, count: 0, error: data.query_status };
  const items = (data.data || []).filter(i => i.ioc);
  return { ok: true, count: items.length, sample: items.slice(0, 3).map(i => `${i.ioc_type}:${i.ioc}`) };
}

async function fetchUrlhaus() {
  const res = await safeFetch('https://urlhaus-api.abuse.ch/v1/urls/recent/');
  if (!res) {
    // Fallback: CSV
    const csvRes = await safeFetch('https://urlhaus.abuse.ch/downloads/csv_online/');
    if (!csvRes) return { ok: false, count: 0, error: 'no response' };
    const text = await csvRes.text();
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return { ok: true, count: Math.min(lines.length, 300), sample: ['csv_bulk_feed'] };
  }
  const data = await res.json();
  return { ok: true, count: (data.urls || []).length, sample: (data.urls || []).slice(0, 2).map(u => u.url) };
}

async function fetchMalwareBazaar() {
  const res = await safeFetch('https://mb-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...HEADERS },
    body: 'query=get_recent&selector=100',
  });
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const data = await res.json();
  if (data.query_status !== 'ok') return { ok: false, count: 0, error: data.query_status };
  return { ok: true, count: (data.data || []).length, sample: (data.data || []).slice(0, 2).map(i => `${i.signature || 'unknown'}:${i.sha256_hash?.slice(0, 16)}`) };
}

async function fetchFeodoTracker() {
  const res = await safeFetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json');
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.blocklist || []);
  return { ok: true, count: items.length, sample: items.slice(0, 2).map(i => `${i.ip_address} (${i.malware})`) };
}

async function fetchSslbl() {
  const res = await safeFetch('https://sslbl.abuse.ch/blacklist/sslipblacklist.csv');
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return { ok: true, count: Math.min(lines.length, 300), sample: [`${lines.length} IPs from CSV`] };
}

async function fetchOpenPhish() {
  const res = await safeFetch('https://openphish.com/feed.txt');
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const text = await res.text();
  const urls = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  return { ok: true, count: urls.length, sample: urls.slice(0, 2) };
}

async function fetchCisaKev() {
  const res = await safeFetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const data = await res.json();
  return { ok: true, count: (data.vulnerabilities || []).length, sample: (data.vulnerabilities || []).slice(0, 3).map(v => v.cveID) };
}

async function fetchRssFeed(name, url) {
  const res = await safeFetch(url);
  if (!res) return { ok: false, count: 0, error: 'no response' };
  const text = await res.text();
  const matches = text.match(/<item>/g);
  return { ok: true, count: matches ? matches.length : 0, sample: [`${name} RSS`] };
}

// ── Main test runner ───────────────────────────────────────────────────

const RSS_FEEDS = {
  bleepingcomputer: 'https://www.bleepingcomputer.com/feed/',
  hackernews: 'https://feeds.feedburner.com/TheHackersNews',
  darkreading: 'https://www.darkreading.com/rss.xml',
  therecord: 'https://therecord.media/feed',
  krebs: 'https://krebsonsecurity.com/feed/',
};

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' CTI Collector — Standalone Integration Test');
  console.log('═══════════════════════════════════════════════════════\n');

  const iocFetchers = [
    ['ThreatFox', fetchThreatFox],
    ['URLhaus', fetchUrlhaus],
    ['MalwareBazaar', fetchMalwareBazaar],
    ['Feodo Tracker', fetchFeodoTracker],
    ['SSLBL', fetchSslbl],
    ['OpenPhish', fetchOpenPhish],
    ['CISA KEV', fetchCisaKev],
  ];

  let totalIocs = 0;
  let sourcesOk = 0;
  let sourcesFailed = 0;

  console.log('── IOC Sources ───────────────────────────────────────\n');

  const results = await Promise.allSettled(
    iocFetchers.map(async ([name, fn]) => {
      const start = Date.now();
      const result = await fn();
      const ms = Date.now() - start;
      const icon = result.ok ? '✓' : '✗';
      const color = result.ok ? '\x1b[32m' : '\x1b[31m';
      console.log(`  ${color}${icon}\x1b[0m ${name.padEnd(18)} ${String(result.count).padStart(5)} items  ${ms}ms`);
      if (result.sample) console.log(`    sample: ${result.sample.join(', ')}`);
      if (result.error) console.log(`    error: ${result.error}`);
      if (result.ok) { totalIocs += result.count; sourcesOk++; }
      else sourcesFailed++;
      return result;
    })
  );

  console.log(`\n  Total IOCs collected: ${totalIocs}`);
  console.log(`  Sources OK: ${sourcesOk}/${iocFetchers.length}`);

  // ── News feeds ─────────────────────────────────────────────────────
  console.log('\n── News RSS Feeds ────────────────────────────────────\n');

  let totalNews = 0;
  let newsOk = 0;

  const newsResults = await Promise.allSettled(
    Object.entries(RSS_FEEDS).map(async ([name, url]) => {
      const start = Date.now();
      const result = await fetchRssFeed(name, url);
      const ms = Date.now() - start;
      const icon = result.ok ? '✓' : '✗';
      const color = result.ok ? '\x1b[32m' : '\x1b[31m';
      console.log(`  ${color}${icon}\x1b[0m ${name.padEnd(20)} ${String(result.count).padStart(4)} articles  ${ms}ms`);
      if (result.ok) { totalNews += result.count; newsOk++; }
      return result;
    })
  );

  console.log(`\n  Total news articles: ${totalNews}`);
  console.log(`  News feeds OK: ${newsOk}/${Object.keys(RSS_FEEDS).length}`);

  // ── Summary ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  IOC sources:    ${sourcesOk}/${iocFetchers.length} OK (${totalIocs} IOCs)`);
  console.log(`  News feeds:     ${newsOk}/${Object.keys(RSS_FEEDS).length} OK (${totalNews} articles)`);
  console.log(`  Total sources:  ${sourcesOk + newsOk}/${iocFetchers.length + Object.keys(RSS_FEEDS).length}`);
  console.log(`  Failed:         ${sourcesFailed + (iocFetchers.length + Object.keys(RSS_FEEDS).length - sourcesOk - newsOk)}`);

  if (sourcesOk + newsOk === iocFetchers.length + Object.keys(RSS_FEEDS).length) {
    console.log('\n  ✓ All sources healthy — collector is ready for production');
  } else {
    console.log('\n  ⚠ Some sources failed — check network / upstream status');
  }
  console.log('');
}

main().catch(console.error);
