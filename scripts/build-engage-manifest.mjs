#!/usr/bin/env node
// Builds public/data/engage/index.json from the MITRE Engage matrix
// (https://engage.mitre.org/matrix/). The matrix ships as three TablePress
// tables: Prepare goals, the Expose/Affect/Elicit goal×approach matrix, and
// Understand goals. Parsed into phases → goals → approaches, read at
// runtime through env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-engage-manifest.mjs [--source <file-or-url>]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'engage');
const UPSTREAM_URL = 'https://engage.mitre.org/matrix/';
const UPSTREAM_REPO = 'engage.mitre.org (MITRE Engage)';
const MATRIX_URL = 'https://engage.mitre.org/matrix/';

function clean(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

async function loadSource() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) {
    if (/^https?:\/\//.test(override)) {
      const res = await fetch(override);
      if (!res.ok) throw new Error(`fetch ${override}: HTTP ${res.status}`);
      return await res.text();
    }
    return readFileSync(override, 'utf8');
  }
  const res = await fetch(UPSTREAM_URL, {
    headers: { 'user-agent': 'pranithjain-engage-sync/1.0 (+https://pranithjain.qzz.io)' },
  });
  if (!res.ok) throw new Error(`fetch upstream: HTTP ${res.status}`);
  return await res.text();
}

function tableHtml(html, id) {
  const start = html.indexOf(`<table id="tablepress-${id}"`);
  if (start === -1) throw new Error(`tablepress-${id} not found — upstream format changed?`);
  return html.slice(start, html.indexOf('</table>', start));
}

function rowsOf(table) {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => clean(c[1])),
  );
}

/** Map 1-based column index → top goal from a colspan thead row. */
function topGoalsFor(theadCells, rawThead) {
  const ths = [...rawThead.matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/gi)];
  const map = {};
  let col = 1;
  for (const m of ths) {
    const span = Number(/colspan="(\d+)"/i.exec(m[1])?.[1] ?? 1);
    const name = clean(m[2]);
    for (let i = 0; i < span; i++) map[col++] = name;
    void theadCells;
  }
  return map;
}

async function main() {
  const html = await loadSource();
  const goals = [];
  const approaches = [];
  const seen = new Set();
  const pushApproach = (name, goal, phase, topGoal) => {
    if (!name) return;
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);
    approaches.push({ slug, name, goal, phase, topGoal, url: MATRIX_URL });
  };

  // Phase tables: Prepare (tablepress-2) and Understand (tablepress-3).
  for (const [id, phase] of [['2', 'Prepare'], ['3', 'Understand']]) {
    const rows = rowsOf(tableHtml(html, id));
    if (rows.length < 2) throw new Error(`tablepress-${id} too short — upstream format changed?`);
    const goal = rows[0][0];
    goals.push({ name: goal, phase, topGoal: goal });
    for (const r of rows.slice(1)) pushApproach(r[0], goal, phase, goal);
  }

  // Main matrix (tablepress-1): thead top goals → row-2 sub-goals → approach rows.
  const t1 = tableHtml(html, '1');
  const theadRaw = t1.slice(0, t1.indexOf('</thead>'));
  const topByCol = topGoalsFor([], theadRaw);
  const body = rowsOf(t1.slice(t1.indexOf('<tbody>')));
  const subByCol = {};
  body[0].forEach((name, i) => {
    if (name) subByCol[i + 1] = name;
  });
  for (const [col, sub] of Object.entries(subByCol)) {
    goals.push({ name: sub, phase: 'Engage', topGoal: topByCol[Number(col)] ?? '' });
  }
  for (const r of body.slice(1)) {
    r.forEach((name, i) => {
      const sub = subByCol[i + 1];
      if (name && sub) pushApproach(name, sub, 'Engage', topByCol[i + 1] ?? '');
    });
  }

  if (goals.length < 5 || approaches.length < 30) {
    throw new Error(`parse yielded ${goals.length} goals / ${approaches.length} approaches — upstream format changed?`);
  }

  mkdirSync(OUT, { recursive: true });
  const index = {
    source: UPSTREAM_REPO,
    license: 'upstream-collection (names only; descriptions link out to engage.mitre.org)',
    replicatedAt: new Date().toISOString().slice(0, 10),
    count: approaches.length,
    phases: [...new Set([...goals.map((g) => g.phase), ...approaches.map((a) => a.phase)])].sort(),
    goals: goals.sort((a, b) => a.name.localeCompare(b.name)),
    approaches: approaches.sort((a, b) => a.name.localeCompare(b.name)),
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log('✔ Built Engage manifest:');
  console.log(`    ${approaches.length} approaches across ${goals.length} goals`);
}

main().catch((e) => {
  console.error(`✘ build-engage failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
