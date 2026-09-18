#!/usr/bin/env node
/**
 * Build the AI Security hub manifest under public/data/ai-security/.
 *
 * Reads threat-intel-staging/ai-security/ (created by
 * `node scripts/sync-ai-security.mjs` + `node scripts/sync-ai-vulns.mjs`)
 * and emits:
 *   public/data/ai-security/index.json              (hub meta + counts + parity)
 *   public/data/ai-security/escape-parity.json      (two-way parity report copy)
 *   public/data/ai-security/matrix/index.json       (slim tool rows + category counts)
 *   public/data/ai-security/matrix/tools/<repo>.json (full tool bodies, 1 per repo)
 *   public/data/ai-security/incidents/index.json    (slim report rows)
 *   public/data/ai-security/incidents/bodies.json   (all report bodies, bundled)
 *   public/data/ai-security/vulns/index.json        (slim vuln rows, KEV first)
 *   public/data/ai-security/vulns/bodies.json       (all vuln bodies, bundled)
 *   public/data/ai-security/advisories/index.json   (advisory firehose rows)
 *   public/data/ai-security/research/index.json     (research rows)
 *
 * Sources:
 *   - https://ai-escape.watch (parity only — curatorial seed stays canonical)
 *   - https://aisecuritymatrix.com/data.json (curated tool list)
 *   - https://incidentdatabase.ai/rss.xml (CC BY; slim rows link back upstream)
 *   - ENISA EUVD API + CISA/EU KEV dump (keyless; EUVD-aligned rows link back)
 *   - NVD 2.0 API keyword search (keyless paced; rows link back to NVD)
 *   - OSV.dev watchlist (keyless; rows link back to osv.dev)
 *   - FIRST EPSS API (keyless enrichment)
 *   - GitHub commit/release Atoms + ExploitDB RSS + security research RSS
 *     (slim rows link back upstream)
 *
 * Usage: node scripts/build-ai-security.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'ai-security');
const OUT = join(ROOT, 'public', 'data', 'ai-security');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function safeFilename(s) {
  return String(s).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function shortDesc(s, n = 240) {
  if (!s) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-ai-security.mjs first.');
  process.exit(1);
}

const parityPath = join(STAGING, 'matrix.json');
const incidentsPath = join(STAGING, 'incidents.json');
if (!existsSync(parityPath) && !existsSync(incidentsPath)) {
  console.error('✘ No staged matrix.json nor incidents.json — sync produced nothing usable.');
  process.exit(1);
}

// Fresh rebuild (same wipe-then-rebuild convention as build-threatcluster.mjs).
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'matrix', 'tools'));
ensureDir(join(OUT, 'incidents'));
ensureDir(join(OUT, 'vulns'));
ensureDir(join(OUT, 'advisories'));
ensureDir(join(OUT, 'research'));

// ── parity passthrough ──────────────────────────────────────────────────────
let parity = null;
const parityStaging = join(STAGING, 'escape-parity.json');
if (existsSync(parityStaging)) {
  parity = JSON.parse(readFileSync(parityStaging, 'utf8'));
  writeFileSync(join(OUT, 'escape-parity.json'), JSON.stringify({ ...parity, builtAt: new Date().toISOString() }));
} else {
  console.warn('  ⚠ escape-parity.json missing in staging — hub will show parity as unknown');
}

// ── matrix ──────────────────────────────────────────────────────────────────
let matrixRows = [];
let matrixByCategory = {};
if (existsSync(parityPath)) {
  const raw = JSON.parse(readFileSync(parityPath, 'utf8'));
  const seen = new Set();
  for (const item of raw) {
    const entry = item.entry ?? {};
    const derived = item.derived ?? {};
    const identity = derived.identity ?? {};
    const alive = derived.alive ?? {};
    const repo = entry.repo ?? identity.canonical_repo ?? '';
    if (!repo || seen.has(repo.toLowerCase())) continue;
    seen.add(repo.toLowerCase());
    const row = {
      slug: safeFilename(repo),
      repo,
      category: entry.category ?? 'unknown',
      scope: entry.scope ?? [],
      stars: identity.stars ?? 0,
      description: shortDesc(identity.description ?? ''),
      homepage: identity.homepage ?? null,
      added: entry.added ?? null,
      checkedAt: derived.checked_at ?? null,
      pushedAt: alive.pushed_at ?? null,
      daysIdle: alive.days_idle ?? null,
      archived: alive.archived ?? false,
      license: (item.derived?.licence?.api_spdx ?? item.derived?.licence?.file ?? null),
    };
    matrixRows.push(row);
    matrixByCategory[row.category] = (matrixByCategory[row.category] ?? 0) + 1;
    writeFileSync(join(OUT, 'matrix', 'tools', `${row.slug}.json`), JSON.stringify({ ...row, upstream: item }));
  }
  matrixRows.sort((a, b) => b.stars - a.stars);
  writeFileSync(
    join(OUT, 'matrix', 'index.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), total: matrixRows.length, byCategory: matrixByCategory, tools: matrixRows })
  );
}

// ── incidents ───────────────────────────────────────────────────────────────
let incidentRows = [];
let incidentBodies = {};
if (existsSync(incidentsPath)) {
  const staged = JSON.parse(readFileSync(incidentsPath, 'utf8'));
  const items = staged.items ?? [];
  const seenGuids = new Set();
  for (const it of items) {
    const key = it.guid || it.link;
    if (!key || seenGuids.has(key)) continue;
    seenGuids.add(key);
    const id = it.reportNum ?? it.citeId ?? Buffer.from(key).toString('base64url').slice(0, 12);
    const row = {
      id: String(id),
      guid: key,
      title: it.title ?? '(untitled report)',
      link: it.link ?? '',
      pubDate: it.pubDate ?? null,
      citeId: it.citeId ?? null,
      reportNum: it.reportNum ?? null,
    };
    incidentRows.push(row);
    incidentBodies[row.id] = { ...row, description: it.description ?? '' };
  }
  incidentRows.sort((a, b) => Date.parse(b.pubDate || 0) - Date.parse(a.pubDate || 0));
  writeFileSync(
    join(OUT, 'incidents', 'index.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), source: 'https://incidentdatabase.ai/rss.xml', total: incidentRows.length, reports: incidentRows })
  );
  writeFileSync(join(OUT, 'incidents', 'bodies.json'), JSON.stringify(incidentBodies));
}

// ── vulns (EUVD + NVD + OSV + KEV + EPSS) ────────────────────────────────────
// EPSS arrives mixed-scale (EUVD ships 0–1 and 0–100); normalize to 0–1.
function normEpss(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

let vulnRows = [];
let vulnBodies = {};
let kevCount = 0;
const vulnsPath = join(STAGING, 'vulns.json');
if (existsSync(vulnsPath)) {
  const staged = JSON.parse(readFileSync(vulnsPath, 'utf8'));
  for (const v of staged.vulns ?? []) {
    const row = {
      id: v.id,
      title: shortDesc(v.title ?? v.id, 200),
      sources: v.sources ?? [],
      severity: v.severity ?? null,
      cvssBase: typeof v.cvssBase === 'number' ? v.cvssBase : null,
      epss: normEpss(v.epss),
      kev: v.kev === true,
      kevSources: v.kevSources ?? [],
      published: v.published ?? null,
      link: v.link ?? '',
      aliases: (v.aliases ?? []).slice(0, 8),
      packages: (v.packages ?? []).slice(0, 8),
      vendor: v.vendor ?? null,
      product: v.product ?? null,
    };
    if (row.kev) kevCount++;
    vulnRows.push(row);
    vulnBodies[row.id] = {
      ...row,
      description: shortDesc(v.description ?? '', 2000),
      references: (v.references ?? []).slice(0, 12),
      euvdId: v.euvdId ?? null,
      kevDateAdded: v.kevDateAdded ?? null,
      epssPercentile: v.epssPercentile ?? null,
    };
  }
  vulnRows.sort((a, b) => {
    if (!!b.kev !== !!a.kev) return b.kev ? 1 : -1;
    if ((b.epss ?? -1) !== (a.epss ?? -1)) return (b.epss ?? -1) - (a.epss ?? -1);
    return (b.cvssBase ?? -1) - (a.cvssBase ?? -1);
  });
  writeFileSync(
    join(OUT, 'vulns', 'index.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), total: vulnRows.length, kev: kevCount, vulns: vulnRows })
  );
  writeFileSync(join(OUT, 'vulns', 'bodies.json'), JSON.stringify(vulnBodies));
} else {
  console.warn('  ⚠ vulns.json missing in staging — run node scripts/sync-ai-vulns.mjs');
}

// ── advisories (cvelistV5 + tool atoms + ExploitDB) ──────────────────────────
let advisoryRows = [];
let advisoryBySource = {};
const advisoriesPath = join(STAGING, 'advisories.json');
if (existsSync(advisoriesPath)) {
  const staged = JSON.parse(readFileSync(advisoriesPath, 'utf8'));
  const seen = new Set();
  for (const it of staged.items ?? []) {
    const key = it.link || it.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = {
      id: Buffer.from(key).toString('base64url').slice(0, 12),
      title: shortDesc(it.title ?? '(untitled)', 200),
      link: it.link ?? '',
      updated: it.updated ?? null,
      source: it.source ?? 'unknown',
      kind: it.kind ?? 'release',
      cves: (it.cves ?? []).slice(0, 6),
      description: shortDesc(it.description ?? '', 500),
    };
    advisoryRows.push(row);
    advisoryBySource[row.source] = (advisoryBySource[row.source] ?? 0) + 1;
  }
  advisoryRows.sort((a, b) => Date.parse(b.updated || 0) - Date.parse(a.updated || 0));
  writeFileSync(
    join(OUT, 'advisories', 'index.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), total: advisoryRows.length, bySource: advisoryBySource, items: advisoryRows })
  );
} else {
  console.warn('  ⚠ advisories.json missing in staging — run node scripts/sync-ai-vulns.mjs');
}

// ── research (hacktron + unit42 + csa + bleeping) ────────────────────────────
let researchRows = [];
let researchBySource = {};
const researchPath = join(STAGING, 'research.json');
if (existsSync(researchPath)) {
  const staged = JSON.parse(readFileSync(researchPath, 'utf8'));
  const seen = new Set();
  for (const it of staged.items ?? []) {
    const key = it.id || it.link;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = {
      id: Buffer.from(key).toString('base64url').slice(0, 12),
      title: shortDesc(it.title ?? '(untitled)', 200),
      link: it.link ?? '',
      pubDate: it.pubDate ?? null,
      source: it.source ?? 'unknown',
      description: shortDesc(it.description ?? '', 500),
    };
    researchRows.push(row);
    researchBySource[row.source] = (researchBySource[row.source] ?? 0) + 1;
  }
  researchRows.sort((a, b) => Date.parse(b.pubDate || 0) - Date.parse(a.pubDate || 0));
  writeFileSync(
    join(OUT, 'research', 'index.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), total: researchRows.length, bySource: researchBySource, items: researchRows })
  );
} else {
  console.warn('  ⚠ research.json missing in staging — run node scripts/sync-ai-vulns.mjs');
}

// ── hub index ───────────────────────────────────────────────────────────────
const index = {
  hub: 'AI Security',
  builtAt: new Date().toISOString(),
  sources: {
    escapeWatch: 'https://ai-escape.watch (parity only; seed stays canonical)',
    matrix: 'https://aisecuritymatrix.com/data.json',
    incidents: 'https://incidentdatabase.ai/rss.xml',
    vulns: 'ENISA EUVD API + CISA/EU KEV + NVD 2.0 + OSV.dev + FIRST EPSS (all keyless)',
    advisories: 'CVEProject cvelistV5 Atom + tool release Atoms + ExploitDB RSS',
    research: 'hacktron.ai + Unit42 + CSA + BleepingComputer RSS',
  },
  counts: {
    matrixTools: matrixRows.length,
    matrixCategories: Object.keys(matrixByCategory).length,
    incidentReports: incidentRows.length,
    escapeDrift: parity?.drift ?? null,
    vulns: vulnRows.length,
    vulnKev: kevCount,
    advisories: advisoryRows.length,
    research: researchRows.length,
  },
  matrixByCategory,
  advisoryBySource,
  researchBySource,
  latestIncidentAt: incidentRows[0]?.pubDate ?? null,
  latestMatrixCheck: matrixRows[0]?.checkedAt ?? null,
  latestAdvisoryAt: advisoryRows[0]?.updated ?? null,
  latestResearchAt: researchRows[0]?.pubDate ?? null,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built:');
console.log(`    ${matrixRows.length} matrix tools (${Object.keys(matrixByCategory).length} categories)`);
console.log(`    ${incidentRows.length} incident reports`);
console.log(`    ${vulnRows.length} vulns (${kevCount} KEV)`);
console.log(`    ${advisoryRows.length} advisories (${Object.keys(advisoryBySource).length} sources)`);
console.log(`    ${researchRows.length} research items (${Object.keys(researchBySource).length} sources)`);
console.log(`    escape drift=${parity?.drift ?? 'unknown'}`);
console.log(`    public/data/ai-security/ (index + escape-parity + matrix/ + incidents/ + vulns/ + advisories/ + research/)`);
if (existsSync(join(OUT, 'matrix', 'tools'))) {
  console.log(`    tool bodies: ${readdirSync(join(OUT, 'matrix', 'tools')).length} files`);
}
