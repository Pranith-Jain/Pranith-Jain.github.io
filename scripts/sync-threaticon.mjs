#!/usr/bin/env node
/**
 * Sync threaticon.com (a STIX 2.1 / TAXII 2.1 threat-intel platform) into
 * local staging under threat-intel-staging/threaticon/.
 *
 * The public preview is server-rendered Livewire HTML that allows crawling
 * (robots.txt has an empty Disallow and a sitemap). We fetch four things:
 *
 *   1. /detection-coverage — 493 ATT&CK techniques with per-technique
 *      detection-rule counts, grouped by tactic (one page, no pagination).
 *   2. /malware?page=N      — the malware family catalog (9,223 families,
 *      15 per page). Name + category + TLP + confidence per family.
 *   3. /threat-actors?page=N — the actor catalog (1,494 actors, 15 per
 *      page). Name + aliases + type + origin country + status + TLP +
 *      confidence + description.
 *   4. /threat-actors/<id>  — actor detail pages (1,495, discovered from
 *      the sitemap). Full profile: MITRE ID, type, sophistication, resource
 *      level, motivation, country of origin, confidence, added date,
 *      targeted sectors/countries, ATT&CK tactics/techniques, tooling,
 *      IOC patterns, tags.
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml) — weekly
 *   2. Manual: `node scripts/sync-threaticon.mjs`
 *
 * Options: --skip-details (list pages only), --actors-limit N,
 * --malware-pages N, --concurrency N
 *
 * After sync, run `node scripts/build-threaticon.mjs` to slice the staged
 * data into public/data/threat-intel/threaticon/.
 *
 * Source: https://threaticon.com/ (public preview, no API key required)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threaticon');
const BASE_URL = 'https://threaticon.com';
const UA =
  'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);
const CONCURRENCY = parseInt(opt('--concurrency', '4'), 10);
const SKIP_DETAILS = flag('--skip-details');
const ACTORS_LIMIT = parseInt(opt('--actors-limit', '0'), 10) || 0;
const MALWARE_PAGES = parseInt(opt('--malware-pages', '0'), 10) || 0;
const ACTORS_PAGES = parseInt(opt('--actors-pages', '0'), 10) || 0;
const GAP_MS = parseInt(opt('--gap-ms', '150'), 10);

const paged = (s, n) => n >= 0 && s === n;
let actorPagesDone = 0;
let malwarePagesDone = 0;
let detailFetched = 0;
let detailSkipped = 0;

function ensureStaging() {
  for (const d of ['malware/pages', 'actors/pages', 'actors/details']) {
    mkdirSync(join(STAGING, d), { recursive: true });
  }
}

function stagePath(rel) {
  return join(STAGING, rel);
}

function readStaged(rel) {
  const p = stagePath(rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function writeStaged(rel, data) {
  writeFileSync(stagePath(rel), JSON.stringify(data));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`fetch failed: ${url} → ${res.status} ${res.statusText}`), {
      status: res.status,
      url,
    });
  }
  return res.text();
}

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? 0;
      // 429 = throttled: back off hard so the crawl stays polite.
      const wait = status === 429 ? 10_000 * (i + 1) : 500 * (i + 1);
      console.warn(`    ⚠ ${err?.status ?? 'err'} on ${url} — retry ${i + 1}/${attempts} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

// TLP:CLEAR → white; TLP:AMBER → amber; etc. (STIX-style names).
function tlpNormalize(raw) {
  const t = (raw ?? '').replace(/^TLP:/i, '').toLowerCase();
  if (t === 'clear') return 'white';
  return ['red', 'amber', 'green', 'white'].includes(t) ? t : null;
}

async function pool(items, limit, worker, gapMs = 150) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
      await sleep(gapMs);
    }
  });
  await Promise.all(runners);
  return results;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 1. Detection coverage (single page, 493 techniques)                 */
/* ------------------------------------------------------------------ */

