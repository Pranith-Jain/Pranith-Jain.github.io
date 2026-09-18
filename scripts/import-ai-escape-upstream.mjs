#!/usr/bin/env node
/**
 * Import missing incidents from the ai-escape.watch upstream app.js into
 * the curatorial seed (threat-intel-staging/ai-escape/seed.json).
 *
 * The seed rule: summaries must be original condensations of the cited
 * sources, disputed figures flagged never averaged, and every entry needs
 * at least one source. Upstream ships its registry as a JS array literal
 * (const INCIDENTS = [...]) inside https://ai-escape.watch/app.js; each
 * entry already carries condensed summaries + sources, so import means
 * copying the upstream entry, verifying its schema against the same
 * fail-closed rules the build enforces, and appending only ids that are
 * missing locally. Never deletes or rewrites existing seed entries.
 *
 * Usage:
 *   node scripts/import-ai-escape-upstream.mjs [--dry-run]
 *   (reads /tmp/aew-app.js if present, else fetches app.js fresh)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SEED = join(ROOT, 'threat-intel-staging', 'ai-escape', 'seed.json');
const APPJS_CACHE = '/tmp/aew-app.js';
const APPJS_URL = 'https://ai-escape.watch/app.js';
const UA = 'pranithjain-ai-security-sync/1.0 (+https://pranithjain.qzz.io)';

const DRY = process.argv.includes('--dry-run');

const KLASS = new Set(['containment-breach', 'agent-hijack', 'supply-chain', 'tool-misuse', 'injection']);
const SEV = new Set(['critical', 'severe', 'notable', 'contained']);
const TIER = new Set(['A', 'B', 'C', 'D', 'X']);
const CHAIN = ['PRESSURE', 'PROBE', 'BREACH', 'CHANNEL', 'ESCALATE', 'PROPAGATE', 'HALT'];

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

function validate(inc) {
  const problems = [];
  for (const f of ['id', 'title', 'klass', 'sev', 'tier', 'occurred', 'disclosed', 'developer', 'actor', 'systems', 'targets', 'purpose', 'summary']) {
    if (inc[f] === undefined || inc[f] === null || inc[f] === '') problems.push(`missing ${f}`);
  }
  if (!KLASS.has(inc.klass)) problems.push(`bad klass ${inc.klass}`);
  if (!SEV.has(inc.sev)) problems.push(`bad sev ${inc.sev}`);
  if (!TIER.has(inc.tier)) problems.push(`bad tier ${inc.tier}`);
  if (typeof inc.cbs !== 'number' || inc.cbs < 0 || inc.cbs > 10) problems.push(`bad cbs ${inc.cbs}`);
  if (Number.isNaN(Date.parse(inc.occurred))) problems.push('bad occurred');
  if (Number.isNaN(Date.parse(inc.disclosed))) problems.push('bad disclosed');
  if (typeof inc.autonomous !== 'boolean') problems.push('autonomous not boolean');
  if (!inc.chain || typeof inc.chain !== 'object') problems.push('missing chain');
  else for (const stage of CHAIN) {
    if (!(stage in inc.chain)) problems.push(`chain missing ${stage}`);
    else if (inc.chain[stage] !== null && typeof inc.chain[stage] !== 'string') problems.push(`chain.${stage} not string|null`);
  }
  if (!Array.isArray(inc.failed)) problems.push('failed not array');
  if (!Array.isArray(inc.sources) || inc.sources.length === 0) problems.push('no sources');
  else {
    for (const s of inc.sources) {
      if (!s.label || !s.url) problems.push('source missing label/url');
      else {
        try {
          const u = new URL(s.url);
          if (!['http:', 'https:'].includes(u.protocol)) problems.push(`bad source url ${s.url}`);
        } catch {
          problems.push(`bad source url ${s.url}`);
        }
      }
    }
  }
  return problems;
}

async function loadAppJs() {
  if (existsSync(APPJS_CACHE)) {
    console.log(`using cached ${APPJS_CACHE}`);
    return readFileSync(APPJS_CACHE, 'utf8');
  }
  const res = await fetch(APPJS_URL, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) fail(`fetch failed: ${APPJS_URL} → ${res.status}`);
  return await res.text();
}

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const localIds = new Set((seed.incidents ?? []).map((i) => i.id));

const src = await loadAppJs();
const start = src.indexOf('const INCIDENTS = [');
if (start === -1) fail('INCIDENTS array not found in app.js');
const end = src.indexOf('\n];', start);
if (end === -1) fail('INCIDENTS array not terminated in app.js');
const arrSrc = src.slice(start + 'const INCIDENTS ='.length, end + 2);
// The array is a plain JS object literal (no functions/imports) — eval in
// this script's scope is the pragmatic parser. Inputs come from the
// upstream site over TLS; validation below fail-closes every field before
// anything touches the seed.
const upstream = eval(arrSrc);
if (!Array.isArray(upstream) || upstream.length === 0) fail('parsed INCIDENTS is empty');

const missing = upstream.filter((i) => i && i.id && !localIds.has(i.id));
console.log(`upstream: ${upstream.length} incidents, local seed: ${localIds.size}, missing: ${missing.length}`);
for (const i of missing) console.log(`  + ${i.id} ${String(i.title ?? '').slice(0, 72)}`);

if (missing.length === 0) {
  console.log('nothing to import — seed is in parity with upstream');
  process.exit(0);
}

const imported = [];
for (const inc of missing) {
  const problems = validate(inc);
  if (problems.length > 0) {
    console.error(`  ✘ ${inc.id ?? '?'}: ${problems.join('; ')} — SKIPPED (fix upstream or import manually)`);
    continue;
  }
  // Normalize key order to match the existing seed shape; carry every
  // upstream field through (purposeNote, note, ended, discloser, cat…).
  const ordered = {};
  for (const k of ['id', 'title', 'klass', 'sev', 'tier', 'cbs', 'occurred', 'disclosed', 'dwell', 'autonomous', 'developer', 'ended', 'discloser', 'actor', 'systems', 'targets', 'purpose', 'purposeNote', 'summary', 'note', 'disputed', 'chain', 'failed', 'cat', 'sources']) {
    if (inc[k] !== undefined) ordered[k] = inc[k];
  }
  // Anything not in the known key set still comes through (future fields).
  for (const k of Object.keys(inc)) if (!(k in ordered)) ordered[k] = inc[k];
  imported.push(ordered);
}

if (imported.length === 0) fail('all missing entries failed validation — nothing imported');

if (DRY) {
  console.log(`dry-run: would import ${imported.length} incidents: ${imported.map((i) => i.id).join(', ')}`);
  process.exit(0);
}

seed.incidents.push(...imported);
// Keep seed sorted by id so diffs stay readable.
seed.incidents.sort((a, b) => a.id.localeCompare(b.id));
seed.compiled = new Date().toISOString().slice(0, 10);
writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
console.log(`✔ imported ${imported.length} → seed now holds ${seed.incidents.length} incidents`);
console.log('next: node scripts/build-ai-escape.mjs');
