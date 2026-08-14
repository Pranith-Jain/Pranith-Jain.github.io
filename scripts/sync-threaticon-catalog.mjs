#!/usr/bin/env node
/**
 * Sync the extended threaticon.com public-preview sections into local staging
 * under threat-intel-staging/threaticon-catalog/. Complements the existing
 * scripts/sync-threaticon.mjs (actors/malware/coverage).
 *
 * Sections (all server-rendered Livewire HTML, crawlable per robots.txt):
 *
 *   1. tools                 — 95 legitimate tools used by threat actors
 *   2. mitigations           — 44 MITRE course-of-action style mitigations
 *   3. data-sources          — 106 ATT&CK data components
 *   4. detection-strategies  — 697 MITRE detection strategies
 *   5. campaigns             — 7,748 coordinated attack campaigns
 *   6. attack-patterns       — 3,087 CAPEC-style attack patterns
 *   7. vulnerabilities       — 22,190 CVEs
 *   8. indicators            — 480,188 IOCs (list pages only, no details)
 *
 * List pages: /<section>?page=N (sizes 15/25/30/50 depending on section).
 * Detail pages: /<section>/<id> — parsed from the wire:name="<s>.show"
 * component (h1 + <dl> Details block + Description paragraph).
 *
 * Options: --only <section> [--list-only|--details-only] --skip-details
 *          --concurrency N --gap-ms N --limit-pages N
 *
 * After sync, run `node scripts/build-threaticon-catalog.mjs` to slice into
 * public/data/threat-intel/threaticon-catalog/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threaticon-catalog');
const BASE_URL = 'https://threaticon.com';
const UA = 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);
const CONCURRENCY = parseInt(opt('--concurrency', '3'), 10);
const GAP_MS = parseInt(opt('--gap-ms', '400'), 10);
const ONLY = opt('--only', null);
const LIMIT_PAGES = parseInt(opt('--limit-pages', '0'), 10) || 0;
const LIST_ONLY = flag('--list-only');
const DETAILS_ONLY = flag('--details-only');

const SECTIONS = {
  tools: { pageSize: 15, detail: true, table: false },
  mitigations: { pageSize: 25, detail: true, table: true },
  'data-sources': { pageSize: 30, detail: true, table: true },
  'detection-strategies': { pageSize: 30, detail: true, table: true },
  campaigns: { pageSize: 15, detail: true, table: false },
  'attack-patterns': { pageSize: 20, detail: true, table: false },
  vulnerabilities: { pageSize: 15, detail: true, table: false },
  indicators: { pageSize: 50, detail: false, table: false },
};

let fetched = 0;
let skipped = 0;

const stagePath = (rel) => join(STAGING, rel);
const readStaged = (rel) => {
  const p = stagePath(rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const writeStaged = (rel, data) => {
  writeFileSync(stagePath(rel), JSON.stringify(data));
};

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
      const wait = status === 429 ? 15_000 * (i + 1) : 500 * (i + 1);
      console.warn(`    ⚠ ${status} on ${url} — retry ${i + 1}/${attempts} in ${wait / 1000}s`);
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

const stripTags = (s) =>
  decodeEntities(
    (s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

function tlpNormalize(raw) {
  const t = (raw ?? '').replace(/^TLP:/i, '').toLowerCase();
  if (t === 'clear') return 'white';
  return ['red', 'amber', 'green', 'white'].includes(t) ? t : null;
}

const CARDS_SPLIT = 'class="group relative bg-white dark:bg-zinc-900 rounded-xl border';
const ROWS_SPLIT = '<tr class="hover:bg-zinc-50';

function parseCard(itemHtml, section) {
  const idMatch = itemHtml.match(new RegExp(`${section}/(\\d+)"\\s+wire:navigate`));
  const id = idMatch ? parseInt(idMatch[1], 10) : null;
  const h3 = itemHtml.match(/<h3[^>]*>\s*([^<]+?)\s*<\/h3>/);
  const name = h3 ? stripTags(h3[1]) : null;
  const tlp = tlpNormalize(itemHtml.match(/>\s*(TLP:\w+)\s*</)?.[1]);
  const conf = itemHtml.match(/w-8 text-right">\s*(\d+)%/);
  const base = { id, name, tlp, confidence: conf ? parseInt(conf[1], 10) : null };
  switch (section) {
    case 'tools': {
      const status = itemHtml.match(/<span class="text-xs text-(?:green|red|zinc)-\d+[^"]*">\s*([^<]+?)\s*<\/span>/);
      const category = itemHtml.match(
        /<span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">\s*([^<]+?)\s*<\/span>/
      );
      const desc = itemHtml.match(/<p class="text-sm[^"]*">\s*([\s\S]{0,500}?)<\/p>/);
      return {
        ...base,
        status: status ? stripTags(status[1]) : null,
        category: category ? stripTags(category[1]) : null,
        description: desc ? stripTags(desc[1]) : null,
      };
    }
    case 'campaigns': {
      const status = itemHtml.match(/<span class="text-xs text-zinc-400">\s*([^<]+?)\s*<\/span>/);
      const desc = itemHtml.match(
        /<p class="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-2[^"]*">\s*([\s\S]{0,800}?)<\/p>/
      );
      return {
        ...base,
        status: status ? stripTags(status[1]) : null,
        description: desc ? stripTags(desc[1]) : null,
      };
    }
    case 'attack-patterns': {
      const cap = itemHtml.match(/font-mono text-sm font-bold text-indigo-\d+[^"]*">\s*([A-Za-z]+\d+(?:-\d+)?)/);
      const status = itemHtml.match(/text-(?:indigo|zinc)-\d+[^"]*font-medium[^"]*">\s*([^<]+?)\s*<\/span>/);
      return {
        ...base,
        techniqueId: cap ? cap[1] : null,
        status: status ? stripTags(status[1]) : null,
      };
    }
    case 'vulnerabilities': {
      const meta = itemHtml.match(
        /<p class="text-sm text-zinc-600 dark:text-zinc-400 mt-0\.5 line-clamp-1">\s*([^<]+?)\s*<\/p>/
      );
      const desc = itemHtml.match(
        /<p class="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-2[^"]*">\s*([\s\S]{0,900}?)<\/p>/
      );
      const sev = itemHtml.match(/data-flux-badge="data-flux-badge"[^>]*>([\s\S]{0,80}?)<\/div>/);
      const open = itemHtml.match(/>\s*(Open|Closed)\s*</);
      return {
        ...base,
        productCwe: meta ? stripTags(meta[1]) : null,
        description: desc ? stripTags(desc[1]) : null,
        severity: sev ? stripTags(sev[1]) : null,
        status: open ? open[1] : null,
      };
    }
    case 'indicators': {
      const type = itemHtml.match(/font-mono tracking-tight[^"]*">\s*([^<]+?)\s*<\/span>/);
      const value = itemHtml.match(/<p class="font-mono text-sm[^"]*break-all[^"]*">\s*([^<]+?)\s*<\/p>/);
      const conf = itemHtml.match(/text-(?:amber|green|red)-\d+[^"]*">\s*(\d+)%/);
      const added = itemHtml.match(/Added<\/p>\s*<p[^>]*>\s*(\d{4}-\d{2}-\d{2})/);
      return {
        ...base,
        type: type ? stripTags(type[1]) : null,
        value: value ? stripTags(value[1]) : null,
        confidence: conf ? parseInt(conf[1], 10) : null,
        added: added ? added[1] : null,
      };
    }
    default:
      return base;
  }
}

function parseRow(rowHtml, section) {
  const idMatch = rowHtml.match(new RegExp(`${section}/(\\d+)"\\s*wire:navigate`));
  const id = idMatch ? parseInt(idMatch[1], 10) : null;
  const code = rowHtml.match(/font-mono text-xs font-semibold[^"]*">\s*([A-Za-z0-9\-]+?)\s*<\/span>/);
  const link = rowHtml.match(/class="font-medium[^"]*">\s*([^<]+?)\s*<\/a>/);
  const desc = rowHtml.match(/<p class="text-xs text-zinc-400 mt-0\.5 line-clamp-1">\s*([^<]+?)\s*<\/p>/);
  const tds = [...rowHtml.matchAll(/<td class="px-4 py-3[^"]*">([\s\S]*?)<\/td>/g)]
    .map((x) => stripTags(x[1]))
    .filter(Boolean);
  return {
    id,
    code: code ? stripTags(code[1]) : null,
    name: link ? stripTags(link[1]) : null,
    description: desc ? stripTags(desc[1]) : null,
    columns: tds.slice(2).map((c) => c.replace(/^\s*(\d+)\s*$/, '$1')),
  };
}

function parseList(html, section) {
  const isTable = SECTIONS[section].table;
  const chunks = html.split(isTable ? ROWS_SPLIT : CARDS_SPLIT);
  const items = [];
  for (const chunk of chunks.slice(1)) {
    const item = isTable ? parseRow(chunk, section) : parseCard(chunk, section);
    if (item.id) items.push(item);
  }
  return items;
}

async function syncList(section) {
  const { pageSize } = SECTIONS[section];
  const listDir = join(STAGING, section, 'pages');
  mkdirSync(listDir, { recursive: true });
  let page = 1;
  const merged = [];
  while (true) {
    if (LIMIT_PAGES > 0 && page > LIMIT_PAGES) break;
    const file = join(listDir, `page-${page}.json`);
    if (existsSync(file)) {
      const items = JSON.parse(readFileSync(file, 'utf8'));
      merged.push(...items);
      if (items.length < pageSize) break;
      page++;
      continue;
    }
    const html = await fetchWithRetry(`${BASE_URL}/${section}?page=${page}`);
    const items = parseList(html, section);
    writeFileSync(file, JSON.stringify(items));
    merged.push(...items);
    if (merged.length % 500 < pageSize) {
      console.log(`  ${section} page ${page}: ${items.length} items (${merged.length} total)`);
    }
    if (items.length < pageSize) break;
    page++;
    await new Promise((r) => setTimeout(r, Math.max(400, GAP_MS)));
  }
  const meta = readStaged(`${section}/list.json`);
  writeStaged(`${section}/list.json`, {
    source: `${BASE_URL}/${section}`,
    syncedAt: new Date().toISOString(),
    itemCount: merged.length,
    prevCount: meta?.itemCount ?? null,
    items: merged,
  });
  console.log(`✔ ${section}: ${merged.length} items from ${page} pages`);
  return merged;
}

/* ------------------------------------------------------------------ */
/* Detail parsing (wire:name="<section>.show" components)              */
/* ------------------------------------------------------------------ */

