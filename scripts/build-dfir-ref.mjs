#!/usr/bin/env node
/**
 * Build the DFIR Reference manifest under public/data/dfir-ref/.
 *
 * Sources the authored reference data in scripts/data-src/dfir-ref/
 * (Windows Event IDs, memory forensics commands, browser artifacts,
 * evidence-collection phases) and slices it into a slim index + per-item
 * bodies for edge serving via ASSETS. Authored in-repo; no upstream fetch.
 *
 * Emits:
 *   public/data/dfir-ref/index.json
 *   public/data/dfir-ref/sections/<category>/<slug>.json
 *
 * Safe to run repeatedly — wipes public/data/dfir-ref/ on each run.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'dfir-ref');
const SRC = join(ROOT, 'scripts', 'data-src', 'dfir-ref');

const COLLECTIONS = [
  { key: 'event-ids', name: 'Windows Event ID Reference', src: 'event-ids.json', idField: 'id', nameOf: (e) => `${e.id} — ${e.name}`, tagsOf: (e) => [e.log, ...(e.indicators || [])] },
  { key: 'memory', name: 'Memory Forensics (Volatility)', src: 'memory.json', idField: 'plugin', nameOf: (e) => e.plugin, tagsOf: (e) => [e.version, e.category, ...(e.indicators ? [e.indicators] : [])] },
  { key: 'browser', name: 'Browser Forensics', src: 'browser.json', idField: 'artifact', nameOf: (e) => `${e.artifact} (${e.browser})`, tagsOf: (e) => [e.browser] },
  { key: 'evidence', name: 'Evidence Collection & Chain of Custody', src: 'evidence.json', idField: 'phase', nameOf: (e) => e.name, tagsOf: (e) => [e.phase] },
];

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'sections'));

  const itemIndex = [];
  const categories = [];

  for (const col of COLLECTIONS) {
    const items = JSON.parse(readFileSync(join(SRC, col.src), 'utf8'));
    const sectionDir = join(OUT, 'sections', col.key);
    ensureDir(sectionDir);
    for (const it of items) {
      const id = String(it[col.idField]);
      const slug = slugify(`${col.key}-${id}`);
      const body = { ...it, slug, section: col.key, sectionLabel: col.name };
      writeFileSync(join(sectionDir, `${slug}.json`), JSON.stringify(body));
      itemIndex.push({
        slug,
        id,
        name: col.nameOf(it),
        category: col.key,
        categoryLabel: col.name,
        tags: col.tagsOf(it),
        mitre: it.mitre || null,
        sizeBytes: JSON.stringify(body).length,
      });
    }
    categories.push({ key: col.key, name: col.name, count: items.length });
  }

  const totalItems = itemIndex.length;
  const index = {
    metadata: {
      description: 'DFIR practitioner reference — Windows Event IDs, memory forensics, browser artifacts, evidence collection',
      totalItems,
      totalCategories: categories.length,
      authors: 'Authored in-repo (CyberGuard-Forte-style toolkit reference)',
    },
    source: 'Authored reference data (scripts/data-src/dfir-ref)',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/dfir-ref',
    license: 'CC-BY-NC-SA (reference summaries; MITRE ATT&CK mappings per ATT&CK license)',
    replicatedAt: now,
    counts: {
      eventIds: JSON.parse(readFileSync(join(SRC, 'event-ids.json'), 'utf8')).length,
      memoryCommands: JSON.parse(readFileSync(join(SRC, 'memory.json'), 'utf8')).length,
      browserArtifacts: JSON.parse(readFileSync(join(SRC, 'browser.json'), 'utf8')).length,
      evidencePhases: JSON.parse(readFileSync(join(SRC, 'evidence.json'), 'utf8')).length,
    },
    categories,
    itemIndex,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built DFIR Ref manifest: ${totalItems} items across ${categories.length} sections`);
}

main();