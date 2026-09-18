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

// Wipe and rebuild
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'courses'), { recursive: true });
mkdirSync(join(OUT, 'by-tag'), { recursive: true });

// ─── Tag aggregates ─────────────────────────────────────────────────
const byTag = new Map();
for (const c of courses) {
  for (const t of c.tags ?? []) {
    if (!byTag.has(t)) byTag.set(t, []);
    byTag.get(t).push(c);
  }
}
const tagCounts = [...byTag.entries()]
  .map(([tag, list]) => ({ tag, count: list.length }))
  .sort((a, b) => b.count - a.count);

// ─── Slim index entries (for list views) ────────────────────────────
const slim = courses.map((c) => ({
  id: c.id,
  title: c.title,
  href: c.href,
  img: c.img,
  tags: c.tags,
  // 120-char preview for index; full desc lives in per-course body
  preview: (c.desc ?? '').slice(0, 120),
  sizeBytes: JSON.stringify(c).length,
}));
slim.sort((a, b) => a.id.localeCompare(b.id));

// ─── Per-course bodies ──────────────────────────────────────────────
for (const c of courses) {
  const body = {
    id: c.id,
    title: c.title,
    desc: c.desc,
    href: c.href,
    img: c.img,
    tags: c.tags,
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
    courses: courses.length,
    categories: byTag.size,
  },
  // For filter chips — mirrors the upstream filter set
  categories: tagCounts,
  topTags: staged.topTags ?? tagCounts.slice(0, 12),
  courses: slim,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built Anarchy manifest:');
console.log(`    ${courses.length} courses          (public/data/anarchy/courses/)`);
console.log(`    ${byTag.size} tags               (public/data/anarchy/by-tag/)`);
console.log(`    ${tagCounts.slice(0, 5).map((t) => `${t.tag}(${t.count})`).join(', ')} …`);
console.log(`    1 slim index     (public/data/anarchy/index.json, ${JSON.stringify(index).length} bytes)`);
console.log(`    built at:        ${index.builtAt}`);
console.log(`    source:          ${staged.source} @ ${staged.url}`);
