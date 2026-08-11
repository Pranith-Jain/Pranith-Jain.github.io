#!/usr/bin/env node
/**
 * Build the Hunting Hypothesis Library manifest under public/data/hunt-hypotheses/.
 *
 * Sources authored hypotheses (154, MITRE-mapped, 12 tactics) from
 * scripts/data-src/hunt-hypotheses/hypotheses.json and slices into a slim
 * index + per-hypothesis bodies.
 *
 * Emits:
 *   public/data/hunt-hypotheses/index.json
 *   public/data/hunt-hypotheses/hypotheses/<id>.json
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'hunt-hypotheses');
const SRC = join(ROOT, 'scripts', 'data-src', 'hunt-hypotheses', 'hypotheses.json');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  const hyps = JSON.parse(readFileSync(SRC, 'utf8'));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'hypotheses'));

  const tacticCounts = {};
  const hypIndex = [];

  hyps.forEach((h, i) => {
    const id = `H${String(i + 1).padStart(3, '0')}`;
    tacticCounts[h.tactic] = (tacticCounts[h.tactic] || 0) + 1;
    writeFileSync(join(OUT, 'hypotheses', `${id}.json`), JSON.stringify({ ...h, id }));
    hypIndex.push({ id, tactic: h.tactic, technique: h.technique, title: h.title, sizeBytes: JSON.stringify(h).length });
  });

  const index = {
    metadata: {
      description: 'Structured threat-hunting hypothesis library — 154 hypotheses across 12 ATT&CK tactics, each with an evidence-based premise and starter queries',
      totalHypotheses: hyps.length,
      totalTactics: Object.keys(tacticCounts).length,
    },
    source: 'Authored in-repo (hypothesis-driven hunting practice; MITRE ATT&CK mapping)',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/hunt-hypotheses',
    license: 'CC-BY-NC-SA; queries free to reuse',
    replicatedAt: now,
    counts: { hypotheses: hyps.length, tactics: Object.keys(tacticCounts).length },
    tactics: Object.entries(tacticCounts).map(([name, count]) => ({ name, count })),
    hypothesisIndex: hypIndex,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built Hunt Hypotheses manifest: ${hyps.length} hypotheses across ${Object.keys(tacticCounts).length} tactics`);
}

main();