#!/usr/bin/env node
/**
 * Build the Living Threat Repository manifest under
 * public/data/threat-intel/living-threat/.
 *
 * Reads staging in ./threat-intel-staging/living-threat/ (created by
 * `node scripts/sync-living-threat.mjs`) and emits:
 *   index.json            (slim — source meta, counts, tactic/severity
 *                          breakdowns, per-incident slim entries)
 *   shards/<nnnn>.json    (full incident bodies, 500 per shard — keeps the
 *                          deployment well under the 20k static-asset cap;
 *                          the index points each incident at its shard)
 *
 * The manifest is read at runtime by worker/lib/threat-intel-manifest.ts
 * through env.ASSETS — no D1, no KV, no public fetch.
 *
 * Upstream caps the bootstrap API at 5000 incidents (index holds ~21k);
 * this build ships the newest 5000 — a documented cap, same trade-off as
 * the Threaticon catalog exclusion.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'living-threat');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'living-threat');

const SHARD_SIZE = 500; // ~4 MB of UTF-8 JSON per shard
const TACTIC_KEY_RE = /_(tactic|tactics)(_|$)/i;

const TACTIC_NAMES = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
];

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Stable, collision-safe slug tied to the upstream sequence number. */
function incidentSlug(doc) {
  const seq = Number.isInteger(doc.sequence) ? doc.sequence : hashString(String(doc.id ?? doc.Title ?? ''));
  const base = safeFilename(String(doc.Title ?? 'unknown')).slice(0, 72) || 'unknown';
  return `${base}-${String(seq).padStart(6, '0')}`;
}

function collectTechniques(doc) {
  const out = { tactics: [], techniques: [] };
  const seen = new Set();
  const seenT = new Set();
  for (const a of Array.isArray(doc.Analyses) ? doc.Analyses : []) {
    for (const t of a.Tactics ?? []) {
      const name = t?.tactic_name ?? t?.tactic_id;
      if (name && typeof name === 'string' && !seenT.has(name)) {
        seenT.add(name);
        out.tactics.push(name);
      }
    }
    for (const tid of a.Techniques ?? []) {
      if (typeof tid === 'string' && tid && !seen.has(tid)) {
        seen.add(tid);
        out.techniques.push(tid);
      }
    }
  }
  return out;
}

