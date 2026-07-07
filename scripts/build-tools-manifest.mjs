#!/usr/bin/env node

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'tools');
const SOURCE_FILE = join(ROOT, 'public', 'data', 'tools', 'index.json');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function validateTool(t, i) {
  const required = ['slug', 'name', 'category', 'description', 'url', 'isOpenSource', 'isOffensive', 'tags'];
  for (const field of required) {
    if (t[field] === undefined || t[field] === null) {
      throw new Error(`Tool #${i} (${t.name || 'unnamed'}): missing required field "${field}"`);
    }
  }
  const validCategories = [
    'recon', 'exploitation', 'post-exploitation', 'defense', 'detection',
    'forensics', 'osint', 'c2', 'phishing', 'crypto', 'mobile', 'cloud',
    'network', 'reverse-engineering', 'web', 'misc',
  ];
  if (!validCategories.includes(t.category)) {
    throw new Error(`Tool #${i} "${t.name}": invalid category "${t.category}"`);
  }
  if (!Array.isArray(t.tags)) {
    throw new Error(`Tool #${i} "${t.name}": tags must be an array`);
  }
}

function main() {
  ensureDir(OUT);

  if (!existsSync(SOURCE_FILE)) {
    console.error(`Source file not found: ${SOURCE_FILE}`);
    console.error('Create public/data/tools/index.json with an array of ToolBody objects first.');
    process.exit(1);
  }

  const raw = readFileSync(SOURCE_FILE, 'utf-8');
  const bodies = JSON.parse(raw);

  if (!Array.isArray(bodies)) {
    throw new Error('Source file must contain a JSON array of ToolBody objects');
  }

  bodies.forEach((t, i) => validateTool(t, i));

  bodies.forEach((b) => {
    b.sizeBytes = JSON.stringify(b).length;
  });

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(bodies));

  console.log(`\u2714 Built Tools Directory manifest:`);
  console.log(`    ${bodies.length} tools in public/data/tools/index.json`);
  console.log(`    Categories: ${[...new Set(bodies.map((t) => t.category))].join(', ')}`);
}

main();