function parseCoverage(html) {
  const main = html.slice(html.indexOf('wire:name="detection.coverage-heatmap"'));
  const cardRe =
    /attack-patterns\/(\d+)"\s+wire:navigate\s+title="(T\d+(?:\.\d+)?):\s*([^"]*?)(?:\s*\((\d+)\s*rules?\))?\s*"/g;

  const techniques = [];
  let currentTactic = 'Unknown';
  const tacticPositions = [];
  let m;
  const tacticHeaderRe = /<span class="font-semibold text-sm text-zinc-800 dark:text-zinc-200">\s*([^<]+?)\s*<\/span>/g;
  tacticHeaderRe.lastIndex = 0;
  while ((m = tacticHeaderRe.exec(main)) !== null) {
    const badge = main.slice(m.index, m.index + 1400);
    const countMatch = badge.match(/bg-zinc-400\/15[\s\S]{0,500}?>\s*(\d+)\s*techniques?\s*<\/div>/);
    const coverageMatch = badge.match(/bg-green-400\/20[\s\S]{0,500}?>\s*(\d+)%\s*covered\s*<\/div>/);
    tacticPositions.push({
      idx: m.index,
      name: stripTags(m[1]),
      count: countMatch ? parseInt(countMatch[1], 10) : 0,
      coveragePct: coverageMatch ? parseInt(coverageMatch[1], 10) : null,
    });
  }

  cardRe.lastIndex = 0;
  let cm;
  while ((cm = cardRe.exec(main)) !== null) {
    let tactic = tacticPositions[0] ?? { name: 'Unknown', count: 0 };
    for (const t of tacticPositions) {
      if (t.idx <= cm.index) tactic = t;
    }
    if (tactic.name !== currentTactic) {
      currentTactic = tactic.name;
    }
    techniques.push({
      patternId: parseInt(cm[1], 10),
      techniqueId: cm[2],
      name: cm[3],
      tactic: currentTactic,
      rules: cm[4] ? parseInt(cm[4], 10) : 0,
    });
  }

  const tactics = {};
  for (const t of tacticPositions) {
    tactics[t.name] = { techniqueCount: t.count, coveragePct: t.coveragePct };
  }
  return { techniques, tactics };
}

/* ------------------------------------------------------------------ */
/* 2. Malware list pages                                                */
/* ------------------------------------------------------------------ */

function parseMalwareCard(cardHtml) {
  const idMatch = cardHtml.match(/malware\/(\d+)" wire:navigate/);
  const nameMatch = cardHtml.match(/<h3[^>]*>\s*([^<]+?)\s*<\/h3>/);
  const tlpMatch = cardHtml.match(/>\s*(TLP:\w+)\s*</);
  const confidenceMatch = cardHtml.match(/w-8 text-right">\s*(\d+)%</);
  const categoryMatch = cardHtml.match(
    /<span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">\s*([^<]+?)\s*<\/span>/
  );
  const statusMatch = cardHtml.match(
    /text-xs font-medium text-(?:green|red)-\d+[^"]*">\s*([^<]+?)\s*<\/span>/
  );
  return {
    id: idMatch ? parseInt(idMatch[1], 10) : null,
    name: nameMatch ? stripTags(nameMatch[1]) : 'Unknown',
    category: categoryMatch ? stripTags(categoryMatch[1]) : null,
    tlp: tlpMatch ? tlpNormalize(tlpMatch[1]) : null,
    confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : null,
    status: statusMatch ? stripTags(statusMatch[1]) : null,
  };
}

function parseMalwareList(html) {
  const chunks = html.split(
    'class="group relative bg-white dark:bg-zinc-900 rounded-xl border'
  );
  const items = [];
  for (const chunk of chunks.slice(1)) {
    const item = parseMalwareCard(chunk);
    if (item.id) items.push(item);
  }
  return items;
}

async function syncMalware() {
  const listDir = join(STAGING, 'malware/pages');
  let page = 1;
  const merged = [];
  while (true) {
    if (MALWARE_PAGES > 0 && page > MALWARE_PAGES) break;
    const file = join(listDir, `page-${page}.json`);
    if (existsSync(file)) {
      const items = JSON.parse(readFileSync(file, 'utf8'));
      merged.push(...items);
      if (items.length < 15) break;
      page++;
      malwarePagesDone++;
      continue;
    }
    const url = `${BASE_URL}/malware?page=${page}`;
    const html = await fetchWithRetry(url);
    const items = parseMalwareList(html);
    writeFileSync(file, JSON.stringify(items));
    merged.push(...items);
    console.log(`  malware page ${page}: ${items.length} families`);
    if (items.length < 15) break;
    page++;
    malwarePagesDone++;
    if (paged(malwarePagesDone, 615)) break;
    if (GAP_MS > 0) await sleep(GAP_MS);
  }
  writeStaged('malware/list.json', {
    source: 'threaticon.com/malware',
    syncedAt: new Date().toISOString(),
    families: merged,
  });
  return merged;
}

/* ------------------------------------------------------------------ */
/* 3. Actor list pages                                                  */
/* ------------------------------------------------------------------ */

function parseActorCard(cardHtml) {
  const idMatch = cardHtml.match(/threat-actors\/(\d+)" wire:navigate/);
  const nameMatch = cardHtml.match(/<h3[^>]*>\s*([^<]+?)\s*<\/h3>/);
  const tlpMatch = cardHtml.match(/>\s*(TLP:\w+)\s*</);
  const confidenceMatch = cardHtml.match(/w-8 text-right">\s*(\d+)%</);
  const statusMatch = cardHtml.match(
    /<span class="w-2 h-2 rounded-full shrink-0 bg-\w+"><\/span>\s*<!--\[if BLOCK\]><!\[endif\]-->\s*<span class="text-xs font-medium text-(?:green|red|zinc)-\d+[^"]*">\s*([^<]+?)\s*<\/span>/
  );
  // type + country rows: spans with icon + text, before the description
  const rowMatches = [...cardHtml.matchAll(
    /<span class="inline-flex items-center gap-1">\s*([\s\S]{0,600}?)<\/span>/g
  )];
  let type = null;
  let country = null;
  for (const row of rowMatches) {
    const text = stripTags(row[1]);
    if (!text) continue;
    if (/^[A-Za-z][A-Za-z\s\-]{1,24}$/.test(text) && !/^[A-Z]{2}$/.test(text)) {
      if (!type) type = text;
    } else if (/^[A-Z]{2}$/.test(text) || /^[A-Z]{2,3}-[A-Z]{2,3}$/.test(text)) {
      country = text;
    }
  }
  const aliasMatch = cardHtml.match(
    /<p class="text-xs text-zinc-400 mt-0\.5 truncate">\s*([^<]+?)\s*<\/p>/
  );
  const descMatch = cardHtml.match(
    /<p class="text-sm[^"]*">\s*([\s\S]{0,400}?)<\/p>/
  );
  const typeBadges = [...cardHtml.matchAll(
    /style="background-color: [^"]+">\s*([^<]+?)\s*<\/span>/g
  )].map((m) => stripTags(m[1])).filter(Boolean);
  return {
    id: idMatch ? parseInt(idMatch[1], 10) : null,
    name: nameMatch ? stripTags(nameMatch[1]) : 'Unknown',
    aliases: aliasMatch ? stripTags(aliasMatch[1]) : null,
    type,
    country,
    status: statusMatch ? stripTags(statusMatch[1]) : null,
    tlp: tlpMatch ? tlpNormalize(tlpMatch[1]) : null,
    confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : null,
    tags: typeBadges,
    description: descMatch ? stripTags(descMatch[1]) : null,
  };
}

function parseActorList(html) {
  const chunks = html.split(
    'class="group relative bg-white dark:bg-zinc-900 rounded-xl border'
  );
  const items = [];
  for (const chunk of chunks.slice(1)) {
    const item = parseActorCard(chunk);
    if (item.id) items.push(item);
  }
  return items;
}

async function syncActorsList() {
  const listDir = join(STAGING, 'actors/pages');
  let page = 1;
  const merged = [];
  while (true) {
    const file = join(listDir, `page-${page}.json`);
    if (existsSync(file)) {
      const items = JSON.parse(readFileSync(file, 'utf8'));
      merged.push(...items);
      if (items.length < 15) break;
      page++;
      actorPagesDone++;
      continue;
    }
    const url = `${BASE_URL}/threat-actors?page=${page}`;
    const html = await fetchWithRetry(url);
    const items = parseActorList(html);
    writeFileSync(file, JSON.stringify(items));
    merged.push(...items);
    console.log(`  actor page ${page}: ${items.length} actors`);
    if (items.length < 15) break;
    page++;
    actorPagesDone++;
    if (paged(actorPagesDone, 100)) break;
    if (ACTORS_PAGES > 0 && actorPagesDone >= ACTORS_PAGES) break;
    if (GAP_MS > 0) await sleep(GAP_MS);
  }
  writeStaged('actors/index.json', {
    source: 'threaticon.com/threat-actors',
    syncedAt: new Date().toISOString(),
    actors: merged,
  });
  return merged;
}

/* ------------------------------------------------------------------ */
/* 4. Actor detail pages (from sitemap)                                */
/* ------------------------------------------------------------------ */

async function fetchSitemapActorIds() {
  const cached = readStaged('sitemap-actors.json');
  if (cached && cached.ids?.length) return cached.ids;
  const xml = await fetchWithRetry(`${BASE_URL}/sitemap.xml`);
  const ids = [];
  const re = /<loc>[^<]*threat-actors\/(\d+)[^<]*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) ids.push(parseInt(m[1], 10));
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  writeStaged('sitemap-actors.json', {
    source: 'threaticon.com/sitemap.xml',
    fetchedAt: new Date().toISOString(),
    ids: unique,
  });
  console.log(`  sitemap: ${unique.length} actor URLs`);
  return unique;
}

function parseActorDetail(html) {
  const compStart = html.indexOf('wire:name="threat-actors.show"');
  if (compStart < 0) return null;
  const main = html.slice(compStart);

  // Section boundaries: both the profile block headers and the amber/blue
  // sidebar headers use the same heading paragraph shape.
  const headerRe =
    /<p class="text-xs (?:font-semibold text-(?:amber|blue)-\d+|font-medium text-zinc-\d+)[^"]*">\s*([^<]+?)\s*<\/p>/g;
  const headers = [];
  let m;
  while ((m = headerRe.exec(main)) !== null) {
    headers.push({ idx: m.index, name: stripTags(m[1]) });
  }
  const section = (name) => {
    const start = headers.find((h) => h.name === name);
    if (!start) return '';
    const end = headers.find((h) => h.idx > start.idx);
    return main.slice(start.idx, end ? end.idx : main.length);
  };
  const badges = (block) =>
    [...block.matchAll(/<div data-flux-badge="data-flux-badge"[^>]*>\s*([^<]+?)\s*<\/div>/g)]
      .map((x) => stripTags(x[1]))
      .filter(Boolean);

  const name = main.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/);
  const mitre = main.match(/attack\.mitre\.org\/groups\/([A-Z0-9\-]+)\//);
  const tlp = main.match(/>\s*(TLP:\w+)\s*</);
  const statusMatch = main.match(
    />\s*(Active|Inactive|Retired|Dormant|Unknown)\s*<\/span>\s*<\/div>/i
  );
  const killChain = main.match(/\/graph\/kill-chain\?entity=([a-z_]+)%3A(\d+)/);

  // Sidebar details <dl> block
  const dlStart = main.indexOf('<dl class="space-y-3">');
  const dlEnd = main.indexOf('</dl>', dlStart);
  const dl = dlStart >= 0 && dlEnd > dlStart ? main.slice(dlStart, dlEnd + 5) : '';
  const dt = (label) => {
    const i = dl.indexOf(`>${label}</dt>`);
    if (i < 0) return null;
    const dd = dl.slice(i, i + 700).match(/<dd[^>]*>([\s\S]*?)<\/dd>/);
    return dd ? stripTags(dd[1]) : null;
  };
  const mitreId = dt('MITRE ID');
  const typeIdx = dl.indexOf('>Type</dt>');
  const typesBlock = typeIdx >= 0 ? dl.slice(typeIdx, typeIdx + 1200) : '';
  const types = [...typesBlock.matchAll(
    /<div data-flux-badge="data-flux-badge"[^>]*>\s*([^<]+?)\s*<\/div>/g
  )]
    .map((x) => stripTags(x[1]))
    .filter(Boolean);
  const resourceLevel = dt('Resource Level');
  const motivation = dt('Primary Motivation');
  const countryOfOrigin = dt('Country of Origin');
  const added = dt('Added');
  const sophistication = dl.match(
    /Sophistication<\/dt>[\s\S]{0,800}?<span class="text-xs font-medium[^"]*">\s*([^<]+?)\s*<\/span>/
  );
  const confidence = dl.match(/Confidence<\/dt>[\s\S]{0,500}?w-8 text-right">\s*(\d+)%/);

  // Sidebar tags (violet badges, before the Details block)
  const sidebarEnd = dlStart >= 0 ? dlStart : main.length;
  const sidebar = main.slice(0, sidebarEnd);
  const tags = [...new Set(
    [...sidebar.matchAll(/<div data-flux-badge="data-flux-badge"[^>]*bg-violet[^>]*>\s*([^<]+?)\s*<\/div>/g)]
      .map((x) => stripTags(x[1]))
      .filter(Boolean)
  )];

  // Scoped sections
  const sectors = badges(section('Targeted Sectors'));
  const countries = badges(section('Targeted Countries / Regions'))
    .filter((c) => /^[A-Z]{2}$/.test(c));
  const tactics = badges(section('MITRE ATT&CK Tactics'));
  const techniques = [...new Set(
    badges(section('ATT&CK Techniques'))
      .filter((t) => /^T\d/.test(t))
      .map((t) => t.replace(/\s*:\s*.+$/, ''))
  )];
  const tools = badges(section('Software / Tooling'));
  const execSummary = section('Executive Summary');
  const description = execSummary
    ? stripTags(execSummary.replace(/Executive Summary/, '')).slice(0, 2000)
    : null;
  const goals = stripTags(section('Goals & Targeting').replace(/Goals & Targeting/, '')).slice(0, 2000) || null;
  const keyCapabilities = [...(section('Key Capabilities').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g))]
    .map((x) => stripTags(x[1]))
    .filter(Boolean);
  const recommendedActions = [...(section('Recommended Actions').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g))]
    .map((x) => stripTags(x[1]))
    .filter(Boolean);
  const iocPatterns = [...(section('IOC Patterns').matchAll(/<li[^>]*>([\s\S]*?)<\/li>|<div[^>]*>([^<]{2,120}?)<\/div>/g))]
    .map((x) => stripTags(x[1] || x[2]))
    .filter(Boolean);
  const campaignsText = stripTags(section('Campaigns & Victims').replace(/Campaigns & Victims/, '')).slice(0, 1200) || null;

  return {
    name: name ? stripTags(name[1]) : null,
    mitreId,
    tlp: tlp ? tlpNormalize(tlp[1]) : null,
    status: statusMatch ? stripTags(statusMatch[1]) : null,
    killChainEntity: killChain ? killChain[1] : null,
    types,
    sophistication: sophistication ? stripTags(sophistication[1]) : null,
    resourceLevel,
    motivation,
    countryOfOrigin,
    confidence: confidence ? parseInt(confidence[1], 10) : null,
    added,
    tags,
    targetedSectors: sectors,
    targetedCountries: countries,
    tactics,
    techniques,
    tools,
    iocPatterns,
    keyCapabilities,
    recommendedActions,
    campaignsText,
    description,
    goals,
  };
}

