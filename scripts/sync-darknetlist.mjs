#!/usr/bin/env node
/**
 * Sync the darknetlist.is Tor site directory into a local staging file.
 *
 * darknetlist.is is a free, static-HTML directory of Tor-accessible
 * sites. A scanner on the server walks the list through a fresh SOCKS
 * circuit every 30 minutes and rewrites the page with whatever
 * responded. We fetch the HTML, parse it, and write a normalised JSON
 * staging file that the build script slices into the threat-intel
 * manifest tree.
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml) — weekly
 *   2. Manual: `node scripts/sync-darknetlist.mjs`
 *
 * After sync, run `node scripts/build-darknetlist.mjs` to slice the
 * staged data into public/data/threat-intel/darknet/.
 *
 * Source: https://darknetlist.is/ (free, no API key, static HTML)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const STAGING_FILE = join(STAGING, 'darknetlist.json');
const DARKNETLIST_URL = 'https://darknetlist.is/';

function ensureStaging() {
  if (!existsSync(STAGING)) mkdirSync(STAGING, { recursive: true });
}

async function fetchHtml() {
  console.log('• darknetlist.is');
  console.log(`  → ${DARKNETLIST_URL}`);
  const res = await fetch(DARKNETLIST_URL, {
    headers: {
      'user-agent': 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed: ${DARKNETLIST_URL} → ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  console.log(`    fetched ${html.length} bytes`);
  return html;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

/**
 * Parse the darknetlist.is static HTML into a normalised JSON object.
 *
 * The page is a single static HTML file with <section class="br" id="cat-<id>">
 * blocks, each containing <article> entries for individual sites.
 */
function parseHtml(html) {
  // Rebuilt timestamp from the footer
  const rebuiltMatch = html.match(/REBUILT\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z?/);
  const rebuiltAt = rebuiltMatch ? rebuiltMatch[1] + 'Z' : new Date().toISOString();

  // Parse each category section
  const sectionRe = /<section class="br" id="cat-([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g;
  const categories = [];
  const sites = [];
  let sectionMatch;

  while ((sectionMatch = sectionRe.exec(html)) !== null) {
    const categoryId = sectionMatch[1];
    const sectionHtml = sectionMatch[2];

    // Category header
    const h2 = sectionHtml.match(/<h2 class="t">([A-Z]+)<\/h2>/);
    const title = h2 ? h2[1] : categoryId.toUpperCase();
    const descMatch = sectionHtml.match(/<p class="ac">(.*?)<\/p>/);
    const description = descMatch ? decodeEntities(descMatch[1]) : '';
    const statsMatches = [...sectionHtml.matchAll(/<li><span>([A-Z]+)<\/span><b>(\d+)<\/b><\/li>/g)];
    const stats = {};
    for (const m of statsMatches) {
      stats[m[1].toLowerCase()] = parseInt(m[2], 10);
    }

    // Parse articles (sites) within this section
    const articleRe = /<article class="bo[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    const articles = [];
    let articleMatch;
    while ((articleMatch = articleRe.exec(sectionHtml)) !== null) {
      const a = articleMatch[1];
      const name = a.match(/<span class="an">(.*?)<\/span>/);
      const upCount = a.match(/<span class="o">(\d+)<\/span>/);
      const totalCount = a.match(/<span class="m">(\d+)<\/span>/);
      // Status: 'bp bj' = ONLINE, 'bp ba' = DOWN. The 'n' span always says 'UP' (a label).
      const isOnline = /<span class="bp\s+bj">/.test(a);
      const isDown = /<span class="bp\s+ba">/.test(a);
      const status = isOnline ? 'up' : isDown ? 'down' : 'unknown';
      const dwdId = a.match(/<span class="aw">(DWD-[A-F0-9]+-\d+)<\/span>/);
      const url = a.match(/<a class="ak" href="([^"]+)"/);
      const onion = a.match(/<span class="ax">(.*?)<\/span>/);
      const latency = a.match(/<span class="au">(.*?)<\/span>/);
      const code = a.match(/<b>CODE<\/b>\s*([^<]+)/);
      const size = a.match(/<b>SIZE<\/b>\s*([^<]+)/);
      const fp = a.match(/<b>FP<\/b>\s*([A-F0-9]+)/);
      const recommended = a.includes('★ RECOMMENDED') || a.includes('RECOMMENDED');

      const site = {
        name: name ? decodeEntities(name[1]) : 'Unknown',
        dwdId: dwdId ? dwdId[1] : null,
        url: url ? url[1] : null,
        onion: onion ? decodeEntities(onion[1]) : null,
        category: categoryId,
        status,
        upMirrors: upCount ? parseInt(upCount[1], 10) : 0,
        totalMirrors: totalCount ? parseInt(totalCount[1], 10) : 1,
        latencyMs: latency && latency[1] !== '—' ? parseInt(latency[1], 10) : null,
        httpCode: code ? code[1].trim() : null,
        pageSize: size ? size[1].trim() : null,
        fingerprint: fp ? fp[1] : null,
        recommended,
      };
      articles.push(site);
      sites.push(site);
    }

    categories.push({
      id: categoryId,
      title,
      description,
      siteCount: stats.sites ?? articles.length,
      mirrorCount: stats.mirrors ?? articles.length,
      upCount: stats.up ?? 0,
      sites: articles,
    });
  }

  return {
    source: 'darknetlist.is',
    url: DARKNETLIST_URL,
    rebuiltAt,
    syncedAt: new Date().toISOString(),
    categoryCount: categories.length,
    siteCount: sites.length,
    categories,
    sites,
  };
}

async function main() {
  console.log('darknetlist.is sync — staging into', STAGING_FILE);
  ensureStaging();

  const html = await fetchHtml();
  const parsed = parseHtml(html);

  writeFileSync(STAGING_FILE, JSON.stringify(parsed, null, 2));
  console.log(`\n✔ Staged ${parsed.siteCount} sites across ${parsed.categoryCount} categories`);
  console.log(`    rebuilt at: ${parsed.rebuiltAt}`);
  for (const cat of parsed.categories) {
    console.log(`    ${cat.title.padEnd(12)} ${String(cat.sites.length).padStart(3)} sites  (${cat.upCount} up)`);
  }
  console.log(`\nNext: node scripts/build-darknetlist.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
