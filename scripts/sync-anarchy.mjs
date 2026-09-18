#!/usr/bin/env node
/**
 * Sync Anarchy (kazamadono.github.io) course catalog into local staging.
 *
 * Source: https://kazamadono.github.io/courses.json
 *   1708 courses, each { id, title, desc, tags[], href, img }
 *   Static JSON, no auth, no pagination. 354KB, single fetch.
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/anarchy-sync.yml) — daily 06:00 UTC
 *   2. Manual: `node scripts/sync-anarchy.mjs`
 *
 * After sync, run `node scripts/build-anarchy.mjs` to slice the staged
 * data into public/data/anarchy/.
 *
 * License: upstream is public GitHub Pages (MIT-like). We replicate with
 * attribution (source + url + syncedAt in every manifest) and never strip
 * course links. Original author: KazamaDono (https://github.com/KazamaDono).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const STAGING_FILE = join(STAGING, 'anarchy.json');
const SOURCE_URL = 'https://kazamadono.github.io/courses.json';
const SOURCE_PAGE = 'https://kazamadono.github.io/';

const UA = 'pranithjain-anarchy-sync/1.0 (+https://pranithjain.qzz.io)';

function ensureStaging() {
  if (!existsSync(STAGING)) mkdirSync(STAGING, { recursive: true });
}

async function fetchJson() {
  console.log('• Anarchy — kazamadono.github.io');
  console.log(`  → ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': UA,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed: ${SOURCE_URL} → ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  console.log(`    fetched ${text.length} bytes`);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error(`unexpected payload: expected array, got ${typeof data}`);
  }
  // Validate shape: each entry must have title + href
  const valid = data.filter((c) => c && typeof c.title === 'string' && typeof c.href === 'string');
  console.log(`    valid courses: ${valid.length}/${data.length}`);
  if (valid.length === 0) throw new Error('no valid courses after filter');
  return valid;
}

function readStaged() {
  if (!existsSync(STAGING_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STAGING_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  console.log('Anarchy sync — staging into', STAGING_FILE);
  ensureStaging();

  const courses = await fetchJson();

  // Enrich with normalized tags + lowercase search field
  const normalized = courses.map((c) => ({
    id: String(c.id ?? '').padStart(4, '0'),
    title: String(c.title ?? '').trim(),
    desc: String(c.desc ?? '').trim(),
    href: String(c.href ?? '').trim(),
    img: String(c.img ?? '').trim() || null,
    tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
  }));

  // Stats for logging
  const tagCounts = new Map();
  for (const c of normalized) {
    for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  const payload = {
    source: 'kazamadono.github.io',
    url: SOURCE_PAGE,
    coursesUrl: SOURCE_URL,
    description:
      'Anarchy — Your Personal Student Course Portal (1700+ courses: exploitation, AI/ML, psyops, bio/med, defensive, offensive, OSINT, game hacking, bug bounty, crypto, reversing, cloud, forensics, CTF, blockchain, IoT/HW, dev/CS, math). Curated by KazamaDono.',
    license: 'Upstream CC/MIT-like — replicated with attribution; course links retained verbatim.',
    author: 'KazamaDono',
    authorUrl: 'https://github.com/KazamaDono',
    syncedAt: new Date().toISOString(),
    counts: {
      courses: normalized.length,
      categories: tagCounts.size,
    },
    topTags: sortedTags.slice(0, 30).map(([tag, count]) => ({ tag, count })),
    courses: normalized,
  };

  const prev = readStaged();
  if (prev && JSON.stringify(prev.courses) === JSON.stringify(normalized)) {
    console.log('  no changes since last sync — refreshing syncedAt only');
    prev.syncedAt = payload.syncedAt;
    writeFileSync(STAGING_FILE, JSON.stringify(prev, null, 2));
  } else {
    writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2));
  }

  console.log(`\n✔ Staged ${normalized.length} courses across ${tagCounts.size} tags`);
  for (const [tag, n] of sortedTags.slice(0, 12)) {
    console.log(`    ${tag.padEnd(14)} ${String(n).padStart(4)} courses`);
  }
  console.log(`\nNext: node scripts/build-anarchy.mjs`);
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
