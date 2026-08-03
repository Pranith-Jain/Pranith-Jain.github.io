#!/usr/bin/env node
/**
 * Build the Signature-Base manifest under public/data/sigbase/.
 *
 * Reads source files from ./signature-base-replication/ (the
 * upstream-tracking folder; not committed). Re-run after editing that
 * folder or after `node scripts/sync-sigbase.mjs` to pick up
 * upstream changes.
 *
 * Source: github.com/Neo23x0/signature-base (DRL 1.1)
 *
 * Emits:
 *   public/data/sigbase/index.json            (slim — no bodies)
 *   public/data/sigbase/yara/<slug>.json      (1 per .yar file, full source)
 *   public/data/sigbase/iocs/<slug>.json      (1 per IOC list, entries)
 *
 * Safe to run repeatedly — wipes public/data/sigbase/ on each run.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SB = join(ROOT, 'signature-base-replication');
const OUT = join(ROOT, 'public', 'data', 'sigbase');

const SOURCE = 'github.com/Neo23x0/signature-base';
const LICENSE = 'Detection Rule License 1.1';

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Extract the leading block comment (Author/Date/Identifier header) if any. */
function extractHeader(text) {
  const m = /^\/\*([\s\S]*?)\*\//.exec(text);
  return m ? m[1].trim() : '';
}

/** Split a .yar file into its `rule <name> { ... }` blocks (best effort). */
function extractRules(text) {
  const rules = [];
  const re = /\brule\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    const meta = {};
    const metaRe = /^\s*([a-z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s]+))/gim;
    let mm;
    while ((mm = metaRe.exec(body)) !== null) {
      meta[mm[1].toLowerCase()] = (mm[2] ?? mm[3] ?? mm[4]).trim();
    }
    rules.push({ name, meta });
  }
  return rules;
}

function parseHashLine(line) {
  const [value, ...rest] = line.split(';');
  const comment = rest.join(';').trim();
  const v = value.trim().toLowerCase();
  let type = null;
  if (/^[0-9a-f]{32}$/.test(v)) type = 'md5';
  else if (/^[0-9a-f]{40}$/.test(v)) type = 'sha1';
  else if (/^[0-9a-f]{64}$/.test(v)) type = 'sha256';
  return { value: v, comment, type };
}

function parseC2Line(line) {
  // c2-iocs.txt is plain domain/ip lines; any `;` suffix is a comment.
  const [value, ...rest] = line.split(';');
  const comment = rest.join(';').trim();
  const v = value.trim();
  let type = null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) type = 'ip';
  else if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) type = 'domain';
  else type = 'c2';
  return { value: v, comment, type };
}

function parseFilenameLine(line) {
  // FORMAT: REGEX;SCORE[;EXCLUDE FALSE POSITIVE REGEX]
  const [regex, score, exclude] = line.split(';');
  return { value: regex.trim(), score: score ? parseInt(score.trim(), 10) : null, exclude: exclude?.trim() || null };
}

function parseKeywords(lines) {
  // keywords.txt groups entries under `# Category` headers.
  const entries = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) {
      if (line.startsWith('# ') && !/^# (MALICIOUS|FORMAT|EXAMPLES)/i.test(line)) {
        current = line.slice(1).trim();
      }
      continue;
    }
    entries.push({ value: line.trim(), category: current });
  }
  return entries;
}

if (!existsSync(SB)) {
  console.error(`✘ Source folder missing: ${SB}`);
  console.error('  Re-fetch from upstream:');
  console.error('    node scripts/sync-sigbase.mjs');
  process.exit(1);
}

// Wipe and rebuild.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'yara'));
ensureDir(join(OUT, 'iocs'));

const externalVarFiles = new Set();
const extPath = join(SB, 'yara', 'external-variable-rules.txt');
if (existsSync(extPath)) {
  for (const line of readFileSync(extPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) externalVarFiles.add(t);
  }
}

