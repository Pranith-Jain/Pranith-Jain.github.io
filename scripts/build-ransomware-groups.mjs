#!/usr/bin/env node
/**
 * Build the ransomware-groups manifest under public/data/ransomware-groups/.
 *
 * Reads threat-intel-staging/ransomware-groups/ (see sync-ransomware-groups.mjs):
 *   groups.json    — canonical [{ name, slug }]
 *   activity.json  — per-group counts + last_seen + victim samples
 *   profiles/*.json — enriched Ransomlook meta + locations (screen bytes stripped)
 *
 * Emits:
 *   public/data/ransomware-groups/index.json   — slim row per group (all ~620)
 *   public/data/ransomware-groups/groups/<slug>.json — bodies for groups with
 *     recent activity or an enriched profile (capped at 200 bodies to stay
 *     well under the Workers free-plan 20k static-asset cap)
 *
 * Row shape:
 *   { slug, name, victims_7d, victims_total, last_seen, origins[],
 *     online: true|false|null, mirrors, up_mirrors, has_profile, blurb }
 *
 * Usage: node scripts/build-ransomware-groups.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'ransomware-groups');
const OUT = join(ROOT, 'public', 'data', 'ransomware-groups');
const GROUPS_OUT = join(OUT, 'groups');
const MAX_BODIES = 200;

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}
function short(s, n = 200) {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

if (!existsSync(join(STAGING, 'groups.json')) || !existsSync(join(STAGING, 'activity.json'))) {
  console.error(`✘ Staging missing: ${STAGING}/groups.json + activity.json`);
  console.error('  Run: node scripts/sync-ransomware-groups.mjs first.');
  process.exit(1);
}

const { groups, syncedAt } = JSON.parse(readFileSync(join(STAGING, 'groups.json'), 'utf8'));
const activity = JSON.parse(readFileSync(join(STAGING, 'activity.json'), 'utf8'));
const perGroup = activity.perGroup ?? {};
const samples = activity.samples ?? {};

const profileFiles = existsSync(join(STAGING, 'profiles'))
  ? readdirSync(join(STAGING, 'profiles')).filter((f) => f.endsWith('.json'))
  : [];
const profiles = new Map();
for (const f of profileFiles) {
  try {
    const p = JSON.parse(readFileSync(join(STAGING, 'profiles', f), 'utf8'));
    if (p?.slug) profiles.set(p.slug, p);
  } catch {
    /* skip corrupt */
  }
}

const nowMs = Date.now();
const weekAgoMs = nowMs - 7 * 24 * 3600 * 1000;

const rows = [];
let upCount = 0;
let activeWeek = 0;
let profiled = 0;

for (const g of groups) {
  const a = perGroup[g.slug];
  const p = profiles.get(g.slug);
  const locs = (p?.profiles ?? []).flatMap((pr) => pr.locations ?? []).filter((l) => l.fqdn);
  const online = locs.length ? locs.some((l) => l.available) : null;
  const upMirrors = locs.filter((l) => l.available).length;
  const lastSeen = a?.last_seen ?? null;
  const active = lastSeen ? Date.parse(lastSeen) >= weekAgoMs : false;
  if (online) upCount++;
  if (active) activeWeek++;
  const meta = (p?.profiles ?? []).map((pr) => pr.meta).find(Boolean) ?? null;
  if (p) profiled++;
  rows.push({
    slug: g.slug,
    name: g.name,
    victims_7d: a?.victims_7d ?? 0,
    victims_total: a?.victims_total ?? 0,
    last_seen: lastSeen,
    origins: a?.origins ?? [],
    online,
    mirrors: locs.length,
    up_mirrors: upMirrors,
    has_profile: Boolean(p),
    blurb:
      short(meta) ??
      (a
        ? `${a.victims_7d} victim${a.victims_7d === 1 ? '' : 's'} in the last 7d across ${a.origins.length} tracker${a.origins.length === 1 ? '' : 's'}.`
        : 'No victim claims in the current activity window.'),
  });
}

// Most-recently-changed first for the "moved most recently" rail; keep A–Z available client-side.
const shardOf = {};
const byRecent = [...rows].sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')));

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(GROUPS_OUT);

// Bodies: enriched profiles + any group with 7d activity (cap MAX_BODIES, activity first).
// SHARDED (not per-slug files): the Workers free plan caps static assets at
// 20,000 files and dist/ already runs ~19.9k. 43 body files pushed deploys
// over the cap (Workers Builds failure, 2026-09-12), so bodies ship as
// shard maps {slug: body} — same pattern as the living-threat shards.
const SHARD_SIZE = 16;
const bodySlugs = [...rows]
  .sort((a, b) => b.victims_7d - a.victims_7d || (b.has_profile ? 1 : 0) - (a.has_profile ? 1 : 0))
  .filter((r) => r.has_profile || r.victims_7d > 0)
  .slice(0, MAX_BODIES);

let shardCount = 0;
for (const r of bodySlugs) {
  const p = profiles.get(r.slug);
  const locs = (p?.profiles ?? []).flatMap((pr) => pr.locations ?? []).filter((l) => l.fqdn);
  const body = {
    ...r,
    meta: (p?.profiles ?? []).map((pr) => pr.meta).find(Boolean) ?? null,
    meta_source: p ? 'Ransomlook group profile (abridged, screen bytes omitted)' : null,
    mirrors_detail: locs.map((l) => ({
      fqdn: l.fqdn,
      title: l.title,
      available: l.available,
      updated: l.updated,
      version: l.version,
    })),
    victims_sample: (samples[r.slug] ?? []).slice(0, 20),
    source_urls: {
      ransomlook: `https://www.ransomlook.io/api/group/${encodeURIComponent(r.name)}`,
      ransomware_live: 'https://www.ransomware.live/',
    },
  };
  const idx = Math.floor(shardCount / SHARD_SIZE);
  const file = join(GROUPS_OUT, `shard-${String(idx).padStart(4, '0')}.json`);
  let shard = {};
  if (existsSync(file)) shard = JSON.parse(readFileSync(file, 'utf8'));
  shard[r.slug] = body;
  writeFileSync(file, JSON.stringify(shard));
  shardOf[r.slug] = idx;
  shardCount++;
}

const index = {
  source: 'Ransomlook.io + ransomware.live (merged, clearnet aggregation — no Tor egress)',
  sourceUrl: 'https://www.ransomlook.io/',
  license: 'reference/directory use — per-group blurbs via Ransomlook meta (attributed) or computed',
  syncedAt: syncedAt ?? null,
  builtAt: new Date().toISOString(),
  counts: {
    groups: rows.length,
    sites_up: upCount,
    active_week: activeWeek,
    profiled,
    with_activity: Object.keys(perGroup).length,
  },
  // Slim rows only — bodies ship in shard files (see build script).
  groups: rows,
  recent: byRecent
    .filter((r) => r.last_seen)
    .slice(0, 12)
    .map((r) => r.slug),
};
// Rows whose bodies shipped carry their shard index so the loader fetches
// exactly one shard file; rows without bodies synthesize from the row.
// (Assigned BEFORE the index write so shard pointers ship in index.json.)
for (const r of rows) {
  if (r.slug in shardOf) r.shard = shardOf[r.slug];
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built:');
console.log(
  `    ${rows.length} groups (index) · ${upCount} sites up · ${activeWeek} active this week · ${profiled} profiled`
);
console.log(
  `    ${bodySlugs.length} bodies in ${new Set(bodySlugs.map((_, i) => Math.floor(i / SHARD_SIZE))).size} shards (public/data/ransomware-groups/groups/)`
);
