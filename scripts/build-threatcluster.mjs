#!/usr/bin/env node
/**
 * Build the ThreatCluster (threatcluster.io) manifest under
 * public/data/threat-intel/threatcluster/.
 *
 * Reads staging files in ./threat-intel-staging/threatcluster/ (created
 * by `node scripts/sync-threatcluster.mjs`) and emits:
 *   index.json                       (slim — no bodies, feed metadata)
 *   clusters/<slug>.json             (one per trending cluster, 50)
 *   vulnerabilities/<cve-id>.json    (one per feed CVE, 50)
 *   exploits/<cve-id>.json           (one per exploit CVE, ~50)
 *   victims/<id>.json                (one per dark-web victim, 50)
 *   iocs.json                        (whole IOC blocklist, small)
 *   misp.json                        (slim MISP manifest pass-through)
 *
 * The manifest is read at runtime by worker/lib/threat-intel-manifest.ts
 * through env.ASSETS — no D1, no KV, no public fetch.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threatcluster');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'threatcluster');

const FEED_META = [
  { id: 'clusters', title: 'Threat Feed', url: 'https://threatcluster.io/feed.xml', window: '7 days' },
  { id: 'vulnerabilities', title: 'Vulnerabilities Feed', url: 'https://threatcluster.io/vulnerabilities/feed.xml', window: '7 days' },
  { id: 'exploits', title: 'Exploits Feed', url: 'https://threatcluster.io/exploits/feed.xml', window: '30 days' },
  { id: 'victims', title: 'Dark Web Victims Feed', url: 'https://threatcluster.io/dark-web/feed.xml', window: '14 days' },
];

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

// A short, deterministic, collision-safe id: slugified base + 4-hex guid hash.
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function clusterSlug(item) {
  const m = /\/cluster\/([^/?#]+)/.exec(item.guid || item.link || '');
  if (m) return m[1];
  return safeFilename(item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '').slice(0, 80);
}

function cveId(item) {
  const m = /(CVE-\d{4}-\d+)/i.exec(`${item.guid} ${item.link} ${item.title}`);
  return m ? m[1].toUpperCase() : null;
}

function victimId(item) {
  const base = item.title.replace(/— claimed by .*$/i, '').trim();
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
  return `${slug}-${hashString(item.guid || item.title).slice(0, 4)}`;
}

function parseVictimFields(item) {
  const victim = item.title.replace(/— claimed by .*$/i, '').trim();
  const group = /— claimed by (.+)$/i.exec(item.title)?.[1]?.trim() ?? null;
  let sector = null;
  let country = null;
  for (const cat of item.categories) {
    if (cat.startsWith('Group:')) continue;
    if (cat.startsWith('Sector:')) sector = cat.slice('Sector:'.length).trim();
    if (cat.startsWith('Country:')) country = cat.slice('Country:'.length).trim();
  }
  return { victim, group, sector, country };
}

function parseExploitFields(item) {
  const severity = /Severity:\s*([A-Z]+)/i.exec(`${item.description} ${item.categories.join(' ')}`)?.[1]?.toUpperCase() ?? null;
  const inKev = /\[KEV\]|\bKEV\b|CISA KEV/i.test(`${item.title} ${item.description} ${item.categories.join(' ')}`);
  return { severity, inKev };
}

const FILES = ['clusters', 'vulnerabilities', 'exploits', 'victims', 'iocs', 'misp'];
for (const f of FILES) {
  if (!existsSync(join(STAGING, `${f}.json`))) {
    console.error(`✘ Staging file missing: ${join(STAGING, `${f}.json`)}`);
    console.error('  Run: node scripts/sync-threatcluster.mjs first.');
    process.exit(1);
  }
}

const staged = {
  clusters: JSON.parse(readFileSync(join(STAGING, 'clusters.json'), 'utf8')),
  vulnerabilities: JSON.parse(readFileSync(join(STAGING, 'vulnerabilities.json'), 'utf8')),
  exploits: JSON.parse(readFileSync(join(STAGING, 'exploits.json'), 'utf8')),
  victims: JSON.parse(readFileSync(join(STAGING, 'victims.json'), 'utf8')),
  iocs: JSON.parse(readFileSync(join(STAGING, 'iocs.json'), 'utf8')),
  misp: JSON.parse(readFileSync(join(STAGING, 'misp.json'), 'utf8')),
};

// Wipe and rebuild the manifest tree.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'clusters'), { recursive: true });
mkdirSync(join(OUT, 'vulnerabilities'), { recursive: true });
mkdirSync(join(OUT, 'exploits'), { recursive: true });
mkdirSync(join(OUT, 'victims'), { recursive: true });

// ─── Trending clusters ───────────────────────────────────────────────
const clusterIndex = [];
for (const item of staged.clusters.items) {
  const slug = clusterSlug(item);
  const sourceCount = /^(\d+)\s+Sources?$/i.exec(item.categories.find((c) => /Sources?$/i.test(c)) ?? '')?.[1]
    ? parseInt(/^(\d+)\s+Sources?$/i.exec(item.categories.find((c) => /Sources?$/i.test(c)) ?? '')[1], 10)
    : null;
  const body = {
    slug,
    title: item.title,
    link: item.link,
    guid: item.guid,
    pubDate: item.pubDate,
    sourceCount,
    categories: item.categories,
    description: item.description,
    sizeBytes: item.description.length,
  };
  writeFileSync(join(OUT, 'clusters', `${safeFilename(slug)}.json`), JSON.stringify(body));
  clusterIndex.push({
    slug,
    title: item.title,
    pubDate: item.pubDate,
    sourceCount,
    sizeBytes: item.description.length,
  });
}

// ─── Vulnerability feed ──────────────────────────────────────────────
const vulnIndex = [];
for (const item of staged.vulnerabilities.items) {
  const id = cveId(item);
  if (!id) continue;
  const body = {
    cveId: id,
    title: item.title,
    link: item.link,
    guid: item.guid,
    pubDate: item.pubDate,
    description: item.description,
    sizeBytes: item.description.length,
  };
  writeFileSync(join(OUT, 'vulnerabilities', `${safeFilename(id)}.json`), JSON.stringify(body));
  vulnIndex.push({
    cveId: id,
    title: item.title,
    pubDate: item.pubDate,
    sizeBytes: item.description.length,
  });
}

// ─── Exploits feed ───────────────────────────────────────────────────
const exploitIndex = [];
for (const item of staged.exploits.items) {
  const id = cveId(item);
  if (!id) continue;
  const { severity, inKev } = parseExploitFields(item);
  const body = {
    cveId: id,
    title: item.title,
    link: item.link,
    guid: item.guid,
    pubDate: item.pubDate,
    severity,
    inKev,
    hasExploit: true,
    categories: item.categories,
    description: item.description,
    sizeBytes: item.description.length,
  };
  writeFileSync(join(OUT, 'exploits', `${safeFilename(id)}.json`), JSON.stringify(body));
  exploitIndex.push({
    cveId: id,
    title: item.title,
    pubDate: item.pubDate,
    severity,
    inKev,
    sizeBytes: item.description.length,
  });
}

// ─── Dark-web victims ────────────────────────────────────────────────
const victimIndex = [];
for (const item of staged.victims.items) {
  const id = victimId(item);
  const { victim, group, sector, country } = parseVictimFields(item);
  const body = {
    id,
    victim,
    group,
    sector,
    country,
    title: item.title,
    link: item.link,
    guid: item.guid,
    pubDate: item.pubDate,
    categories: item.categories,
    description: item.description,
    sizeBytes: item.description.length,
  };
  writeFileSync(join(OUT, 'victims', `${safeFilename(id)}.json`), JSON.stringify(body));
  victimIndex.push({
    id,
    victim,
    group,
    sector,
    country,
    pubDate: item.pubDate,
    sizeBytes: item.description.length,
  });
}

// Sort victims by pubDate desc (freshest first).
victimIndex.sort((a, b) => (b.pubDate ?? '').localeCompare(a.pubDate ?? ''));
// Sort cluster/vuln/exploit indexes by pubDate desc too.
for (const arr of [clusterIndex, vulnIndex, exploitIndex]) {
  arr.sort((a, b) => (b.pubDate ?? '').localeCompare(a.pubDate ?? ''));
}

// ─── IOC blocklist + MISP pass-through (whole-file bodies) ──────────
writeFileSync(join(OUT, 'iocs.json'), JSON.stringify(staged.iocs));
writeFileSync(join(OUT, 'misp.json'), JSON.stringify(staged.misp));

// ─── Index ───────────────────────────────────────────────────────────
const index = {
  source: 'threatcluster.io',
  url: 'https://threatcluster.io/feeds',
  description:
    'Aggregated threat clusters, CVEs, exploits, dark-web victims, and high-confidence IOCs from ThreatCluster. Feeds refresh hourly upstream and are replicated here on the threat-intel sync cadence.',
  syncedAt: staged.clusters.syncedAt,
  lastBuildDates: {
    clusters: staged.clusters.lastBuildDate,
    vulnerabilities: staged.vulnerabilities.lastBuildDate,
    exploits: staged.exploits.lastBuildDate,
    victims: staged.victims.lastBuildDate,
    iocs: staged.iocs.generatedAt,
  },
  counts: {
    clusters: clusterIndex.length,
    vulnerabilities: vulnIndex.length,
    exploits: exploitIndex.length,
    victims: victimIndex.length,
    iocs: staged.iocs.count ?? staged.iocs.iocs.length,
    mispEvents: staged.misp.eventCount,
  },
  feeds: FEED_META,
  clusters: clusterIndex,
  vulnerabilities: vulnIndex,
  exploits: exploitIndex,
  victims: victimIndex,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built ThreatCluster manifest:');
console.log(`    ${clusterIndex.length} clusters        (public/data/threat-intel/threatcluster/clusters/)`);
console.log(`    ${vulnIndex.length} vulnerabilities  (public/data/threat-intel/threatcluster/vulnerabilities/)`);
console.log(`    ${exploitIndex.length} exploits        (public/data/threat-intel/threatcluster/exploits/)`);
console.log(`    ${victimIndex.length} victims         (public/data/threat-intel/threatcluster/victims/)`);
console.log(`    ${index.counts.iocs} IOCs, ${index.counts.mispEvents} MISP events (whole-file bodies)`);
console.log(`    1 slim index   (public/data/threat-intel/threatcluster/index.json)`);