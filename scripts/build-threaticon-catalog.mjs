#!/usr/bin/env node
/**
 * Build the extended threaticon.com catalog manifest tree under
 * public/data/threat-intel/threaticon-catalog/.
 *
 * Reads from ./threat-intel-staging/threaticon-catalog/ (created by
 * `node scripts/sync-threaticon-catalog.mjs`) and emits:
 *   index.json                 — per-section meta + slim item arrays + counts
 *   tools/<id>.json            — 95 tool bodies
 *   mitigations/<id>.json      — 44 mitigation bodies
 *   data-sources/<id>.json     — 106 data-component bodies
 *   detection-strategies/<id>.json — 697 detection-strategy bodies
 *   campaigns/<id>.json        — 7,748 campaign bodies
 *   attack-patterns/<id>.json  — 3,087 attack-pattern bodies
 *   vulnerabilities/<id>.json  — 22,190 vulnerability bodies
 *   indicators/<type>.json     — IOC records chunked per type (~50k/chunk)
 *
 * Read at runtime by worker/lib/threat-intel-manifest.ts via env.ASSETS.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threaticon-catalog');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'threaticon-catalog');

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const SECTIONS = [
  'tools',
  'mitigations',
  'data-sources',
  'detection-strategies',
  'campaigns',
  'attack-patterns',
  'vulnerabilities',
  'indicators',
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });

const index = {
  source: 'threaticon.com',
  url: 'https://threaticon.com/',
  description:
    'Extended threaticon.com public-preview catalog: tools, mitigations, data components, detection strategies, campaigns, attack patterns, CVEs and indicators.',
  builtAt: new Date().toISOString(),
  counts: {},
  sections: {},
};

const DETAIL_FIELDS = {
  tools: ['status', 'category', 'aliases', 'confidence', 'added'],
  mitigations: ['mitreId', 'stixId', 'techniqueCoverage', 'added'],
  'data-sources': ['dcId', 'analyticCount', 'strategyCount', 'added', 'analytics'],
  'detection-strategies': ['detId', 'stixId', 'analyticCount', 'techniqueCount', 'analytics'],
  campaigns: ['status', 'confidence', 'firstSeen', 'lastSeen', 'added'],
  'attack-patterns': ['techniqueId', 'added'],
  vulnerabilities: [
    'severity',
    'status',
    'productCwe',
    'cvssScore',
    'cvssVector',
    'confidence',
    'published',
    'lastModified',
    'references',
  ],
};

const SLIM_FIELDS = {
  tools: ['status', 'category', 'confidence'],
  mitigations: ['mitreId'],
  'data-sources': ['dcId', 'analyticCount'],
  'detection-strategies': ['detId', 'analyticCount'],
  campaigns: ['status', 'confidence', 'firstSeen', 'lastSeen'],
  'attack-patterns': ['techniqueId'],
  vulnerabilities: ['severity', 'status', 'productCwe', 'confidence'],
};

for (const section of SECTIONS) {
  const list = readJson(join(STAGING, section, 'list.json'));
  if (!list?.items?.length) {
    console.warn(`  ⚠ ${section}: no staged list — skipping`);
    continue;
  }
  const items = list.items;
  const detailsDir = join(STAGING, section, 'details');
  const detailFiles = existsSync(detailsDir) ? readdirSync(detailsDir).filter((f) => f.endsWith('.json')) : [];
  const detailById = new Map();
  for (const f of detailFiles) {
    const d = readJson(join(detailsDir, f));
    if (d?.id) detailById.set(d.id, d);
  }

  if (section === 'indicators') {
    // Chunked per-type IOC files — no per-record files (480k records).
    const byType = new Map();
    for (const it of items) {
      if (!it?.value) continue;
      const key = String(it.type ?? 'unknown')
        .toLowerCase()
        .replace(/\s+/g, '-');
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push({ value: it.value, tlp: it.tlp, confidence: it.confidence, added: it.added });
    }
    const CHUNK = 50000;
    const typeMeta = {};
    const dir = join(OUT, 'indicators');
    mkdirSync(dir, { recursive: true });
    let total = 0;
    for (const [type, recs] of byType) {
      recs.sort((a, b) => a.value.localeCompare(b.value));
      const chunks = Math.ceil(recs.length / CHUNK);
      typeMeta[type] = { count: recs.length, chunks };
      for (let c = 0; c < chunks; c++) {
        const name = chunks > 1 ? `${type}.${c}.json` : `${type}.json`;
        writeFileSync(join(dir, name), JSON.stringify(recs.slice(c * CHUNK, (c + 1) * CHUNK)));
      }
      total += recs.length;
    }
    index.counts.indicators = total;
    index.sections.indicators = { types: typeMeta };
    console.log(
      `✔ indicators: ${total} IOCs in ${byType.size} types (${[...byType.values()].reduce((n, r) => n + Math.ceil(r.length / CHUNK), 0)} files)`
    );
    continue;
  }

  // Body + slim records.
  const bodies = [];
  const slim = [];
  for (const item of items) {
    const detail = detailById.get(item.id) ?? {};
    const body = { id: item.id, name: item.name ?? detail.name ?? `#${item.id}` };
    for (const f of DETAIL_FIELDS[section]) body[f] = detail[f] ?? item[f] ?? null;
    body.description = detail.description ?? item.description ?? null;
    body.tlp = detail.tlp ?? item.tlp ?? null;
    body.sourceUrl = `https://threaticon.com/${section}/${item.id}`;
    const slimRec = { id: item.id, name: body.name };
    for (const f of SLIM_FIELDS[section]) slimRec[f] = body[f];
    slimRec.tlp = body.tlp;
    bodies.push(body);
    slim.push(slimRec);
  }
  bodies.sort((a, b) => a.name.localeCompare(b.name));
  slim.sort((a, b) => a.name.localeCompare(b.name));

  const dir = join(OUT, section);
  mkdirSync(dir, { recursive: true });
  for (const b of bodies) {
    writeFileSync(join(dir, `${b.id}.json`), JSON.stringify(b));
  }

  index.counts[section] = slim.length;
  index.sections[section] = { syncedAt: list.syncedAt, detailCount: detailById.size, items: slim };
  console.log(`✔ ${section}: ${slim.length} bodies (${detailById.size} details) → ${section}/`);
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log('\n✔ Built threaticon-catalog manifest:');
for (const k of Object.keys(index.counts)) console.log(`    ${k}: ${index.counts[k]}`);
