#!/usr/bin/env node
/**
 * Sync PCMedicalist Intelligence Feed digests from GitHub.
 *
 * Fetches the rolling digest manifest (index.json) and, for dates that are
 * new or changed since the last sync, the per-day feed.json + summary.json +
 * posts.json into pcmedicalist-staging/. The staging dir doubles as a cache:
 * a day is only re-downloaded when its pushed_at changes, so the routine
 * daily run only pulls the newest ~2 digests (~4.6 MB each) instead of the
 * whole 24-day archive every time.
 *
 * Source: https://github.com/PCMedicalist/pcmedicalist-intellegence-feed
 * License: CC BY 4.0 (attribution via in-data "source" field satisfies)
 *
 * After sync, run `node scripts/build-pcmedicalist.mjs`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'pcmedicalist-staging');
const STAGING_META = join(STAGING, '_meta.json');

const REPO = 'PCMedicalist/pcmedicalist-intellegence-feed';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

// The GitHub feed repo has been known to go stale while the app site keeps
// publishing (observed 2026-08-11..14: repo stuck at 08-10). The app site
// renders each digest as static HTML — layer headers + item <li> with title,
// href, source, and trust score — which is enough to rebuild a slim
// feed.json so the SPA keeps showing fresh digests.
const APP_BASE = 'https://app.pcmedicalist.com';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'pranithjain-pcmedicalist-sync/1.0 (+https://pranithjain.qzz.io)',
      accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'pranithjain-pcmedicalist-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function loadMeta() {
  if (!existsSync(STAGING_META)) return {};
  try {
    return JSON.parse(readFileSync(STAGING_META, 'utf8'));
  } catch {
    return {};
  }
}

async function syncDate(entry, meta) {
  const { date, pushed_at } = entry;
  if (meta[date] === pushed_at) {
    console.log(`  ─ ${date} (unchanged)`);
    return { date, skipped: true };
  }
  const dayDir = join(STAGING, date);
  mkdirSync(dayDir, { recursive: true });
  const base = `${RAW_BASE}/${entry.path}`;
  console.log(`  → ${date}`);
  for (const [file, name] of [
    ['feed.json', 'feed.json'],
    ['summary.json', 'summary.json'],
    ['posts.json', 'posts.json'],
  ]) {
    try {
      const text = await fetchText(`${base}/${file}`);
      writeFileSync(join(dayDir, name), text);
      console.log(`    wrote ${file} (${text.length} bytes)`);
    } catch (err) {
      console.error(`    ⚠ ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { date, skipped: false, pushed_at };
}

/** Fetch the app site's digest listing and return the dates it advertises. */
async function fetchAppDates() {
  const html = await fetchText(`${APP_BASE}/intel`);
  const dates = [...html.matchAll(/\/intel\/(20\d{2}-\d{2}-\d{2})/g)].map((m) => m[1]);
  return [...new Set(dates)].sort();
}

/** Strip <script>/<style> + HTML comments so server-rendered digest HTML is clean to parse. */
function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rebuild feed.json/summary.json/posts.json from the app site's rendered
 * digest page (used when the GitHub feed repo is stale). The page renders
 * each layer as <h3>N. Name (count)</h3> followed by <li> items carrying
 * title/href/source/trust; the masthead carries feed counts; the two briefs
 * (Security & Standards / Engineering & Research) become postA/postB.
 */
