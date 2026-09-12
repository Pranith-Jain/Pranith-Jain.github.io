#!/usr/bin/env node
/**
 * Sync APT actor data from ETDA Threat Group Cards + APTmap
 * into a local staging folder (actors-staging/). Run by:
 *   1. GitHub Action (.github/workflows/etda-actors-sync.yml) — weekly
 *   2. Manual: `node scripts/sync-etda-actors.mjs`
 *
 * After sync, run `node scripts/build-etda-actors.mjs` to slice the
 * staged data into the per-slug JSON the Worker reads at runtime.
 *
 * Sources:
 *   - ETDA Threat Group Cards (HTML pages + MISP JSON export)
 *     https://apt.etda.or.th/cgi-bin/listgroups.cgi
 *     https://apt.etda.or.th/cgi-bin/showcard.cgi?g=<name>
 *   - AndreaCristaldi/APTmap (force-directed relationship graph)
 *     https://raw.githubusercontent.com/andreacristaldi/APTmap/master/apt_rel.json
 *
 * License: CC BY-NC-SA 4.0 (ETDA), MIT (APTmap design reference)
 */
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'actors-staging');
const ETDA_ACTOR_LIST = join(STAGING, 'etda-group-list.json');
const ETDA_CARDS_DIR = join(STAGING, 'etda-cards');
const APTMAP_PATH = join(STAGING, 'apt_rel.json');

const ETDA_LIST_URL = 'https://apt.etda.or.th/cgi-bin/listgroups.cgi';
const SHOWCARD_URL = 'https://apt.etda.or.th/cgi-bin/showcard.cgi';
const APTMAP_URL = 'https://raw.githubusercontent.com/andreacristaldi/APTmap/master/apt_rel.json';

function ensureStaging() {
  if (existsSync(STAGING)) {
    rmSync(STAGING, { recursive: true });
  }
  mkdirSync(STAGING, { recursive: true });
  mkdirSync(ETDA_CARDS_DIR, { recursive: true });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'pranithjain-etda-actors-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`fetch failed: ${url} -> ${res.status} ${res.statusText}`);
  return await res.text();
}

/**
 * Decode a handful of HTML entities the ETDA pages use. Enough for the
 * group list (nbsp spacers, ↳ subgroup markers, query-string &amp;).
 */
