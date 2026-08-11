#!/usr/bin/env node
/**
 * Build CLOAK (Concealment Layers for Online Anonymity and Knowledge) manifest.
 * Source: https://github.com/Mickinthemiddle/CLOAK (GPL-2.0, Mick Deben / Leiden University)
 *
 * Input:  scripts/data-src/cloak/concealment-data.json
 * Output: public/data/cloak/{index.json, tactics/<id>.json, techniques/<id>.json}
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'scripts/data-src/cloak/concealment-data.json');
const OUT = join(ROOT, 'public/data/cloak');

const raw = JSON.parse(readFileSync(SRC, 'utf-8'));
const tactics = raw.tactics;

mkdirSync(join(OUT, 'tactics'), { recursive: true });
mkdirSync(join(OUT, 'techniques'), { recursive: true });

let totalTechniques = 0;
let totalSubTechniques = 0;
let totalProcedures = 0;
const tacticIndex = [];

function countProcedures(list) {
  let n = 0;
  for (const p of list) {
    n++;
    if (p.procedures) n += countProcedures(p.procedures);
    if (p.subtechniques) n += countProcedures(p.subtechniques);
  }
  return n;
}

for (const tactic of tactics) {
  const techniques = tactic.techniques || [];
  const techniqueIndex = [];
  let tacticSubTechniques = 0;
  let tacticProcedures = 0;

  for (const technique of techniques) {
    const subs = technique.subtechniques || [];
    const procs = technique.procedures || [];
    tacticSubTechniques += subs.length;
    tacticProcedures += countProcedures(procs);
    totalTechniques++;

    const subIndex = subs.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type || '',
    }));

    const body = {
      id: technique.id,
      name: technique.name,
      description: technique.description,
      type: technique.type || '',
      tacticId: tactic.id,
      tacticName: tactic.name,
      subtechniques: subs.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type || '',
        procedures: (s.procedures || []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
      })),
      procedures: procs.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
    };

    writeFileSync(join(OUT, 'techniques', `${technique.id}.json`), JSON.stringify(body, null, 2));

    techniqueIndex.push({
      id: technique.id,
      name: technique.name,
      type: technique.type || '',
      subCount: subs.length,
      procCount: procs.length,
      subIndex,
    });
  }

  totalSubTechniques += tacticSubTechniques;
  totalProcedures += tacticProcedures;

  const tacticBody = {
    id: tactic.id,
    name: tactic.name,
    description: tactic.description,
    techniqueCount: techniques.length,
    subtechniqueCount: tacticSubTechniques,
    procedureCount: tacticProcedures,
    techniques: techniqueIndex,
  };

  writeFileSync(join(OUT, 'tactics', `${tactic.id}.json`), JSON.stringify(tacticBody, null, 2));

  tacticIndex.push({
    id: tactic.id,
    name: tactic.name,
    techniqueCount: techniques.length,
    subtechniqueCount: tacticSubTechniques,
    procedureCount: tacticProcedures,
  });
}

const index = {
  source: 'CLOAK (Concealment Layers for Online Anonymity and Knowledge)',
  sourceUrl: 'https://github.com/Mickinthemiddle/CLOAK',
  license: 'GPL-2.0',
  author: 'Mick Deben — Leiden University',
  replicatedAt: new Date().toISOString(),
  counts: {
    tactics: tactics.length,
    techniques: totalTechniques,
    subtechniques: totalSubTechniques,
    procedures: totalProcedures,
  },
  tacticIndex,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`CLOAK build complete:
  Tactics:       ${tactics.length}
  Techniques:    ${totalTechniques}
  Sub-techniques: ${totalSubTechniques}
  Procedures:    ${totalProcedures}
  Output:        ${OUT}`);
