#!/usr/bin/env node
// Builds public/data/hijacklibs/index.json from the HijackLibs API
// (DLL sideloading catalog, https://hijacklibs.net by Wietze Beukema).
// Single JSON fetch, slimmed into an index read at runtime through
// env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-hijacklibs-manifest.mjs [--source <file-or-url>]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'hijacklibs');
const UPSTREAM_URL = 'https://hijacklibs.net/api/hijacklibs.json';
const UPSTREAM_REPO = 'hijacklibs.net (Wietze Beukema)';

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'dll'
  );
}

async function loadSource() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) {
    if (/^https?:\/\//.test(override)) {
      const res = await fetch(override);
      if (!res.ok) throw new Error(`fetch ${override}: HTTP ${res.status}`);
      return await res.json();
    }
    return JSON.parse(readFileSync(override, 'utf8'));
  }
  const res = await fetch(UPSTREAM_URL, {
    headers: { 'user-agent': 'pranithjain-hijacklibs-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`fetch upstream: HTTP ${res.status}`);
  return await res.json();
}

const raw = await loadSource();
if (!Array.isArray(raw) || raw.length < 100) {
  throw new Error(`unexpected payload (${Array.isArray(raw) ? raw.length : typeof raw}) — upstream format changed?`);
}

const seen = new Set();
const entries = raw.map((e) => {
  const dll = String(e.Name || '');
  const base = slugify(dll);
  let slug = base;
  let n = 2;
  while (seen.has(slug)) slug = `${base}-${n++}`;
  seen.add(slug);
  const execs = Array.isArray(e.VulnerableExecutables) ? e.VulnerableExecutables : [];
  const types = [...new Set(execs.map((x) => String(x.Type || '')).filter(Boolean))].sort();
  return {
    slug,
    dll,
    vendor: String(e.Vendor || 'Unknown'),
    cve: e.CVE ? String(e.CVE) : null,
    hijackTypes: types,
    executableCount: execs.length,
    executables: execs.slice(0, 10).map((x) => ({ path: String(x.Path || ''), type: String(x.Type || '') })),
    expectedLocations: (Array.isArray(e.ExpectedLocations) ? e.ExpectedLocations : []).map(String).slice(0, 5),
    resourceCount: Array.isArray(e.Resources) ? e.Resources.length : 0,
    description:
      `${dll} is a known DLL hijacking candidate (${types.join('/') || 'unknown type'}) ` +
      `with ${execs.length} vulnerable executable${execs.length === 1 ? '' : 's'}` +
      (e.CVE ? ` (${e.CVE})` : '') +
      '.',
    url: String(e.url || `https://hijacklibs.net/entries/${encodeURIComponent(dll)}`),
  };
});

const typeCounts = {};
const vendorCounts = {};
let withCve = 0;
for (const e of entries) {
  for (const t of e.hijackTypes) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  vendorCounts[e.vendor] = (vendorCounts[e.vendor] ?? 0) + 1;
  if (e.cve) withCve++;
}

mkdirSync(OUT, { recursive: true });
const index = {
  source: UPSTREAM_REPO,
  license: 'upstream-collection (summaries only; no vendored content)',
  replicatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  hijackTypes: Object.keys(typeCounts).sort(),
  typeCounts,
  withCve,
  entries,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('✔ Built HijackLibs manifest:');
console.log(`    ${entries.length} DLLs, types: ${Object.keys(typeCounts).sort().join(', ')}, with CVE: ${withCve}`);
