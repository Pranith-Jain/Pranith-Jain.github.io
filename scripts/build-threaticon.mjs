#!/usr/bin/env node
/**
 * Build the threaticon.com manifest tree under
 * public/data/threat-intel/threaticon/.
 *
 * Reads from ./threat-intel-staging/threaticon/ (created by
 * `node scripts/sync-threaticon.mjs`) and emits:
 *   public/data/threat-intel/threaticon/index.json      — slim actor index + meta
 *   public/data/threat-intel/threaticon/actors/<slug>.json — one profile per actor
 *   public/data/threat-intel/threaticon/malware.json    — full family dictionary
 *   public/data/threat-intel/threaticon/coverage.json   — detection coverage (493 techniques)
 *   public/data/threat-intel/threaticon/map.json        — origin × targeted aggregates
 *
 * The manifest is read at runtime by worker/lib/threat-intel-manifest.ts
 * through env.ASSETS — no D1, no KV, no public fetch.
 *
 * The malware.json family dictionary is also consumed by
 * scripts/build-tc-entities.mjs to enrich the ThreatCluster entity
 * extraction (quick win #2).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threaticon');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'threaticon');

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    console.warn(`  ⚠ invalid JSON in ${p} — ignoring`);
    return null;
  }
}

const COVERAGE = readJsonIfExists(join(STAGING, 'coverage.json'));
const MALWARE = readJsonIfExists(join(STAGING, 'malware/list.json'));
const ACTOR_LIST = readJsonIfExists(join(STAGING, 'actors/index.json'));

if (!COVERAGE || !MALWARE || !ACTOR_LIST) {
  console.error('✘ Staging missing. Run: node scripts/sync-threaticon.mjs first.');
  process.exit(1);
}

// Wipe and rebuild the manifest tree.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'actors'), { recursive: true });

/* ─── Malware dictionary ─────────────────────────────────────────────── */
// tlpNormalize: TLP:CLEAR → white, TLP:AMBER → amber, … (STIX-style names).
function tlpNormalize(raw) {
  const t = (raw ?? '').replace(/^TLP:/i, '').toLowerCase();
  if (t === 'clear') return 'white';
  return ['red', 'amber', 'green', 'white'].includes(t) ? t : null;
}

const families = (MALWARE.families ?? [])
  .filter((f) => f?.name && f.name !== 'Unknown')
  .map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category ?? null,
    tlp: tlpNormalize(f.tlp),
    confidence: f.confidence ?? null,
    // The list-page status span only renders for green/red states; an old
    // parser bug mirrored the category into status. Guard against that.
    status: f.status && f.status !== f.category ? f.status : null,
  }));
families.sort((a, b) => a.name.localeCompare(b.name));
const byCategory = {};
for (const f of families) {
  byCategory[f.category ?? 'Unknown'] = (byCategory[f.category ?? 'Unknown'] ?? 0) + 1;
}

/* ─── Actor profiles + index ─────────────────────────────────────────── */
const listByNumericId = new Map((ACTOR_LIST.actors ?? []).map((a) => [a.id, a]));
const detailsDir = join(STAGING, 'actors/details');
const detailFiles = existsSync(detailsDir) ? readdirSync(detailsDir).filter((f) => f.endsWith('.json')) : [];

const usedSlugs = new Map();
function slugFor(name, id) {
  const base = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const candidate = base || `actor-${id}`;
  if (!usedSlugs.has(candidate)) {
    usedSlugs.set(candidate, 1);
    return candidate;
  }
  const deduped = `${candidate}-${id}`;
  usedSlugs.set(deduped, 1);
  return deduped;
}