function mainComp(html, section) {
  const marker = `wire:name="${section}.show"`;
  const i = html.indexOf(marker);
  return i < 0 ? null : html.slice(i);
}

function parseDl(main) {
  const start = main.search(/<dl class="space-y-\d/);
  if (start < 0) return {};
  const end = main.indexOf('</dl>', start);
  const dl = main.slice(start, end + 5);
  const out = {};
  for (const m of dl.matchAll(/<dt[^>]*>\s*([^<]+?)\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    out[stripTags(m[1])] = stripTags(m[2]);
  }
  return out;
}

const descRe = /Description<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/;
const badgeRe = /data-flux-badge="data-flux-badge"[^>]*>\s*([^<]+?)\s*<\/div>/g;

function parseDetail(html, section) {
  const main = mainComp(html, section);
  if (!main) return null;
  const h1 = main.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/);
  const name = h1 ? stripTags(h1[1]) : null;
  const tlp = tlpNormalize(main.match(/>\s*(TLP:\w+)\s*</)?.[1]);
  const descM = main.match(descRe);
  const description = descM ? stripTags(descM[1]).slice(0, 2500) : null;
  const badges = [...main.matchAll(badgeRe)].map((x) => stripTags(x[1])).filter(Boolean);
  const dl = parseDl(main);
  const base = { name, tlp, description, badges, ...dl };
  switch (section) {
    case 'campaigns': {
      const status = main.match(/>\s*(Active|Inactive|Retired|Dormant|Unknown)\s*<\/div>\s*<!--/i);
      return {
        id: null,
        name,
        tlp,
        status: status ? status[1] : null,
        confidence: dl['Confidence'] ? parseInt(dl['Confidence'], 10) : null,
        firstSeen: dl['First Seen'] ?? null,
        lastSeen: dl['Last Seen'] ?? null,
        added: dl['Added'] ?? null,
        description,
      };
    }
    case 'attack-patterns': {
      const cap = main.match(/font-mono[^>]*>\s*([A-Za-z]+\d+(?:-\d+)?)\s*<\/span>/);
      return {
        name,
        tlp,
        techniqueId: cap ? cap[1] : null,
        added: dl['Added'] ?? null,
        description,
      };
    }
    case 'vulnerabilities': {
      const meta = main.match(/<p class="text-base font-medium[^"]*">\s*([^<]+?)\s*<\/p>/);
      const refs = [
        ...main.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,500}?([A-Za-z0-9][^<]{0,40}?)<\/a>/g),
      ]
        .map((x) => ({ url: x[1], label: stripTags(x[2]) }))
        .filter((x) => !x.url.startsWith(BASE_URL) && !/\/login\//.test(x.url));
      return {
        name,
        tlp,
        cveId: name,
        productCwe: meta ? stripTags(meta[1]) : null,
        severity: badges.find((b) => /^(Critical|High|Medium|Low|Info)/.test(b)) ?? null,
        status: badges.find((b) => /^(Open|Closed)/.test(b)) ?? null,
        cvssScore: dl['CVSS Score'] ?? null,
        cvssVector: dl['CVSS Vector'] ?? null,
        confidence: dl['Confidence'] ? parseInt(dl['Confidence'], 10) : null,
        published: dl['Published'] ?? null,
        lastModified: dl['Last Modified'] ?? null,
        description,
        references: refs,
      };
    }
    case 'tools': {
      const status = badges.find((b) => /^(Active|Inactive)/.test(b)) ?? null;
      const category = main.match(/bg-cyan-\d+[^"]*">\s*([^<]+?)\s*<\/span>/);
      const aliases = main.match(/Also known as:\s*([^<]{2,200}?)<\/p>/);
      return {
        name,
        tlp,
        status,
        category: category ? stripTags(category[1]) : null,
        aliases: aliases ? stripTags(aliases[1]) : null,
        confidence: dl['Confidence'] ? parseInt(dl['Confidence'], 10) : null,
        added: dl['Added'] ?? null,
        description,
      };
    }
    case 'mitigations': {
      const techniques = [
        ...main.matchAll(/\/attack-patterns\/(\d+)"\s*wire:navigate\s*title="(T\d+(?:\.\d+)?)[^"]*"/g),
      ].map((x) => ({ patternId: parseInt(x[1], 10), techniqueId: x[2] }));
      return {
        name,
        tlp,
        mitreId: dl['MITRE ID'] ?? null,
        stixId: dl['STIX ID'] ?? null,
        techniqueCoverage: dl['Technique Coverage'] ?? null,
        added: dl['Added'] ?? null,
        description,
        techniques,
      };
    }
    case 'data-sources': {
      const counts = main.match(
        /(\d+)<\/strong>\s+analytic\(s\)[\s\S]{0,120}?(\d+)<\/strong>\s+detection strategy\(ies\)/
      );
      const analytics = [
        ...main.matchAll(/font-mono text-xs font-semibold text-indigo-\d+[^"]*">\s*(AN\d+)\s*<\/span>/g),
      ].map((x) => x[1]);
      return {
        name,
        tlp,
        dcId: dl['MITRE ID'] ?? (name ? name.split(' ')[0] : null),
        analyticCount: counts ? parseInt(counts[1], 10) : null,
        strategyCount: counts ? parseInt(counts[2], 10) : null,
        added: dl['Added'] ?? null,
        description,
        analytics,
      };
    }
    case 'detection-strategies': {
      const counts = main.match(
        /(\d+)<\/strong>\s+analytic\(s\)[\s\S]{0,120}?(\d+)<\/strong>\s+technique\(s\)\s+detected/
      );
      const analytics = [
        ...main.matchAll(/font-mono text-xs font-semibold text-indigo-\d+[^"]*">\s*(AN\d+)\s*<\/span>/g),
      ].map((x) => x[1]);
      return {
        name,
        tlp,
        detId: dl['MITRE ID'] ?? null,
        stixId: dl['STIX ID'] ?? null,
        analyticCount: counts ? parseInt(counts[1], 10) : null,
        techniqueCount: counts ? parseInt(counts[2], 10) : null,
        description,
        analytics,
      };
    }
    default:
      return base;
  }
}

async function syncDetails(section, items) {
  const detailsDir = join(STAGING, section, 'details');
  mkdirSync(detailsDir, { recursive: true });
  const toFetch = [];
  for (const item of items) {
    const file = join(detailsDir, `${item.id}.json`);
    if (!existsSync(file)) toFetch.push(item.id);
  }
  if (toFetch.length === 0) {
    console.log(`✔ ${section}: ${items.length} details already cached`);
    return;
  }
  if (flag('--skip-details')) {
    console.log(`  --skip-details: ${toFetch.length} ${section} details skipped`);
    return;
  }
  console.log(`  fetching ${toFetch.length} ${section} details (concurrency ${CONCURRENCY}, gap ${GAP_MS}ms)`);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, async () => {
    while (cursor < toFetch.length) {
      const id = toFetch[cursor++];
      try {
        const html = await fetchWithRetry(`${BASE_URL}/${section}/${id}`);
        const parsed = parseDetail(html, section);
        if (!parsed) throw new Error('no main component found');
        writeFileSync(
          join(detailsDir, `${id}.json`),
          JSON.stringify({ id, fetchedAt: new Date().toISOString(), ...parsed })
        );
        fetched++;
      } catch (err) {
        console.error(`  ✘ ${section} ${id}: ${err instanceof Error ? err.message : err}`);
      }
      if ((fetched + skipped) % 100 === 0) {
        console.log(`    details: ${fetched} fetched`);
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
  });
  await Promise.all(runners);
  console.log(`✔ ${section}: ${fetched} details fetched, ${skipped} cached`);
}

/* ------------------------------------------------------------------ */

async function main() {
  const sections = ONLY ? [ONLY] : Object.keys(SECTIONS);
  for (const section of sections) {
    if (!SECTIONS[section]) {
      console.error(`unknown section: ${section} (expected: ${Object.keys(SECTIONS).join(', ')})`);
      process.exit(1);
    }
    mkdirSync(stagePath(section), { recursive: true });
    let items = null;
    if (!DETAILS_ONLY) {
      items = await syncList(section);
    } else {
      const list = readStaged(`${section}/list.json`);
      if (!list?.items?.length) {
        console.error(`  --details-only but ${section}/list.json missing`);
        continue;
      }
      items = list.items;
    }
    if (SECTIONS[section].detail && !LIST_ONLY) {
      await syncDetails(section, items);
    }
  }
  console.log(`\n✔ Done. Next: node scripts/build-threaticon-catalog.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
