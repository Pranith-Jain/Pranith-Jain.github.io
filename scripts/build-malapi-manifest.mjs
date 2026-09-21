#!/usr/bin/env node
// Builds public/data/malapi/index.json from MalAPI.io
// (Windows API catalog, https://malapi.io by mr.d0x).
// Homepage table gives API → attack-category mapping (8 columns);
// per-API pages (/winapi/<Name>) give description/library/associated
// attacks/docs. Replicates the osint pattern: slim index read at runtime
// through env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-malapi-manifest.mjs [--source <file-or-url>]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'malapi');
const UPSTREAM_URL = 'https://malapi.io/';
const UPSTREAM_REPO = 'malapi.io (mr.d0x)';

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
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'api'
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
  const catRe = /<th[^>]*>\s*([A-Za-z-]+)\s*(?:<img|<\/th)/gi;
  const categories = [];
  let cm;
  while ((cm = catRe.exec(html)) !== null) categories.push(cm[1].trim());
  const apis = new Map(); // name -> { path, categories:Set }
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (!tds.length) continue;
    tds.forEach((td, i) => {
      const cat = categories[i] || `col-${i}`;
      const linkRe = /<a[^>]*href="(\/winapi\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let lm;
      while ((lm = linkRe.exec(td)) !== null) {
        const name = lm[2].trim();
        if (!name) continue;
        if (!apis.has(name)) apis.set(name, { path: lm[1], categories: new Set() });
        apis.get(name).categories.add(cat);
      }
    });
  }
  return { categories: categories.filter((c) => !c.startsWith('col-')), apis };
}

function parseDetail(html, fallbackName) {
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '|')
      .replace(/\|+/g, '|')
      .replace(/\s+/g, ' '),
  );
  const pick = (label) => {
    const re = new RegExp(`${label}\\s*\\|(?:\\s*\\|)*\\s*([^|]+)`);
    const mt = re.exec(text);
    return mt ? mt[1].trim().slice(0, 600) : '';
  };
  const desc = pick('Description') || pick('Function Name');
  return {
    name: fallbackName,
    description: desc,
    library: pick('Library').slice(0, 120),
    associatedAttacks: pick('Associated Attacks')
      .split(/\s{2,}|\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    documentation: (() => {
      const dm = /https?:\/\/docs\.microsoft\.com[^|\s]+/i.exec(text);
      return dm ? dm[0] : '';
    })(),
  };
}

async function fetchDetails(list) {
  const out = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const { name, path, categories } = list[i];
      await sleep(REQUEST_DELAY_MS);
      try {
        const res = await fetch(`https://malapi.io${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        out[i] = { ...parseDetail(await res.text(), name), categories };
      } catch (e) {
        console.warn(`  … detail failed for ${name}: ${e instanceof Error ? e.message : String(e)}`);
        out[i] = { name, description: '', library: '', associatedAttacks: [], documentation: '', categories };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return out;
}

const html = await loadSource();
const { categories, apis } = parseHomepage(html);
if (apis.size < 100) throw new Error(`parse yielded only ${apis.size} APIs — upstream format changed?`);
console.log(`  ${apis.size} APIs in ${categories.join(', ')}, fetching detail pages…`);
const list = [...apis.entries()].map(([name, v]) => ({
  name,
  path: v.path,
  categories: [...v.categories].sort(),
}));
const enriched = await fetchDetails(list);

const seen = new Set();
const entries = enriched.map((a) => {
  const base = slugify(a.name);
  let slug = base;
  let n = 2;
  while (seen.has(slug)) slug = `${base}-${n++}`;
  seen.add(slug);
  return {
    slug,
    name: a.name,
    library: a.library,
    categories: a.categories,
    associatedAttacks: a.associatedAttacks,
    description: a.description,
    documentation: a.documentation,
    url: `https://malapi.io/winapi/${a.name}`,
  };
});

mkdirSync(OUT, { recursive: true });
const index = {
  source: UPSTREAM_REPO,
  license: 'upstream-collection (summaries only; no vendored content)',
  replicatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  categories,
  entries,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('✔ Built MalAPI manifest:');
console.log(`    ${entries.length} APIs, ${categories.length} categories`);