// ─── YARA RULES ──────────────────────────────────────────────────────
const yaraIndex = [];
const yaraDir = join(SB, 'yara');
for (const f of readdirSync(yaraDir).filter((n) => n.endsWith('.yar') && n !== 'external-variable-rules.txt').sort()) {
  const fp = join(yaraDir, f);
  const text = readFileSync(fp, 'utf8');
  const header = extractHeader(text);
  const rules = extractRules(text);
  const slug = slugify(f.replace(/\.yar$/, ''));

  // First rule's meta carries the useful identifier info.
  const first = rules[0]?.meta ?? {};
  const tags = [];
  const m = /^([a-z]+)_/.exec(f);
  if (m) tags.push(m[1]);
  for (const r of rules) {
    for (const t of r.meta?.tags ?? []) tags.push(t);
  }
  const score = first.score ? parseInt(first.score, 10) : null;

  yaraIndex.push({
    slug,
    filename: f,
    identifier: header ? /Identifier:\s*(.+)/i.exec(header)?.[1]?.trim() ?? null : null,
    ruleCount: rules.length,
    tags: [...new Set(tags)],
    author: first.author ?? null,
    date: first.date ?? null,
    score,
    externalVars: externalVarFiles.has(f),
    sizeBytes: text.length,
  });

  writeFileSync(join(OUT, 'yara', `${slug}.json`), JSON.stringify({
    slug,
    filename: f,
    source: SOURCE,
    license: LICENSE,
    headerComment: header,
    rules,
    body: text,
  }));
}

// ─── IOC LISTS ───────────────────────────────────────────────────────
const iocIndex = [];
const iocDir = join(SB, 'iocs');
const IOC_DEFS = [
  { file: 'hash-iocs.txt', slug: 'hash-iocs', title: 'Evil Hashes (MD5/SHA1/SHA256)', type: 'hash' },
  { file: 'c2-iocs.txt', slug: 'c2-iocs', title: 'C2 Servers and Domains', type: 'c2' },
  { file: 'filename-iocs.txt', slug: 'filename-iocs', title: 'Suspicious Filenames (regex)', type: 'filename' },
  { file: 'keywords.txt', slug: 'keywords', title: 'Malicious Keywords', type: 'keyword' },
];

for (const def of IOC_DEFS) {
  const fp = join(iocDir, def.file);
  if (!existsSync(fp)) continue;
  const lines = readFileSync(fp, 'utf8').split('\n');
  const dataLines = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

  let entries;
  if (def.type === 'hash') entries = dataLines.map(parseHashLine).filter((e) => e.type);
  else if (def.type === 'c2') entries = dataLines.map(parseC2Line);
  else if (def.type === 'filename') entries = dataLines.map(parseFilenameLine);
  else entries = parseKeywords(dataLines);

  const body = {
    slug: def.slug,
    title: def.title,
    type: def.type,
    source: SOURCE,
    license: LICENSE,
    entryCount: entries.length,
    entries,
  };
  iocIndex.push({
    slug: def.slug,
    title: def.title,
    type: def.type,
    entryCount: entries.length,
    sizeBytes: JSON.stringify(body).length,
  });
  writeFileSync(join(OUT, 'iocs', `${def.slug}.json`), JSON.stringify(body));
}

// ─── INDEX ───────────────────────────────────────────────────────────
const index = {
  source: SOURCE,
  license: LICENSE,
  replicatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    yaraFiles: yaraIndex.length,
    yaraRules: yaraIndex.reduce((a, b) => a + b.ruleCount, 0),
    iocFiles: iocIndex.length,
    iocEntries: iocIndex.reduce((a, b) => a + b.entryCount, 0),
    externalVarFiles: externalVarFiles.size,
  },
  yaraIndex,
  iocIndex,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log(`✔ Built Signature-Base manifest:`);
console.log(`    ${yaraIndex.length} YARA files  (${index.counts.yaraRules} rules total, in public/data/sigbase/yara/)`);
console.log(`    ${iocIndex.length} IOC lists   (${index.counts.iocEntries} entries, in public/data/sigbase/iocs/)`);
console.log(`    ${externalVarFiles.size} files need LOKI/THOR external variables`);
console.log(`    Source: ${SOURCE} (${LICENSE})`);
