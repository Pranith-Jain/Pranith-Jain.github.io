#!/usr/bin/env node
/**
 * Sync AI Security hub upstream sources into staging.
 *
 * Three sources (each isolated — one flaky upstream never aborts the others):
 *   1. ai-escape.watch (two-way parity) —
 *      GET /api/registry + /api/queue (live queue state) plus the bundled
 *      app.js (embedded incident IDs CB-YYYY-NNNN). Compared against the
 *      curatorial seed in threat-intel-staging/ai-escape/seed.json. Never
 *      auto-overwrites the seed — drift is reported in escape-parity.json
 *      for human review (same "reviewed before publish" rule as the registry).
 *   2. aisecuritymatrix.com — GET /data.json (curated AI-enabled security
 *      testing tools; entry + derived identity/shape/substrate).
 *   3. incidentdatabase.ai — GET /rss.xml (AI Incident Database reports).
 *
 * Staging layout (threat-intel-staging/ai-security/):
 *   escape-parity.json   upstream snapshot + local counts + drift flags
 *   matrix.json          raw data.json array passthrough
 *   incidents.json       parsed RSS items (guid/title/link/pubDate/cite)
 *
 * Run:  node scripts/sync-ai-security.mjs
 * Then: node scripts/build-ai-security.mjs
 */
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'ai-security');
const ESCAPE_SEED = join(ROOT, 'threat-intel-staging', 'ai-escape', 'seed.json');

const UA = 'pranithjain-ai-security-sync/1.0 (+https://pranithjain.qzz.io)';

const ESCAPE_REGISTRY_URL = 'https://ai-escape.watch/api/registry';
const ESCAPE_QUEUE_URL = 'https://ai-escape.watch/api/queue';
const ESCAPE_APPJS_URL = 'https://ai-escape.watch/app.js';
const MATRIX_URL = 'https://aisecuritymatrix.com/data.json';
const INCIDENTS_RSS_URL = 'https://incidentdatabase.ai/rss.xml';

function ensureStaging() {
  mkdirSync(STAGING, { recursive: true });
}

async function fetchText(url, accept = '*/*') {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fetch failed: ${url} → ${res.status} ${res.statusText}`);
  return await res.text();
}

function extractCbIds(js) {
  const ids = new Set();
  for (const m of js.matchAll(/CB-\d{4}-\d{4}/g)) ids.add(m[0]);
  return [...ids].sort();
}

function localEscapeCounts() {
  try {
    if (!existsSync(ESCAPE_SEED)) return { seedFound: false, ids: [] };
    const seed = JSON.parse(readFileSync(ESCAPE_SEED, 'utf8'));
    const ids = (seed.incidents ?? []).map((i) => i.id).sort();
    return {
      seedFound: true,
      entries: ids.length,
      ids,
      version: seed.version ?? null,
      compiled: seed.compiled ?? null,
    };
  } catch (e) {
    console.error(`  ⚠ local seed unreadable: ${e instanceof Error ? e.message : e}`);
    return { seedFound: false, ids: [] };
  }
}

async function syncEscape() {
  console.log(' [1/3] ai-escape.watch parity…');
  let registry = null;
  let queue = null;
  let embeddedIds = [];
  try {
    registry = JSON.parse(await fetchText(ESCAPE_REGISTRY_URL, 'application/json'));
    console.log(`   registry: ok=${registry.ok} entries=${(registry.entries ?? []).length}`);
  } catch (e) {
    console.error(`   ⚠ registry unreachable: ${e instanceof Error ? e.message : e}`);
  }
  try {
    queue = JSON.parse(await fetchText(ESCAPE_QUEUE_URL, 'application/json'));
    console.log(`   queue: ok=${queue.ok} pending=${(queue.pending ?? []).length}`);
  } catch (e) {
    console.error(`   ⚠ queue unreachable: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const appJs = await fetchText(ESCAPE_APPJS_URL, 'application/javascript');
    embeddedIds = extractCbIds(appJs);
    console.log(`   app.js: ${appJs.length} bytes, ${embeddedIds.length} embedded CB-* ids`);
  } catch (e) {
    console.error(`   ⚠ app.js unreachable: ${e instanceof Error ? e.message : e}`);
  }
  const local = localEscapeCounts();
  const upstreamIds = embeddedIds.length
    ? embeddedIds
    : ((registry?.entries ?? []).map((e) => e.id).filter(Boolean).sort());
  const localSet = new Set(local.ids ?? []);
  const upstreamSet = new Set(upstreamIds);
  const onlyUpstream = upstreamIds.filter((id) => !localSet.has(id));
  const onlyLocal = (local.ids ?? []).filter((id) => !upstreamSet.has(id));
  const parity = {
    checkedAt: new Date().toISOString(),
    upstream: {
      registryEntries: (registry?.entries ?? []).length,
      queuePending: (queue?.pending ?? []).length,
      embeddedIds: upstreamIds.length,
      ids: upstreamIds,
    },
    local: { entries: local.entries ?? 0, version: local.version ?? null, compiled: local.compiled ?? null },
    drift: onlyUpstream.length > 0 || onlyLocal.length > 0,
    onlyUpstream,
    onlyLocal,
    note: 'Two-way parity report only — never auto-overwrites the curatorial seed. Merge drift via reviewed PR either direction.',
  };
  writeFileSync(join(STAGING, 'escape-parity.json'), JSON.stringify(parity, null, 2));
  console.log(
    `   → escape-parity.json (local ${parity.local.entries}, upstream ${parity.upstream.embeddedIds}, drift=${parity.drift})`
  );
  return 1;
}

