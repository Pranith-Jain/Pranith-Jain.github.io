#!/usr/bin/env node
// Builds public/data/veris/index.json from the VERIS Framework enumerations
// (vz-risk/VERIS, CC BY-SA 4.0): verisc-enum.json (incident taxonomy values)
// + verisc-labels.json (human-readable value descriptions).
// Writes a flattened field index read at runtime through env.ASSETS.
//
// Usage: node scripts/build-veris-manifest.mjs [--source <dir-with-jsons>]
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'veris');
const UPSTREAM_REPO = 'github.com/vz-risk/VERIS';
const UPSTREAM_LICENSE = 'CC BY-SA 4.0';
const ENUM_URL = 'https://raw.githubusercontent.com/vz-risk/VERIS/master/verisc-enum.json';
const LABELS_URL = 'https://raw.githubusercontent.com/vz-risk/VERIS/master/verisc-labels.json';

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'field'
  );
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

async function loadJson(url, local) {
  if (local && existsSync(join(local, url.split('/').pop()))) {
    return JSON.parse(readFileSync(join(local, url.split('/').pop()), 'utf8'));
  }
  const res = await fetch(url, {
    headers: { 'user-agent': 'pranithjain-veris-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return await res.json();
}

async function main() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  const [enums, labels] = await Promise.all([loadJson(ENUM_URL, override), loadJson(LABELS_URL, override)]);

  const entries = [];
  const seen = new Set();

  function walk(node, path) {
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every((v) => typeof v === 'string')) {
        const [section, category, ...rest] = path.split('.');
        const field = rest.join('.') || category;
        const base = slugify(path);
        let slug = base;
        let n = 2;
        while (seen.has(slug)) slug = `${base}-${n++}`;
        seen.add(slug);
        const labelMap = getPath(labels, path) ?? {};
        entries.push({
          slug,
          path,
          section: section ?? '',
          category: category ?? '',
          field,
          values: node.map((v) => ({
            value: v,
            label: typeof labelMap === 'object' && labelMap !== null && typeof labelMap[v] === 'string' ? labelMap[v] : '',
          })),
        });
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  }

  walk(enums, '');

  if (entries.length < 20) throw new Error(`only ${entries.length} fields — upstream format changed?`);

  const sections = {};
  for (const e of entries) {
    sections[e.section] = sections[e.section] ?? { section: e.section, fieldCount: 0, valueCount: 0 };
    sections[e.section].fieldCount += 1;
    sections[e.section].valueCount += e.values.length;
  }

  mkdirSync(OUT, { recursive: true });
  const index = {
    source: UPSTREAM_REPO,
    license: UPSTREAM_LICENSE,
    replicatedAt: new Date().toISOString().slice(0, 10),
    count: entries.length,
    sections: Object.values(sections).sort((a, b) => a.section.localeCompare(b.section)),
    entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log('✔ Built VERIS manifest:');
  console.log(`    ${entries.length} taxonomy fields across ${Object.keys(sections).length} sections`);
}

main().catch((e) => {
  console.error(`✘ build-veris failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