function readStaging() {
  const p = join(STAGING, 'incidents.json');
  if (!existsSync(p)) {
    console.error(`  ⚠ no staging file at ${p} — run \`node scripts/sync-living-threat.mjs\` first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const USELESS_ACTOR = new Set([
  'None',
  'Unknown',
  'no significant information detected',
  'not reported',
  'unknown (no attribution)',
]);

function cleanActors(doc) {
  const out = [];
  for (const a of Array.isArray(doc.Threat_Actors) ? doc.Threat_Actors : []) {
    if (typeof a !== 'string') continue;
    const name = a.trim();
    if (!name || USELESS_ACTOR.has(name.toLowerCase())) continue;
    out.push(name);
    if (out.length >= 6) break;
  }
  return out;
}

function toSlim(doc, slug, shard) {
  const t = collectTechniques(doc);
  const cves = Array.isArray(doc.CVEs) ? doc.CVEs : [];
  const tools = Array.isArray(doc.Tools) ? doc.Tools : [];
  return {
    slug,
    shard,
    sequence: Number.isInteger(doc.sequence) ? doc.sequence : null,
    id: doc.id ?? null,
    title: String(doc.Title ?? ''),
    timestamp: doc.Timestamp ?? null,
    source: String(doc.source ?? ''),
    severity: String(doc.Severity ?? ''),
    priorityScore: typeof doc.priority_score === 'number' ? doc.priority_score : null,
    relevanceScore: typeof doc.relevance_score === 'number' ? doc.relevance_score : null,
    tactics: t.tactics.slice(0, 14),
    techniques: t.techniques,
    actors: cleanActors(doc),
    techniqueCount: t.techniques.length,
    cves: cves.length,
    tools: tools.length,
    sizeBytes: 0,
  };
}

function main() {
  console.log('Living Threat build — writing into', OUT);
  const staged = readStaging();
  const docs = Array.isArray(staged.docs) ? staged.docs : [];
  if (docs.length === 0) {
    console.error('  ✘ staging has zero incidents — aborting');
    process.exit(1);
  }

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(join(OUT, 'shards'), { recursive: true });

  // Order docs by upstream order (already priority/timestamp sorted), keep as-is.
  const slim = [];
  const bySeverity = {};
  const byTactic = {};
  const techCounts = new Map();
  const cveSet = new Set();
  const actorSets = new Map();
  const toolSets = new Map();
  const sourceCounts = new Map();
  let shardIndex = 0;
  const shardBodies = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (i % SHARD_SIZE === 0 && i > 0) shardIndex += 1;
    const slug = incidentSlug(doc);
    const t = collectTechniques(doc);
    for (const name of t.tactics) byTactic[name] = (byTactic[name] ?? 0) + 1;
    for (const tid of t.techniques) techCounts.set(tid, (techCounts.get(tid) ?? 0) + 1);
    for (const cve of Array.isArray(doc.CVEs) ? doc.CVEs : []) if (typeof cve === 'string') cveSet.add(cve);
    for (const a of Array.isArray(doc.Threat_Actors) ? doc.Threat_Actors : []) {
      if (typeof a === 'string' && a && a !== 'None' && a !== 'No significant information detected') {
        actorSets.set(a, (actorSets.get(a) ?? 0) + 1);
      }
    }
    for (const tl of Array.isArray(doc.Tools) ? doc.Tools : []) {
      if (typeof tl === 'string' && tl && tl !== 'None') toolSets.set(tl, (toolSets.get(tl) ?? 0) + 1);
    }
    const src = String(doc.source ?? '');
    if (src && src !== 'None') sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    const sev = String(doc.Severity ?? '');
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;

    const body = JSON.stringify(doc);
    const entry = { ...doc, slug, shard: shardIndex };
    shardBodies[shardIndex] ??= [];
    shardBodies[shardIndex].push(entry);
    const sl = toSlim(doc, slug, shardIndex);
    sl.sizeBytes = Buffer.byteLength(body, 'utf8');
    slim.push(sl);
  }

  for (let s = 0; s < shardBodies.length; s++) {
    const shard = shardBodies[s];
    writeFileSync(join(OUT, 'shards', String(s).padStart(4, '0') + '.json'), JSON.stringify(shard));
  }

  const topTechniques = [...techCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([id, count]) => ({ id, count }));
  const topActors = [...actorSets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, count]) => ({ name, count }));
  const topTools = [...toolSets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, count]) => ({ name, count }));
  const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([url, count]) => ({ url, count }));

  const index = {
    source: staged.source,
    sourceUrl: staged.sourceUrl,
    repoUrl: staged.repoUrl,
    description: staged.description,
    license: staged.license,
    syncedAt: staged.syncedAt,
    meta: {
      apiIndex: staged.meta?.apiIndex ?? null,
      latestTs: staged.meta?.latestTs ?? null,
      latestSeq: staged.meta?.latestSeq ?? null,
      anchorTs: staged.meta?.anchorTs ?? null,
      fetchedAt: staged.meta?.fetchedAt ?? null,
      cap: 'Upstream /api/bootstrap caps at 5000 docs; index holds ~21k. Newest 5000 shipped.',
    },
    counts: {
      incidents: docs.length,
      shards: shardBodies.length,
      shardSize: SHARD_SIZE,
      bySeverity,
      byTactic: Object.fromEntries(TACTIC_NAMES.filter((n) => byTactic[n] !== undefined).map((n) => [n, byTactic[n]])),
      uniqueCves: cveSet.size,
      uniqueTechniques: techCounts.size,
    },
    topTechniques,
    topActors,
    topTools,
    topSources,
    incidents: slim,
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

  const idxBytes = Buffer.byteLength(JSON.stringify(index), 'utf8');
  console.log(`    ✔ index.json (${docs.length} incidents, ${shardBodies.length} shards, ${(idxBytes / 1e6).toFixed(2)} MB)`);
  console.log('    ✔ severity:', JSON.stringify(bySeverity));
  console.log('    ✔ tactics:', Object.keys(byTactic).length, '| techniques:', techCounts.size, '| cves:', cveSet.size);
}

main();