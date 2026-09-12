#!/usr/bin/env node
/**
 * Sync the ransomware-groups staging area (Sinon-style group directory).
 *
 * Fetches (3 cheap clearnet requests, no Tor):
 *   1. https://www.ransomlook.io/api/groups          — canonical group list (~621 names)
 *   2. https://www.ransomlook.io/api/recent/500      — deep recent victims (activity window)
 *   3. https://data.ransomware.live/posts.json       — full victim dump (totals + last seen)
 *
 * Writes threat-intel-staging/ransomware-groups/:
 *   groups.json    — [{ name, slug }]
 *   activity.json  — { builtAt, perGroup: { slug: { victims_7d, victims_total, last_seen, origins[] } },
 *                      samples: { slug: [{ victim, discovered, origin, source_url }] } }
 *   profiles/<slug>.json (only with --enrich N: top-N active groups' /api/group/<name>
 *                      with `screen` base64 bytes stripped — keeps meta + locations)
 *
 * Usage:
 *   node scripts/sync-ransomware-groups.mjs [--enrich 30] [--concurrency 3]
 *
 * The weekly CI sync runs with --enrich 30 (status coverage for active groups).
 * Staging is git-committed so builds stay reproducible when upstreams flap.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'ransomware-groups');
const PROFILES = join(STAGING, 'profiles');

const GROUPS_URL = 'https://www.ransomlook.io/api/groups';
const RECENT_DEEP_URL = 'https://www.ransomlook.io/api/recent/500';
const RLIVE_POSTS_URL = 'https://data.ransomware.live/posts.json';
const UA = { 'User-Agent': 'pranithjain.qzz.io ransomware-groups sync (free, read-only)' };
const FETCH_TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : def;
}
const ENRICH_N = flag('--enrich', 0);
const CONCURRENCY = flag('--concurrency', 3);

/** Compressed slug — lowercase alphanumerics only. Must stay filename-safe
 * (build writes bodies as <slug>.json and the loader fetches that exact path). */