async function syncFromApp(date) {
  const html = await fetchText(`${APP_BASE}/intel/${date}`);
  const main = cleanHtml(html);

  // ── Masthead counts: "38 feeds · 3675 raw → 3612 deduped items" ──
  // Scope to the <main> element so the <title>/<meta> don't match first.
  const mainEl = main.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? main;
  const feedsM = mainEl.match(/(\d+)\s*feeds?/i);
  const rawM = mainEl.match(/(\d+)\s*raw/i);
  const dedupM = mainEl.match(/(\d+)\s*deduped/i);
  const summary = {
    feeds_total: feedsM ? parseInt(feedsM[1], 10) : null,
    items_raw: rawM ? parseInt(rawM[1], 10) : null,
    items_deduped: dedupM ? parseInt(dedupM[1], 10) : null,
    per_feed: {},
    source: 'app.pcmedicalist.com (app-site fallback — GitHub feed repo stale)',
  };

  // ── Layers: <h3>N. Name (count)</h3> + following <ul><li> items ──
  const items = [];
  // Collect every <h3>...</h3> header that looks like a layer header
  // ("1. Standards (593)"), then slice each header's body up to the next
  // layer header so nested <h3> inside items can't confuse the parser.
  const headers = [...main.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  const layerHeaders = [];
  for (const h of headers) {
    const text = stripTags(h[1]);
    const hm = text.match(/^(\d+)\.?\s*([^（(]+?)\s*\(\s*(\d+)\s*\)\s*$/);
    if (hm) {
      layerHeaders.push({
        layer: parseInt(hm[1], 10),
        name: hm[2].trim(),
        count: parseInt(hm[3], 10),
        start: h.index + h[0].length,
      });
    }
  }
  for (let i = 0; i < layerHeaders.length; i++) {
    const lh = layerHeaders[i];
    const end = i + 1 < layerHeaders.length ? layerHeaders[i + 1].start : main.indexOf('<\/main>', lh.start);
    const body = main.slice(lh.start, end === -1 ? lh.start + 12000 : end);
    // each <li>: <a href="URL">Title</a><span> — Source</span><span>trust N</span>
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let im;
    while ((im = liRe.exec(body)) !== null) {
      const a = im[1].match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      const sourceM = im[1].match(/—\s*([^<]*?)<\/span>/i) || im[1].match(/<span[^>]*>[^<]*?—\s*([^<]*?)<\/span>/i);
      const trustM = im[1].match(/trust\s*(\d+)/i);
      const title = a ? stripTags(a[2]) : stripTags(im[1]);
      if (!title) continue;
      items.push({
        _layer: lh.layer,
        _layer_name: lh.name,
        id: `app-${date}-${lh.layer}-${items.length}`,
        title,
        url: a ? a[1] : null,
        source: sourceM ? stripTags(sourceM[1]).replace(/^—\s*/, '').trim() : null,
        trust_score: trustM ? parseInt(trustM[1], 10) : null,
        cves: [...(title.match(/CVE[-\u2011]\d{4}[-\u2011]\d{4,}/gi) || [])].map((x) => x.toUpperCase().replace(/[\u2011]/g, '-')),
        published: null,
        severity: null,
        category: lh.name,
        subcategory: null,
        technologies: [],
        source_type: null,
      });
    }
  }

  // Fallback: if the numbered-layer regex missed (app DOM changed), grab any
  // <li> with an absolute <a href> inside <main> and tag them layer 8.
  if (items.length === 0) {
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let im;
    while ((im = liRe.exec(main)) !== null) {
      const a = im[1].match(/<a[^>]+href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!a) continue;
      const title = stripTags(a[2]);
      if (!title) continue;
      const sourceM = im[1].match(/—\s*([^<]*?)<\/span>/i);
      const trustM = im[1].match(/trust\s*(\d+)/i);
      items.push({
        _layer: 8,
        _layer_name: 'Vulnerability Intel',
        id: `app-${date}-8-${items.length}`,
        title,
        url: a[1],
        source: sourceM ? stripTags(sourceM[1]).replace(/^—\s*/, '').trim() : null,
        trust_score: trustM ? parseInt(trustM[1], 10) : null,
        cves: [...(title.match(/CVE[-\u2011]\d{4}[-\u2011]\d{4,}/gi) || [])].map((x) => x.toUpperCase().replace(/[\u2011]/g, '-')),
        published: null,
        severity: null,
        category: 'Vulnerability Intel',
        subcategory: null,
        technologies: [],
        source_type: null,
      });
    }
  }

  // ── posts.json: the two briefs (Security & Standards / Engineering) ──
  const postA = extractBrief(main, 'Daily Security');
  const postB = extractBrief(main, 'Engineering');
  const posts = { post_a: postA, post_b: postB };

  const dayDir = join(STAGING, date);
  mkdirSync(dayDir, { recursive: true });
  writeFileSync(join(dayDir, 'feed.json'), JSON.stringify(items));
  writeFileSync(join(dayDir, 'summary.json'), JSON.stringify(summary));
  writeFileSync(join(dayDir, 'posts.json'), JSON.stringify(posts));
  console.log(`  ✔ ${date} (app-site fallback: ${items.length} items, ${summary.items_raw ?? '?'} raw)`);
  return { date, skipped: false, app: true };
}

/** Extract a brief (post) body by its h2 heading — the <li>/<p> text under it.
 *  Only matches real <h2> headings (not the <title>/<meta> tags). */
function extractBrief(main, headingWord) {
  const h2s = [...main.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  for (const h2 of h2s) {
    const text = stripTags(h2[1]);
    if (!text.includes(headingWord)) continue;
    const block = main.slice(h2.index + h2[0].length, h2s[h2s.indexOf(h2) + 1]?.index ?? h2.index + 8000);
    const lis = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripTags(m[1]));
    const ps = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1]));
    const lines = [...lis, ...ps].filter(Boolean);
    return lines.length > 0 ? lines.join('\n') : null;
  }
  return null;
}