async function syncActorDetails(ids) {
  const detailsDir = join(STAGING, 'actors/details');
  const toFetch = [];
  for (const id of ids) {
    const file = join(detailsDir, `${id}.json`);
    if (!existsSync(file)) toFetch.push(id);
  }
  if (SKIP_DETAILS) {
    console.log(`  --skip-details: ${toFetch.length} actor details skipped`);
    return;
  }
  let limit = toFetch.length;
  if (ACTORS_LIMIT > 0) limit = Math.min(limit, ACTORS_LIMIT);
  console.log(`  fetching ${limit} actor detail pages (concurrency ${CONCURRENCY}, gap ${GAP_MS}ms)`);
  await pool(toFetch.slice(0, limit), CONCURRENCY, async (id) => {
    try {
      const html = await fetchWithRetry(`${BASE_URL}/threat-actors/${id}`);
      const parsed = parseActorDetail(html);
      if (!parsed) throw new Error('no main component found');
      writeFileSync(
        join(detailsDir, `${id}.json`),
        JSON.stringify({ id, fetchedAt: new Date().toISOString(), ...parsed })
      );
      detailFetched++;
    } catch (err) {
      console.error(`  ✘ actor ${id}: ${err instanceof Error ? err.message : err}`);
    }
    if ((detailFetched + detailSkipped) % 50 === 0) {
      console.log(`    details: ${detailFetched} fetched`);
    }
  }, GAP_MS);
  console.log(`  actor details: ${detailFetched} fetched, ${detailSkipped} cached`);
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log('threaticon.com sync — staging into', STAGING);
  ensureStaging();

  console.log('• detection coverage');
  const coverageHtml = await fetchWithRetry(`${BASE_URL}/detection-coverage`);
  const coverage = parseCoverage(coverageHtml);
  writeStaged('coverage.json', {
    source: 'threaticon.com/detection-coverage',
    syncedAt: new Date().toISOString(),
    techniqueCount: coverage.techniques.length,
    tactics: coverage.tactics,
    techniques: coverage.techniques,
  });
  console.log(`  ${coverage.techniques.length} techniques across ${Object.keys(coverage.tactics).length} tactics`);

  console.log('• malware catalog');
  const malware = await syncMalware();
  console.log(`  ${malware.length} malware families staged`);

  console.log('• actor catalog');
  const actors = await syncActorsList();
  console.log(`  ${actors.length} actors staged`);

  const ids = await fetchSitemapActorIds();
  await syncActorDetails(ids);

  const detailCount = existsSync(join(STAGING, 'actors/details'))
    ? readdirSync(join(STAGING, 'actors/details')).length
    : 0;
  console.log(`\n✔ Staged: coverage (${coverage.techniques.length}), malware (${malware.length}), actors (${actors.length}, ${detailCount} details)`);
  console.log(`\nNext: node scripts/build-threaticon.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
