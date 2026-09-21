#!/usr/bin/env node
// Builds public/data/car/index.json from the MITRE Cyber Analytics
// Repository (https://github.com/mitre-attack/car, Apache-2.0).
// Clones shallow into the OS temp dir at build time (override with
// --source <local-dir>), parses analytics/*.yaml with js-yaml (build-time
// devDependency only — never imported at runtime), and writes a slim index
// read at runtime through env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-car-manifest.mjs [--source <dir>]
import { writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { load as yamlLoad } from 'js-yaml';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'car');
const UPSTREAM_REPO = 'github.com/mitre-attack/car';
const UPSTREAM_LICENSE = 'Apache-2.0';

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'analytic'
  );
}

function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function ensureRepo() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) return { dir: override, cleanup: () => {} };
  const dir = join(tmpdir(), `car-${Date.now()}`);
  console.log(`  cloning ${UPSTREAM_REPO} (depth 1)…`);
  execFileSync('git', ['clone', '--depth', '1', `https://github.com/mitre-attack/car`, dir], {
    stdio: 'inherit',
  });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const { dir, cleanup } = ensureRepo();
try {
  const analyticsDir = join(dir, 'analytics');
  const files = readdirSync(analyticsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (files.length < 50) throw new Error(`only ${files.length} analytics — upstream format changed?`);

  const seen = new Set();
  const entries = [];
  for (const f of files.sort()) {
    const d = yamlLoad(readFileSync(join(analyticsDir, f), 'utf8'));
    const id = String(d.id || f.replace(/\.(yaml|yml)$/, ''));
    const base = slugify(id);
    let slug = base;
    let n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);

    const techniques = [];
    for (const cov of asArray(d.coverage)) {
      techniques.push({
        technique: String(cov.technique || ''),
        tactics: asArray(cov.tactics).map(String),
        subtechniques: asArray(cov.subtechniques).map(String),
        coverage: String(cov.coverage || ''),
      });
    }
    entries.push({
      slug,
      carId: id,
      title: String(d.title || id),
      description: String(d.description || '').replace(/\s+/g, ' ').trim().slice(0, 800),
      domain: String(d.information_domain || ''),
      platforms: asArray(d.platforms).map(String),
      analyticTypes: asArray(d.analytic_types).map(String),
      techniques,
      techniqueIds: [...new Set(techniques.flatMap((t) => [t.technique, ...t.subtechniques]).filter(Boolean))],
      d3fend: asArray(d.d3fend_mappings).map((m) => ({ id: String(m.id || ''), label: String(m.label || '') })),
      implementations: asArray(d.implementations)
        .map((i) => String(i.name || i.type || ''))
        .filter(Boolean)
        .slice(0, 12),
      references: asArray(d.references).map(String).slice(0, 8),
      url: `https://car.mitre.org/analytics/${id}`,
    });
  }

  const techniqueCounts = {};
  for (const e of entries) for (const t of e.techniqueIds) techniqueCounts[t] = (techniqueCounts[t] ?? 0) + 1;

  mkdirSync(OUT, { recursive: true });
  const index = {
    source: UPSTREAM_REPO,
    license: UPSTREAM_LICENSE,
    replicatedAt: new Date().toISOString().slice(0, 10),
    count: entries.length,
    techniqueCount: Object.keys(techniqueCounts).length,
    entries,
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log('✔ Built CAR manifest:');
  console.log(`    ${entries.length} analytics covering ${Object.keys(techniqueCounts).length} techniques/subtechniques`);
} finally {
  cleanup();
}
