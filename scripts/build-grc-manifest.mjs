#!/usr/bin/env node
/**
 * Build the GRC manifest under public/data/grc/.
 *
 * Sources authored framework checklists (ISO 27001:2022, CERT-In, SEBI,
 * RBI, SOC 2, PCI DSS v4, DPDP 2023) + cross-framework mapper from
 * scripts/data-src/grc/ and slices them for edge serving via ASSETS.
 *
 * Emits:
 *   public/data/grc/index.json              (slim framework index + mapper)
 *   public/data/grc/frameworks/<key>.json    (full control lists per framework)
 *
 * Safe to run repeatedly — wipes public/data/grc/ on each run.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'grc');
const SRC = join(ROOT, 'scripts', 'data-src', 'grc');

const FRAMEWORKS = ['iso27001', 'cert-in', 'sebi', 'rbi', 'soc2', 'pci', 'dpdp'];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'frameworks'));

  const frameworkIndex = [];
  let totalControls = 0;

  for (const key of FRAMEWORKS) {
    const fw = JSON.parse(readFileSync(join(SRC, `${key}.json`), 'utf8'));
    const controls = fw.categories.reduce((n, c) => n + c.controls.length, 0);
    totalControls += controls;
    writeFileSync(join(OUT, 'frameworks', `${key}.json`), JSON.stringify(fw));
    frameworkIndex.push({
      key: fw.key,
      name: fw.name,
      year: fw.year,
      description: fw.description,
      themes: fw.themes,
      categories: fw.categories.map((c) => ({ key: c.key, name: c.name, count: c.controls.length })),
      controlCount: controls,
    });
  }

  const mapper = JSON.parse(readFileSync(join(SRC, 'mapper.json'), 'utf8'));

  const index = {
    metadata: {
      description: 'Compliance checklist vertical — ISO 27001:2022, CERT-In 2022, SEBI CSCRF, RBI IT, SOC 2, PCI DSS v4, DPDP 2023 + cross-framework control mapper + AI/DPDP mapper',
      totalFrameworks: frameworkIndex.length,
      totalControls,
      mapperThemes: mapper.themes.length,
    },
    source: 'Authored from public regulatory/standards documents (summarized; not a substitute for the standards)',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/grc',
    license: 'Reference summaries of public standards/regulations',
    replicatedAt: now,
    counts: { frameworks: frameworkIndex.length, controls: totalControls, mapperThemes: mapper.themes.length },
    frameworks: frameworkIndex,
    mapper,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built GRC manifest: ${frameworkIndex.length} frameworks, ${totalControls} controls, ${mapper.themes.length} mapper themes`);
}

main();