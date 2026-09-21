#!/usr/bin/env node
// Builds public/data/lots/index.json from the LOTS Project
// (Living Off Trusted Sites, https://lots-project.com by mr.d0x).
// Replicates the osint pattern: slim index read at runtime through
// env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-lots-manifest.mjs [--source <file-or-url>]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'lots');
const UPSTREAM_URL = 'https://lots-project.com/';
const UPSTREAM_REPO = 'lots-project.com (mr.d0x)';
const SITE_URL = 'https://lots-project.com/site/';

const CONCURRENCY = 3;
const REQUEST_DELAY_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .replace(/^\*\./, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'site'
  );
}

async function loadSource() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) {
    if (/^https?:\/\//.test(override)) {
      const res = await fetch(override);
      if (!res.ok) throw new Error(`fetch ${override}: HTTP ${res.status}`);
      return await res.text();
    }
    return readFileSync(override, 'utf8');
  }
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) throw new Error(`fetch upstream: HTTP ${res.status}`);
  return await res.text();
}

function parseHomepage(html) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
    );
    if (cells.length < 3 || /^website$/i.test(cells[0])) continue;
    const [website, tagStr, provider] = cells;
    if (!website) continue;
    rows.push({
      website,
      tags: tagStr.split(/\s+/).map((t) => t.trim()).filter(Boolean),
      provider: provider || 'Unknown',
    });
  }
  return rows;
}

function parseSiteDetail(html) {
  const text = decodeEntities(
    html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' '),
  );
  const pick = (label) => {
    // Labels also appear in the Tags header; the detail section is last.
    const re = new RegExp(`${label}\\s*\\|(?:\\s*\\|)*\\s*([^|]+)`, 'g');
    let m;
    let last = '';
    while ((m = re.exec(text)) !== null) last = m[1].trim();
    if (/^none$/i.test(last)) return '';
    return last.slice(0, 500);
  };
  return {
    phishing: pick('Phishing'),
    commandAndControl: pick('Command and Control'),
    exfiltration: pick('Exfiltration'),
    download: pick('Download'),
  };
}

async function fetchDetails(rows) {
  const out = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++;
      const row = rows[i];
      await sleep(REQUEST_DELAY_MS);
      const hex = Buffer.from(row.website, 'utf8').toString('hex');
      try {
        const res = await fetch(`${SITE_URL}${hex}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const detail = parseSiteDetail(await res.text());
        const desc = [detail.phishing, detail.commandAndControl, detail.exfiltration, detail.download]
          .filter(Boolean)
          .join(' ');
        out[i] = { ...row, description: desc.slice(0, 600), detailUrl: `${SITE_URL}${hex}` };
      } catch (e) {
        console.warn(`  … detail failed for ${row.website}: ${e instanceof Error ? e.message : String(e)}`);
        out[i] = { ...row, description: '', detailUrl: `${SITE_URL}${hex}` };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return out;
}

const html = await loadSource();
const rows = parseHomepage(html);
if (rows.length < 50) throw new Error(`parse yielded only ${rows.length} rows — upstream format changed?`);
console.log(`  ${rows.length} sites on homepage, fetching detail pages…`);
const enriched = await fetchDetails(rows);

const seen = new Set();
const entries = enriched.map((r) => {
  const base = slugify(r.website);
  let slug = base;
  let n = 2;
  while (seen.has(slug)) slug = `${base}-${n++}`;
  seen.add(slug);
  return {
    slug,
    website: r.website,
    provider: r.provider,
    tags: r.tags,
    description:
      r.description || `Trusted site abusable for ${r.tags.join(', ') || 'phishing'}.`,
    url: r.detailUrl,
  };
});

const tagCounts = {};
for (const e of entries) for (const t of e.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;

mkdirSync(OUT, { recursive: true });
const index = {
  source: UPSTREAM_REPO,
  license: 'upstream-collection (links + summaries only; no vendored content)',
  replicatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  tags: Object.keys(tagCounts).sort(),
  tagCounts,
  entries,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('✔ Built LOTS manifest:');
console.log(`    ${entries.length} sites, tags: ${Object.keys(tagCounts).sort().join(', ')}`);
