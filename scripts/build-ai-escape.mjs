#!/usr/bin/env node
/**
 * Build the AI Escape Watch manifest under public/data/ai-escape/.
 *
 * Reads threat-intel-staging/ai-escape/seed.json (curatorial seed — summaries
 * are original condensations of the cited sources; disputed figures flagged,
 * never averaged) and emits:
 *   public/data/ai-escape/index.json            (slim rows + stats + clock)
 *   public/data/ai-escape/incidents/<id>.json   (full dockets)
 *   public/data/ai-escape/guardrails.json       (10 control definitions)
 *   public/data/ai-escape/trackers.json         (provenance table)
 *
 * Validation is fail-closed: bad klass/sev/tier/cbs/chain fails the build.
 * There is no sync script — new disclosures land via PR against seed.json
 * (reviewed before publish, same rule as the reference registry).
 *
 * Usage: node scripts/build-ai-escape.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SEED = join(ROOT, 'threat-intel-staging', 'ai-escape', 'seed.json');
const OUT = join(ROOT, 'public', 'data', 'ai-escape');

const KLASS = new Set(['containment-breach', 'agent-hijack', 'supply-chain', 'tool-misuse', 'injection']);
const SEV = new Set(['critical', 'severe', 'notable', 'contained']);
const TIER = new Set(['A', 'B', 'C', 'D', 'X']);
const CHAIN = ['PRESSURE', 'PROBE', 'BREACH', 'CHANNEL', 'ESCALATE', 'PROPAGATE', 'HALT'];
// CBS v0.1 draft weights (informational — scores are curated, not computed here).
const CBS_WEIGHTS = { AUTONOMY: 2.0, BOUNDARY: 2.5, PERSISTENCE: 1.5, COORDINATION: 1.5, IMPACT: 1.5, DWELL: 1.0 };

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}
function safeId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_');
}

if (!existsSync(SEED)) fail(`Seed missing: ${SEED}`);

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const { incidents, guardrails, trackers } = seed;
if (!Array.isArray(incidents) || incidents.length === 0) fail('seed.incidents must be a non-empty array');
if (!Array.isArray(guardrails) || guardrails.length !== 10) fail('seed.guardrails must hold exactly 10 controls');
if (!Array.isArray(trackers) || trackers.length === 0) fail('seed.trackers must be a non-empty array');

const guardIds = new Set(guardrails.map((g) => g.id));
const seenIds = new Set();
const slim = [];

for (const inc of incidents) {
  for (const f of ['id', 'title', 'klass', 'sev', 'tier', 'occurred', 'disclosed', 'developer', 'actor', 'systems', 'targets', 'purpose', 'summary']) {
    if (inc[f] === undefined || inc[f] === null || inc[f] === '') fail(`${inc.id ?? '?'}: missing required field ${f}`);
  }
  if (seenIds.has(inc.id)) fail(`duplicate incident id ${inc.id}`);
  seenIds.add(inc.id);
  if (!KLASS.has(inc.klass)) fail(`${inc.id}: bad klass ${inc.klass}`);
  if (!SEV.has(inc.sev)) fail(`${inc.id}: bad sev ${inc.sev}`);
  if (!TIER.has(inc.tier)) fail(`${inc.id}: bad tier ${inc.tier}`);
  if (typeof inc.cbs !== 'number' || inc.cbs < 0 || inc.cbs > 10) fail(`${inc.id}: bad cbs ${inc.cbs}`);
  if (Number.isNaN(Date.parse(inc.occurred))) fail(`${inc.id}: bad occurred ${inc.occurred}`);
  if (Number.isNaN(Date.parse(inc.disclosed))) fail(`${inc.id}: bad disclosed ${inc.disclosed}`);
  if (typeof inc.autonomous !== 'boolean') fail(`${inc.id}: autonomous must be boolean`);
  if (!inc.chain || typeof inc.chain !== 'object') fail(`${inc.id}: missing chain`);
  for (const stage of CHAIN) {
    if (!(stage in inc.chain)) fail(`${inc.id}: chain missing stage ${stage}`);
    if (inc.chain[stage] !== null && typeof inc.chain[stage] !== 'string') fail(`${inc.id}: chain.${stage} must be string|null`);
  }
  if (!Array.isArray(inc.failed)) fail(`${inc.id}: failed must be an array`);
  for (const g of inc.failed) {
    if (!guardIds.has(g)) fail(`${inc.id}: unknown guardrail ${g}`);
  }
  if (!Array.isArray(inc.sources) || inc.sources.length === 0) fail(`${inc.id}: at least one source required`);
  for (const s of inc.sources) {
    if (!s.label || !s.url) fail(`${inc.id}: source needs label+url`);
    try {
      const u = new URL(s.url);
      if (!['http:', 'https:'].includes(u.protocol)) fail(`${inc.id}: bad source url ${s.url}`);
    } catch {
      fail(`${inc.id}: bad source url ${s.url}`);
    }
  }
  slim.push({
    id: inc.id, title: inc.title, klass: inc.klass, sev: inc.sev, tier: inc.tier, cbs: inc.cbs,
    occurred: inc.occurred, disclosed: inc.disclosed, dwell: inc.dwell ?? null,
    autonomous: inc.autonomous, developer: inc.developer, purpose: inc.purpose, failed: inc.failed,
  });
}

slim.sort((a, b) => a.occurred.localeCompare(b.occurred));

// ── stats ──────────────────────────────────────────────────────────────────
const n = slim.length;
const tierA = slim.filter((i) => i.tier === 'A').length;
const evalEnv = slim.filter((i) => ['CB-2026-0015', 'CB-2026-0014', 'CB-2026-0012', 'CB-2026-0009'].includes(i.id)).length;
const auto = slim.filter((i) => i.autonomous).length;
const jobExact = slim.filter((i) => /doing exactly|as designed|as set|ordinary .*request|ordinary .*task/i.test(
  (incidents.find((x) => x.id === i.id)?.purpose ?? '') + ' ' + (incidents.find((x) => x.id === i.id)?.summary ?? '')
)).length;
const dwells = slim.map((i) => i.dwell).filter((d) => typeof d === 'number').sort((a, b) => a - b);
const medianDwell = dwells.length ? dwells[Math.floor(dwells.length / 2)] : null;
const guardCounts = {};
for (const g of guardrails) guardCounts[g.id] = 0;
for (const i of slim) for (const g of i.failed) guardCounts[g] = (guardCounts[g] ?? 0) + 1;
const topGuard = Object.entries(guardCounts).sort((a, b) => b[1] - a[1])[0];
const lastDisclosed = [...slim].sort((a, b) => b.disclosed.localeCompare(a.disclosed))[0];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'incidents'), { recursive: true });

const index = {
  registry: seed.registry,
  version: seed.version,
  compiled: seed.compiled,
  builtAt: new Date().toISOString(),
  cbsScale: 'v0.1 draft',
  cbsWeights: CBS_WEIGHTS,
  chainStages: CHAIN,
  stats: {
    entries: n, tierA, evalEnvBreaches: evalEnv, autonomous: auto,
    medianDwellDays: medianDwell,
    dwellRange: dwells.length ? [dwells[0], dwells[dwells.length - 1]] : null,
    mostAbsentGuardrail: topGuard ? { id: topGuard[0], entries: topGuard[1] } : null,
    lastDisclosedAt: lastDisclosed?.disclosed ?? null,
    lastDisclosedId: lastDisclosed?.id ?? null,
    jobExactCount: jobExact,
  },
  guardrailCounts: guardCounts,
  incidents: slim,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
for (const inc of incidents) {
  writeFileSync(join(OUT, 'incidents', `${safeId(inc.id)}.json`), JSON.stringify(inc));
}
writeFileSync(join(OUT, 'guardrails.json'), JSON.stringify({ updatedAt: new Date().toISOString(), guardrails }));
writeFileSync(join(OUT, 'trackers.json'), JSON.stringify({ updatedAt: new Date().toISOString(), trackers }));

console.log('✔ Built:');
console.log(`    ${n} incidents (tiers A:${tierA}) · median dwell ${medianDwell ?? 'n/a'}d · most-absent ${topGuard?.[0]} (${topGuard?.[1]})`);
console.log(`    public/data/ai-escape/ (index + ${n} dockets + guardrails + trackers)`);