function cleanAliases(raw) {
  if (!raw) return [];
  const out = [];
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (t.length < 2) continue;
    if (/identified|alias|since|emerged|also|other|several|first|known/i.test(t)) continue;
    if (/^\d{4}$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

function originCode(countryOfOrigin, listCountry) {
  const m = /\(([A-Z]{2,3})\)/.exec(countryOfOrigin ?? '');
  if (m) return m[1];
  if (/^[A-Z]{2}$/.test(listCountry ?? '')) return listCountry;
  return null;
}

const actors = [];
const profiles = [];
let detailCount = 0;
for (const file of detailFiles) {
  const detail = readJsonIfExists(join(detailsDir, file));
  if (!detail?.id) continue;
  const list = listByNumericId.get(detail.id) ?? {};
  const name = detail.name ?? list.name ?? `Actor ${detail.id}`;
  const slug = slugFor(name, detail.id);
  const types = (detail.types?.length ? detail.types : list.type ? [list.type] : []).filter((t) => t && t !== 'Unknown');
  const tags = (detail.tags ?? []).filter((t) => t && !/^[-_]+$/.test(t)).slice(0, 15);
  const aliases = cleanAliases(list.aliases);
  const profile = {
    slug,
    id: detail.id,
    name,
    mitreId: detail.mitreId ?? null,
    status: detail.status ?? list.status ?? null,
    tlp: tlpNormalize(detail.tlp) ?? tlpNormalize(list.tlp),
    confidence: detail.confidence ?? list.confidence ?? null,
    types,
    countryOfOrigin: detail.countryOfOrigin ?? null,
    originCode: originCode(detail.countryOfOrigin, list.country),
    sophistication: detail.sophistication ?? null,
    resourceLevel: detail.resourceLevel ?? null,
    motivation: detail.motivation ?? null,
    added: detail.added ?? null,
    tags,
    aliases,
    targetedSectors: detail.targetedSectors ?? [],
    targetedCountries: detail.targetedCountries ?? [],
    tactics: detail.tactics ?? [],
    techniques: detail.techniques ?? [],
    tools: detail.tools ?? [],
    iocPatterns: detail.iocPatterns ?? [],
    keyCapabilities: detail.keyCapabilities ?? [],
    recommendedActions: detail.recommendedActions ?? [],
    campaignsText: detail.campaignsText ?? null,
    description: detail.description ?? null,
    goals: detail.goals ?? null,
    killChain: detail.killChainEntity
      ? `https://threaticon.com/graph/kill-chain?entity=${detail.killChainEntity}%3A${detail.id}`
      : null,
    sourceUrl: `https://threaticon.com/threat-actors/${detail.id}`,
  };
  profiles.push(profile);
  actors.push({
    slug,
    id: detail.id,
    name,
    mitreId: profile.mitreId,
    status: profile.status,
    tlp: profile.tlp,
    confidence: profile.confidence,
    types,
    originCode: profile.originCode,
    countryOfOrigin: profile.countryOfOrigin,
    techniquesCount: profile.techniques.length,
    toolsCount: profile.tools.length,
    targetedCountriesCount: profile.targetedCountries.length,
    tagsCount: tags.length,
    added: profile.added,
  });
  detailCount++;
}
actors.sort((a, b) => a.name.localeCompare(b.name));
for (const a of actors) {
  writeFileSync(join(OUT, 'actors', `${safeFilename(a.slug)}.json`), JSON.stringify(profiles.find((p) => p.slug === a.slug)));
}

/* ─── Threat map aggregates ──────────────────────────────────────────── */
const originCounts = new Map();
const targetedCounts = new Map();
const sectorCounts = new Map();
for (const p of profiles) {
  if (p.originCode) originCounts.set(p.originCode, (originCounts.get(p.originCode) ?? 0) + 1);
  for (const c of p.targetedCountries) targetedCounts.set(c, (targetedCounts.get(c) ?? 0) + 1);
  for (const s of p.targetedSectors) sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
}
const mapData = {
  builtAt: new Date().toISOString(),
  origin: [...originCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
  targeted: [...targetedCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
  sectors: [...sectorCounts.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count),
};

/* ─── Index ──────────────────────────────────────────────────────────── */
const index = {
  source: 'threaticon.com',
  url: 'https://threaticon.com/',
  description:
    'Threaticon is a STIX 2.1 / TAXII 2.1 threat-intel platform (solo-run by Jefferson Shillingford) aggregating threat actors, malware families, campaigns, CVEs and ATT&CK detection coverage. Public preview content mirrored for read-only reference — structured facts only, AI-generated prose excluded.',
  syncedAt: COVERAGE.syncedAt,
  builtAt: new Date().toISOString(),
  counts: {
    actors: actors.length,
    actorsWithProfiles: detailCount,
    malwareFamilies: families.length,
    malwareCategories: Object.keys(byCategory).length,
    techniques: COVERAGE.techniques.length,
    tactics: Object.keys(COVERAGE.tactics ?? {}).length,
    originCountries: mapData.origin.length,
    targetedCountries: mapData.targeted.length,
    sectors: mapData.sectors.length,
  },
  tactics: COVERAGE.tactics ?? {},
  actors,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
writeFileSync(join(OUT, 'malware.json'), JSON.stringify({
  source: 'threaticon.com/malware',
  syncedAt: MALWARE.syncedAt,
  familyCount: families.length,
  byCategory,
  families,
}));
writeFileSync(join(OUT, 'coverage.json'), JSON.stringify({
  source: 'threaticon.com/detection-coverage',
  syncedAt: COVERAGE.syncedAt,
  techniqueCount: COVERAGE.techniques.length,
  tactics: COVERAGE.tactics ?? {},
  techniques: COVERAGE.techniques,
}));
writeFileSync(join(OUT, 'map.json'), JSON.stringify(mapData));

console.log('✔ Built threaticon manifest:');
console.log(`    ${actors.length} actors          (public/data/threat-intel/threaticon/actors/)`);
console.log(`    ${families.length} malware families (public/data/threat-intel/threaticon/malware.json)`);
console.log(`    ${COVERAGE.techniques.length} techniques     (public/data/threat-intel/threaticon/coverage.json)`);
console.log(`    ${mapData.origin.length} origin / ${mapData.targeted.length} targeted countries (public/data/threat-intel/threaticon/map.json)`);
