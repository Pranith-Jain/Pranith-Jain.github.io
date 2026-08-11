#!/usr/bin/env node
/**
 * Build the SIEM Use-Case Library manifest under public/data/siem-library/.
 *
 * Sources authored detection use-cases (KQL + SPL, MITRE, FP guidance, APT
 * attribution) from scripts/data-src/siem-library/use-cases.json and slices
 * into a slim index + per-use-case bodies.
 *
 * Emits:
 *   public/data/siem-library/index.json
 *   public/data/siem-library/use-cases/<id>.json
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'siem-library');
const SRC = join(ROOT, 'scripts', 'data-src', 'siem-library', 'use-cases.json');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  const useCases = JSON.parse(readFileSync(SRC, 'utf8'));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'use-cases'));

  const catCounts = {};
  const mitreCounts = {};
  const sevCounts = {};
  const useCaseIndex = [];

  for (const uc of useCases) {
    catCounts[uc.category] = (catCounts[uc.category] || 0) + 1;
    mitreCounts[uc.mitre] = (mitreCounts[uc.mitre] || 0) + 1;
    sevCounts[uc.severity] = (sevCounts[uc.severity] || 0) + 1;
    writeFileSync(join(OUT, 'use-cases', `${uc.id}.json`), JSON.stringify(uc));
    useCaseIndex.push({ id: uc.id, name: uc.name, category: uc.category, mitre: uc.mitre, severity: uc.severity });
  }

  const index = {
    metadata: {
      description: 'SIEM/EDR use-case library — detection rules with KQL + SPL, MITRE ATT&CK mapping, false-positive guidance and APT attribution',
      totalUseCases: useCases.length,
      totalCategories: Object.keys(catCounts).length,
    },
    source: 'Authored in-repo (referenced vendor-doc patterns + MITRE ATT&CK)',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/siem-library',
    license: 'CC-BY-NC-SA; KQL/SPL snippets free to reuse',
    replicatedAt: now,
    counts: { useCases: useCases.length, categories: Object.keys(catCounts).length, techniques: Object.keys(mitreCounts).length },
    categories: Object.entries(catCounts).map(([name, count]) => ({ name, count })),
    severities: sevCounts,
    techniques: mitreCounts,
    useCaseIndex,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built SIEM Library manifest: ${useCases.length} use-cases, ${Object.keys(catCounts).length} categories`);
}

main();