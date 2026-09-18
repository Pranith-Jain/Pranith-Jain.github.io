#!/usr/bin/env node
/**
 * Build the Anarchy manifest under public/data/anarchy/.
 *
 * Reads from ./threat-intel-staging/anarchy.json (created by
 * `node scripts/sync-anarchy.mjs`) and emits:
 *   public/data/anarchy/index.json        (slim manifest + course index)
 *   public/data/anarchy/courses/<id>.json (one per course — for deep links)
 *   public/data/anarchy/by-tag/<tag>.json (one per tag — for filtered views)
 *
 * The manifest is read at runtime by worker/lib/anarchy-manifest.ts
 * and by the SPA (src/pages/Anarchy.tsx) through env.ASSETS / fetch.
 * No D1, no KV, no public fetch at runtime.
 *
 * 1708 courses × per-course file would be 1708 + by-tag (~22) = ~1730 assets,
 * under the 20k static-asset cap but a bit heavy for a daily sync diff.
 * We keep per-course bodies for parity with the si/threat-intel pattern and
 * because the diff is still <400KB; if the cap ever tightens we can shard.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING_FILE = join(ROOT, 'threat-intel-staging', 'anarchy.json');
const OUT = join(ROOT, 'public', 'data', 'anarchy');

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

if (!existsSync(STAGING_FILE)) {
  console.error(`✘ Staging file missing: ${STAGING_FILE}`);
  console.error('  Run: node scripts/sync-anarchy.mjs first.');
  process.exit(1);
}

const staged = JSON.parse(readFileSync(STAGING_FILE, 'utf8'));
const courses = staged.courses ?? [];

if (!Array.isArray(courses) || courses.length === 0) {
  console.error('✘ Staged anarchy.json has no courses');
  process.exit(1);
}

// ─── Enrichment helpers (Phase 2) ───────────────────────────────────
function providerFromHref(href) {
  try {
    const host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('mentiforce.ai')) return { name: 'Mentiforce', host, icon: '🧠' };
    if (host.includes('redteamleaders')) return { name: 'RedTeamLeaders', host, icon: '🔴' };
    if (host.includes('tryhackme.com')) return { name: 'TryHackMe', host, icon: '🎯' };
    if (host.includes('hackthebox')) return { name: 'HackTheBox', host, icon: '📦' };
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { name: 'YouTube', host, icon: '▶️' };
    if (host.includes('github.com')) return { name: 'GitHub', host, icon: '⭐' };
    if (host.includes('medium.com')) return { name: 'Medium', host, icon: '✍️' };
    if (host.includes('coursera.org')) return { name: 'Coursera', host, icon: '🎓' };
    if (host.includes('udemy.com')) return { name: 'Udemy', host, icon: '🎓' };
    if (host.includes('dayzerosec.com')) return { name: 'DayZeroSec', host, icon: '🛡️' };
    if (host.includes('c0f369dc') || host.includes('coursestack')) return { name: 'CourseStack', host, icon: '📚' };
    return { name: host.split('.')[0] ? host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1) : host, host, icon: '🔗' };
  } catch {
    return { name: 'External', host: '', icon: '🔗' };
  }
}

function difficultyFromCourse(c) {
  const title = (c.title ?? '').toLowerCase();
  const desc = (c.desc ?? '').toLowerCase();
  const text = `${title} ${desc}`;
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());
  // Explicit signals
  if (/\b(advanced|expert|master|deep dive|evasion|kernel|exploit development|0day|bypass)\b/.test(text)) return 'advanced';
  if (/\b(beginner|intro|fundamental|getting started|basic|foundations|101)\b/.test(text)) return 'beginner';
  // Tag heuristics
  if (tags.includes('exploits') || tags.includes('re') || tags.includes('crypto')) return 'advanced';
  if (tags.includes('math') || tags.includes('aiml') && text.includes('advanced')) return 'intermediate';
  if (tags.includes('dev') && tags.length === 1) return 'beginner';
  if (tags.includes('blue') || tags.includes('forensics') || tags.includes('osint')) return 'intermediate';
  // Length heuristic: very short desc = quick win
  if (desc.length < 80) return 'beginner';
  if (desc.length > 220) return 'intermediate';
  return 'intermediate';
}

function hoursFromCourse(c) {
  const diff = difficultyFromCourse(c);
  const base = diff === 'beginner' ? 2 : diff === 'advanced' ? 8 : 4;
  // Tag bumps
  const tags = c.tags ?? [];
  let bump = 0;
  if (tags.includes('exploits') || tags.includes('re')) bump += 3;
  if (tags.includes('aiml') || tags.includes('cloud')) bump += 2;
  if (tags.includes('ctf') || tags.includes('game')) bump += 1;
  // Title keyword bumps
  if (/bootcamp|complete|comprehensive|mastery/i.test(c.title)) bump += 2;
  return Math.min(12, base + bump);
}

// Prerequisites: tag co-occurrence → for each tag, top 3 co-tags
function buildPrereqGraph(courses) {
  const co = new Map(); // tag -> Map<otherTag, count>
  for (const c of courses) {
    const tags = c.tags ?? [];
    for (const a of tags) {
      if (!co.has(a)) co.set(a, new Map());
      for (const b of tags) {
        if (a === b) continue;
        const m = co.get(a);
        m.set(b, (m.get(b) ?? 0) + 1);
      }
    }
  }
  const graph = {};
  for (const [tag, m] of co.entries()) {
    const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, n]) => ({ tag: t, weight: n }));
    graph[tag] = top;
  }
  return graph;
}

// Wipe and rebuild
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'courses'), { recursive: true });
mkdirSync(join(OUT, 'by-tag'), { recursive: true });

// ─── Enriched courses ───────────────────────────────────────────────
const enriched = courses.map((c) => {
  const provider = providerFromHref(c.href);
  const difficulty = difficultyFromCourse(c);
  const hours = hoursFromCourse(c);
  return { ...c, provider, difficulty, hours };
});

// ─── Tag aggregates ─────────────────────────────────────────────────
const byTag = new Map();
for (const c of enriched) {
  for (const t of c.tags ?? []) {
    if (!byTag.has(t)) byTag.set(t, []);
    byTag.get(t).push(c);
  }
}
const tagCounts = [...byTag.entries()]
  .map(([tag, list]) => ({ tag, count: list.length }))
  .sort((a, b) => b.count - a.count);

const prereqGraph = buildPrereqGraph(enriched);
const providerCounts = new Map();
for (const c of enriched) {
  const k = c.provider.name;
  providerCounts.set(k, (providerCounts.get(k) ?? 0) + 1);
}
const topProviders = [...providerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

// ─── Slim index entries (for list views) ────────────────────────────
const slim = enriched.map((c) => ({
  id: c.id,
  title: c.title,
  href: c.href,
  img: c.img,
  tags: c.tags,
  provider: c.provider,
  difficulty: c.difficulty,
  hours: c.hours,
  // 120-char preview for index; full desc lives in per-course body
  preview: (c.desc ?? '').slice(0, 120),
  sizeBytes: JSON.stringify(c).length,
}));
slim.sort((a, b) => a.id.localeCompare(b.id));

// ─── Per-course bodies ──────────────────────────────────────────────
for (const c of enriched) {
  const prereqs = [...new Set(c.tags.flatMap((t) => (prereqGraph[t] ?? []).map((p) => p.tag)))].filter((t) => !c.tags.includes(t)).slice(0, 3);
  const body = {
    id: c.id,
    title: c.title,
    desc: c.desc,
    href: c.href,
    img: c.img,
    tags: c.tags,
    provider: c.provider,
    difficulty: c.difficulty,
    hours: c.hours,
    prereqs,
    source: staged.source,
    sourceUrl: staged.url,
  };
  writeFileSync(join(OUT, 'courses', `${safeFilename(c.id)}.json`), JSON.stringify(body));
}

// ─── Per-tag bodies ─────────────────────────────────────────────────
for (const [tag, list] of byTag.entries()) {
  const body = {
    tag,
    count: list.length,
    courses: list.map((c) => ({
      id: c.id,
      title: c.title,
      href: c.href,
      img: c.img,
      tags: c.tags,
      preview: (c.desc ?? '').slice(0, 120),
    })),
  };
  writeFileSync(join(OUT, 'by-tag', `${safeFilename(tag)}.json`), JSON.stringify(body));
}

// ─── Index ──────────────────────────────────────────────────────────
const index = {
  source: staged.source,
  url: staged.url,
  coursesUrl: staged.coursesUrl,
  description: staged.description,
  license: staged.license,
  author: staged.author,
  authorUrl: staged.authorUrl,
  syncedAt: staged.syncedAt,
  builtAt: new Date().toISOString(),
  counts: {
    courses: enriched.length,
    categories: byTag.size,
  },
  // For filter chips — mirrors the upstream filter set
  categories: tagCounts,
  topTags: staged.topTags ?? tagCounts.slice(0, 12),
  topProviders,
  prereqGraph,
  courses: slim,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built Anarchy manifest (Phase 2):');
console.log(`    ${enriched.length} courses          (public/data/anarchy/courses/)`);
console.log(`    ${byTag.size} tags               (public/data/anarchy/by-tag/)`);
console.log(`    ${tagCounts.slice(0, 5).map((t) => `${t.tag}(${t.count})`).join(', ')} …`);
console.log(`    ${topProviders.slice(0, 3).map((p) => `${p.name}(${p.count})`).join(', ')} …`);
console.log(`    1 slim index     (public/data/anarchy/index.json, ${JSON.stringify(index).length} bytes)`);
console.log(`    built at:        ${index.builtAt}`);
console.log(`    source:          ${staged.source} @ ${staged.url}`);