async function main() {
  console.log('PCMedicalist sync — staging into', STAGING);
  mkdirSync(STAGING, { recursive: true });

  const meta = loadMeta();
  const updated = { ...meta };
  let ok = 0;
  let skipped = 0;

  // 1) Primary source: the GitHub feed repo
  let githubMaxDate = null;
  let appDates = [];
  try {
    const index = await fetchJson(`${RAW_BASE}/index.json`);
    console.log(`  index.json: ${index.length} digests (${index[0]?.date} → ${index[index.length - 1]?.date})`);
    githubMaxDate = index[index.length - 1]?.date ?? null;
    for (const entry of index) {
      const res = await syncDate(entry, meta);
      if (res.skipped) {
        skipped++;
        continue;
      }
      ok++;
      if (res.pushed_at) updated[res.date] = res.pushed_at;
    }
  } catch (err) {
    console.error(`  ⚠ GitHub feed repo unreachable (${err instanceof Error ? err.message : err}) — falling back to app site`);
  }

  // 2) Fallback: dates the app site publishes that GitHub is missing
  //    (the repo has gone stale before; the app keeps rendering digests).
  try {
    appDates = await fetchAppDates();
    console.log(`  app.pcmedicalist.com listing: ${appDates.length} digests (→ ${appDates[appDates.length - 1]})`);
    for (const date of appDates) {
      if (githubMaxDate && date <= githubMaxDate) continue; // GitHub has it
      const existing = meta[date];
      if (existing && existing.startsWith('app:')) {
        console.log(`  ─ ${date} (unchanged, app fallback)`);
        continue;
      }
      if (existsSync(join(STAGING, date, 'feed.json'))) {
        updated[date] = `app:${new Date().toISOString()}`;
        continue;
      }
      const res = await syncFromApp(date);
      if (!res.skipped) {
        ok++;
        updated[date] = `app:${new Date().toISOString()}`;
      }
    }
  } catch (err) {
    console.error(`  ⚠ App-site fallback failed (${err instanceof Error ? err.message : err}) — GitHub data only`);
  }

  writeFileSync(STAGING_META, JSON.stringify(updated, null, 2));
  console.log(`\n✔ Staged ${ok} new digest(s), ${skipped} unchanged. Next: node scripts/build-pcmedicalist.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