async function syncMatrix() {
  console.log(' [2/3] aisecuritymatrix.com/data.json…');
  try {
    const raw = await fetchText(MATRIX_URL, 'application/json');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('data.json is not a non-empty array');
    writeFileSync(join(STAGING, 'matrix.json'), raw);
    console.log(`   → matrix.json (${arr.length} tools, ${raw.length} bytes)`);
    return arr.length;
  } catch (e) {
    console.error(`   ⚠ matrix sync failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}

function parseRssItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const pick = (tag) => {
      const mm = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!mm) return '';
      return mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };
    const title = pick('title');
    const link = pick('link');
    const guid = pick('guid');
    const pubDate = pick('pubDate');
    const description = pick('description');
    const citeMatch = description.match(/incidentdatabase\.ai\/cite\/(\d+)#(\d+)/) ??
      link.match(/incidentdatabase\.ai\/cite\/(\d+)/);
    items.push({
      guid: guid || link,
      title,
      link,
      pubDate,
      citeId: citeMatch ? citeMatch[1] : null,
      reportNum: citeMatch ? (citeMatch[2] ?? null) : null,
      description: description.slice(0, 500),
    });
  }
  return items;
}

async function syncIncidents() {
  console.log(' [3/3] incidentdatabase.ai/rss.xml…');
  try {
    const xml = await fetchText(INCIDENTS_RSS_URL, 'application/rss+xml');
    const items = parseRssItems(xml);
    if (items.length === 0) throw new Error('no <item> entries parsed from RSS');
    const doc = { fetchedAt: new Date().toISOString(), source: INCIDENTS_RSS_URL, count: items.length, items };
    writeFileSync(join(STAGING, 'incidents.json'), JSON.stringify(doc));
    console.log(`   → incidents.json (${items.length} reports)`);
    return items.length;
  } catch (e) {
    console.error(`   ⚠ incidents sync failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}

async function main() {
  console.log('AI Security sync — staging into', STAGING);
  // Wipe only our own three staging files (never the ai-escape curatorial seed).
  ensureStaging();
  for (const f of ['escape-parity.json', 'matrix.json', 'incidents.json']) {
    const p = join(STAGING, f);
    if (existsSync(p)) rmSync(p);
  }
  const results = { escape: 0, matrix: 0, incidents: 0 };
  try {
    results.escape = await syncEscape();
  } catch (e) {
    console.error(`  ⚠ escape source aborted: ${e instanceof Error ? e.message : e}`);
  }
  try {
    results.matrix = await syncMatrix();
  } catch (e) {
    console.error(`  ⚠ matrix source aborted: ${e instanceof Error ? e.message : e}`);
  }
  try {
    results.incidents = await syncIncidents();
  } catch (e) {
    console.error(`  ⚠ incidents source aborted: ${e instanceof Error ? e.message : e}`);
  }
  console.log('\n✔ Staged:', JSON.stringify(results));
  console.log('Next: node scripts/build-ai-security.mjs');
  if (results.matrix === 0 && results.incidents === 0) {
    console.error('✘ both matrix and incidents syncs failed — nothing to build from');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