function slugify(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return 'unknown';
  return raw.replace(/[^a-z0-9]+/g, '') || 'unknown';
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function toIso(s) {
  if (!s) return null;
  // Ransomlook: "YYYY-MM-DD HH:MM:SS.ffffff" (UTC). ransomware.live: same family.
  const cleaned = String(s).replace(' ', 'T').replace(/\.\d+$/, '') + 'Z';
  const d = new Date(cleaned);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  const d2 = new Date(s);
  return Number.isFinite(d2.getTime()) ? d2.toISOString() : null;
}

mkdirSync(PROFILES, { recursive: true });

// ── 1. group list ──────────────────────────────────────────────────────────
console.log(`GET ${GROUPS_URL}`);
const groupNames = await fetchJson(GROUPS_URL);
if (!Array.isArray(groupNames)) throw new Error('groups endpoint did not return an array');
const groups = [];
const seen = new Set();
for (const name of groupNames) {
  if (typeof name !== 'string' || !name.trim()) continue;
  const slug = slugify(name);
  if (seen.has(slug)) continue;
  seen.add(slug);
  groups.push({ name: name.trim(), slug });
}
groups.sort((a, b) => a.slug.localeCompare(b.slug));
writeFileSync(join(STAGING, 'groups.json'), JSON.stringify({ syncedAt: new Date().toISOString(), count: groups.length, groups }, null, 1) + '\n');
console.log(`  → ${groups.length} groups`);

// ── 2+3. activity ──────────────────────────────────────────────────────────
const perGroup = new Map(); // slug -> { name, victims_7d, victims_total, last_seen, origins:Set, samples:[] }
function touch(slug, name) {
  if (!perGroup.has(slug)) {
    perGroup.set(slug, { name, victims_7d: 0, victims_total: 0, last_seen: null, origins: new Set(), samples: [] });
  }
  return perGroup.get(slug);
}
const nowMs = Date.now();
const cutoff7d = nowMs - 7 * 24 * 3600 * 1000;

console.log(`GET ${RECENT_DEEP_URL}`);
try {
  const recent = await fetchJson(RECENT_DEEP_URL);
  for (const e of Array.isArray(recent) ? recent : []) {
    if (!e?.post_title || !e?.group_name || !e?.discovered) continue;
    const slug = slugify(e.group_name);
    const iso = toIso(e.discovered);
    if (!iso) continue;
    const g = touch(slug, String(e.group_name).trim());
    g.victims_total += 1;
    if (Date.parse(iso) >= cutoff7d) g.victims_7d += 1;
    if (!g.last_seen || iso > g.last_seen) g.last_seen = iso;
    g.origins.add('ransomlook');
    if (g.samples.length < 10) {
      g.samples.push({
        victim: String(e.post_title).trim(),
        discovered: iso,
        origin: 'ransomlook',
        source_url: e.link
          ? `https://www.ransomlook.io${e.link.startsWith('/') ? '' : '/'}${e.link}`
          : 'https://www.ransomlook.io/recent',
      });
    }
  }
  console.log('  → ransomlook deep recent merged');
} catch (e) {
  console.warn(`  ⚠ ransomlook recent failed (${e instanceof Error ? e.message : e}) — continuing`);
}

console.log(`GET ${RLIVE_POSTS_URL}`);
try {
  const posts = await fetchJson(RLIVE_POSTS_URL);
  let n = 0;
  for (const e of Array.isArray(posts) ? posts : []) {
    if (!e?.post_title || !e?.group_name || !e?.discovered) continue;
    const slug = slugify(e.group_name);
    const iso = toIso(e.discovered);
    if (!iso) continue;
    const g = touch(slug, String(e.group_name).trim());
    g.victims_total += 1; // cross-tracker totals overlap; build step keeps per-origin counts
    if (Date.parse(iso) >= cutoff7d) g.victims_7d += 1;
    if (!g.last_seen || iso > g.last_seen) g.last_seen = iso;
    g.origins.add('ransomwarelive');
    n++;
  }
  console.log(`  → ransomware.live merged (${n} rows)`);
} catch (e) {
  console.warn(`  ⚠ ransomware.live failed (${e instanceof Error ? e.message : e}) — continuing`);
}

const activity = { builtAt: new Date().toISOString(), perGroup: {}, samples: {} };
for (const [slug, g] of perGroup) {
  activity.perGroup[slug] = {
    name: g.name,
    victims_7d: g.victims_7d,
    victims_total: g.victims_total,
    last_seen: g.last_seen,
    origins: [...g.origins].sort(),
  };
  activity.samples[slug] = g.samples;
}
writeFileSync(join(STAGING, 'activity.json'), JSON.stringify(activity) + '\n');
console.log(`  → activity for ${Object.keys(activity.perGroup).length} groups`);

// ── 4. optional per-group enrichment (status + meta) ────────────────────────
if (ENRICH_N > 0) {
  const ranked = [...perGroup.entries()]
    .sort((a, b) => (b[1].victims_7d - a[1].victims_7d) || String(b[1].last_seen ?? '').localeCompare(String(a[1].last_seen ?? '')))
    .slice(0, ENRICH_N);
  console.log(`Enriching top ${ranked.length} groups (concurrency ${CONCURRENCY})…`);
  const queue = [...ranked];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const [slug, g] = queue.shift();
      const out = join(PROFILES, `${slug}.json`);
      try {
        const data = await fetchJson(`https://www.ransomlook.io/api/group/${encodeURIComponent(g.name)}`);
        const profiles = Array.isArray(data) ? data : [];
        // Strip `screen` base64 (MBs) — keep reachability + meta only.
        const stripped = profiles.map((p) => ({
          captcha: Boolean(p.captcha),
          meta: typeof p.meta === 'string' ? p.meta.slice(0, 2000) : null,
          locations: Array.isArray(p.locations)
            ? p.locations.map((l) => ({
                fqdn: l.fqdn ?? null,
                title: l.title ?? null,
                version: l.version ?? null,
                available: Boolean(l.available),
                updated: l.updated ?? l.lastscrape ?? null,
                chat: Boolean(l.chat),
                fs: Boolean(l.fs),
              }))
            : [],
        }));
        writeFileSync(out, JSON.stringify({ slug, name: g.name, fetchedAt: new Date().toISOString(), profiles: stripped }) + '\n');
      } catch (e) {
        console.warn(`  ⚠ enrich ${g.name}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      if (done % 10 === 0) console.log(`  …${done}/${ranked.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranked.length) }, worker));
  console.log('  → enrichment done');
} else {
  // Keep any previously-enriched profiles (resumable); note when they were fetched.
  const prev = existsSync(PROFILES)
    ? (await import('node:fs').then((fs) => fs.readdirSync(PROFILES).filter((f) => f.endsWith('.json'))))
    : [];
  console.log(`  (enrich skipped — ${prev.length} cached profiles kept; re-run with --enrich N to refresh)`);
}

console.log('✔ Sync complete: threat-intel-staging/ransomware-groups/');
