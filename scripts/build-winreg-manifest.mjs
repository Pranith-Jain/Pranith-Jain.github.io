#!/usr/bin/env node
/**
 * Build the WinReg DFIR manifest under public/data/winreg/.
 *
 * Fetches the upstream Windows Registry Forensic Artifacts schema from
 * github.com/dfir-scripts/dfir-scripts.github.io and splits it into a
 * slim index + per-artifact JSON files for edge serving via ASSETS.
 *
 * Sources:
 *   github.com/dfir-scripts/dfir-scripts.github.io (MIT)
 *   Upstream registry artifact reference: https://dfir-scripts.github.io/registry/
 *
 * Emits:
 *   public/data/winreg/index.json              (slim — artifact index with metadata)
 *   public/data/winreg/artifacts/<slug>.json    (1 per artifact, full body)
 *
 * Safe to run repeatedly — wipes public/data/winreg/ on each run.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'winreg');

const UPSTREAM_URL =
  'https://raw.githubusercontent.com/dfir-scripts/dfir-scripts.github.io/main/registry/windows_registry_artifacts_schema_v0.3.json';

const SOURCE = 'github.com/dfir-scripts/dfir-scripts.github.io';
const SOURCE_URL = 'https://dfir-scripts.github.io/registry/';
const LICENSE = 'MIT';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function main() {
  // Fetch upstream data
  const resp = await fetch(UPSTREAM_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch upstream schema: ${resp.status} ${resp.statusText}`);
  }
  const schema = await resp.json();

  const { metadata, categories } = schema;
  const now = new Date().toISOString().slice(0, 10);

  // Wipe and rebuild
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'artifacts'));

  const artifacts = [];
  const tacticSet = new Set();
  const techniqueSet = new Set();
  const hiveSet = new Set();

  for (const [catKey, catVal] of Object.entries(categories)) {
    for (const art of catVal.artifacts) {
      const slug = slugify(`${catKey}-${art.name}`);
      const hives = Array.isArray(art.hive) ? art.hive : [art.hive || 'ALL'];
      hives.forEach((h) => hiveSet.add(h.toUpperCase().replace('.DAT', '').replace('.HVE', '')));
      const techniques = art.techniques || [];
      techniques.forEach((t) => techniqueSet.add(t));
      if (art.mitre) tacticSet.add(art.mitre);

      // Slim entry for index
      artifacts.push({
        slug,
        name: art.name,
        category: catKey,
        categoryLabel: catVal.name || catVal.label || catKey,
        hive: hives,
        techniques,
        mitre: art.mitre || null,
        tool: art.parsers || [],
        sizeBytes: JSON.stringify(art).length,
      });

      // Full body for detail
      const body = {
        slug,
        name: art.name,
        category: catKey,
        categoryLabel: catVal.name || catVal.label || catKey,
        categoryDescription: catVal.description || '',
        hive: hives,
        keys: art.keys || [],
        description: art.description || '',
        forensic_value: art.forensic_value || '',
        mitre: art.mitre || null,
        techniques,
        parsers: art.parsers || [],
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        license: LICENSE,
      };
      writeFileSync(join(OUT, 'artifacts', `${slug}.json`), JSON.stringify(body));
    }
  }

  const index = {
    metadata: {
      version: metadata.version || 'v0.1',
      description: metadata.description || 'Windows Registry Forensic Artifacts',
      totalArtifacts: artifacts.length,
      totalCategories: Object.keys(categories).length,
    },
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    license: LICENSE,
    replicatedAt: now,
    counts: {
      artifacts: artifacts.length,
      categories: Object.keys(categories).length,
      hives: hiveSet.size,
      tactics: tacticSet.size,
      techniques: techniqueSet.size,
    },
    hives: [...hiveSet].sort(),
    tactics: [...tacticSet].sort(),
    techniques: [...techniqueSet].sort(),
    categories: Object.entries(categories).map(([key, val]) => ({
      key,
      name: val.name || val.label || key,
      description: (val.description || '').slice(0, 200),
      count: val.artifacts.length,
    })),
    artifactIndex: artifacts,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

  console.log(`✔ Built WinReg DFIR manifest:`);
  console.log(`    ${artifacts.length} artifacts  (in public/data/winreg/artifacts/)`);
  console.log(`    ${Object.keys(categories).length} categories`);
  console.log(`    ${hiveSet.size} hive types`);
  console.log(`    ${techniqueSet.size} MITRE techniques`);
  console.log(`    Source: ${SOURCE}`);
}

main().catch((err) => {
  console.error('✘ Build failed:', err);
  process.exit(1);
});