function decodeEntities(s) {
  return s
    .replace(/&#8627;/g, '↳')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Parse the ETDA HTML group list into structured JSON.
 *
 * Current upstream shape (verified 2026-09-12) is a <table>: category
 * headers are `<tr><td colspan="6"><h2>APT groups</h2></td></tr>` and each
 * group is a row whose cells are [spacer, name link, country, period, …].
 * Country is either literal "[Unknown]" text or a flag `<img alt="…">`;
 * subgroups are rows whose name cell holds "↳ Subgroup: <name>".
 *
 * Row sample:
 *   …<td…><a href="/cgi-bin/showcard.cgi?g=AeroBlade&n=1" …>AeroBlade</a></td>
 *   <td…>[Unknown]</td><td…>2022</td>…
 *
 * We parse the <tr>/<td> structure (not bare text lines) so a future
 * header re-wrap can't silently bucket every group as "unknown" again —
 * see PR #135, where `<h2>`-wrapped headers defeated exact-match parsing
 * and 402 APT profiles were replaced by 576 card-less "unknown" stubs.
 */
async function fetchEtdaGroupList() {
  console.log('  -> ETDA group list');
  const html = await fetchText(ETDA_LIST_URL);
  writeFileSync(join(STAGING, 'etda-group-list-raw.html'), html);

  const groups = [];
  let currentCategory = 'unknown';

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] ?? '');
    if (cells.length === 0) continue;

    // Category header row: single cell holding "X groups".
    if (cells.length === 1) {
      const header = stripTags(cells[0]).toLowerCase();
      if (header === 'apt groups') { currentCategory = 'apt'; continue; }
      if (header === 'other groups') { currentCategory = 'other'; continue; }
      if (header === 'unknown groups') { currentCategory = 'unknown'; continue; }
      continue;
    }
    if (cells.length < 4) continue;

    const nameRaw = stripTags(cells[1]);
    if (!nameRaw) continue;

    // Country cell: "[Unknown]" text or a flag <img alt="Country">.
    let country = null;
    const imgAlt = cells[2].match(/<img[^>]*\salt="([^"]*)"/i);
    if (imgAlt) {
      country = (imgAlt[1] || '').trim() || null;
    } else {
      const c = stripTags(cells[2]).replace(/[\[\]]/g, '').trim();
      country = c || null;
    }
    if (country === 'Unknown') country = null;

    const period = stripTags(cells[3]) || null;

    // Subgroup rows ("↳ Subgroup: <name>").
    if (/↳/.test(nameRaw)) {
      if (groups.length === 0) continue;
      const m = nameRaw.match(/↳\s*Subgroup:\s*(.+?)(\d{4}(?:-\w+\s?\d{4})?)?\s*$/);
      if (m) {
        const parent = groups[groups.length - 1];
        parent.subgroups = parent.subgroups || [];
        parent.subgroups.push({ name: m[1].trim(), period: m[2]?.trim() || null });
      }
      continue;
    }

    // Main group row: link text is "Name, Alias1, Alias2" (first is primary).
    const names = nameRaw.split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) continue;

    const name = names[0];
    const aliases = names.slice(1);
    const [firstSeen, lastSeen] = period ? period.split('-').map((p) => p.trim()) : [null, null];

    groups.push({
      name,
      aliases,
      category: currentCategory,
      country: country === 'Unknown' ? null : country,
      firstSeen: firstSeen || null,
      lastSeen: lastSeen || null,
      subgroups: [],
    });
  }

  writeFileSync(ETDA_ACTOR_LIST, JSON.stringify(groups, null, 2));
  console.log(`    parsed ${groups.length} groups (${groups.filter((g) => g.category === 'apt').length} APT, ${groups.filter((g) => g.category === 'other').length} other, ${groups.filter((g) => g.category === 'unknown').length} unknown)`);
}

/**
 * Fetch individual showcard pages for each APT group.
 * The showcard has detailed metadata:
 *   Country, Sponsor, Motivation, First seen, Description,
 *   Observed Sectors, Observed Countries, Tools used,
 *   Operations performed, Counter operations, MITRE ATT&CK link
 *
 * We fetch APT groups only (these have the richest data).
 */
async function fetchShowcards(groups) {
  const aptGroups = groups.filter((g) => g.category === 'apt');
  let fetched = 0;
  let failed = 0;

  // Process in batches of 5 to avoid overwhelming the server
  const batchSize = 5;
  for (let i = 0; i < aptGroups.length; i += batchSize) {
    const batch = aptGroups.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (g) => {
        const slug = slugify(g.name);
        const dest = join(ETDA_CARDS_DIR, `${slug}.html`);
        try {
          const html = await fetchText(`${SHOWCARD_URL}?g=${encodeURIComponent(g.name)}`);
          writeFileSync(dest, html);
          fetched++;
        } catch (err) {
          failed++;
          console.warn(`  ⚠ failed to fetch card for "${g.name}": ${err.message}`);
          writeFileSync(dest, '');
        }
      })
    );
    // Small delay between batches
    if (i + batchSize < aptGroups.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  console.log(`    fetched ${fetched} cards (${failed} failed)`);
}

async function fetchAptmap() {
  console.log('  -> AndreaCristaldi/APTmap (force-directed graph)');
  const text = await fetchText(APTMAP_URL);
  writeFileSync(APTMAP_PATH, text);
  const parsed = JSON.parse(text);
  console.log(`    ${parsed.nodes?.length ?? 0} nodes, ${parsed.links?.length ?? 0} links`);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

async function main() {
  console.log('APT Actors sync — staging into', STAGING);
  ensureStaging();

  await fetchEtdaGroupList();

  // Reload parsed list
  const groups = JSON.parse(readFileSync(ETDA_ACTOR_LIST, 'utf8'));
  await fetchShowcards(groups);
  await fetchAptmap();

  console.log('\n✔ Staged. Next: node scripts/build-etda-actors.mjs');
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});