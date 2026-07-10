#!/usr/bin/env node
/**
 * Build the APT Actors manifest under public/data/apt-actors/.
 *
 * Reads from ./actors-staging/ (created by
 * `node scripts/sync-etda-actors.mjs`) and emits:
 *   public/data/apt-actors/index.json              (slim — no bodies)
 *   public/data/apt-actors/actors/<slug>.json       (one per actor)
 *   public/data/apt-actors/aptmap.json              (APTmap relationship graph)
 *
 * License: CC BY-NC-SA 4.0 (ETDA), MIT (APTmap design reference)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'actors-staging');
const OUT = join(ROOT, 'public', 'data', 'apt-actors');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

function shortDesc(desc) {
  if (!desc) return '';
  return desc.length > 240 ? desc.slice(0, 237) + '\u2026' : desc;
}

function parseShowcardHtml(html) {
  if (!html || html.length < 100) return null;

  const card = {
    names: [],
    country: null,
    sponsor: null,
    motivation: null,
    firstSeen: null,
    description: null,
    sectors: [],
    observedCountries: [],
    toolsUsed: [],
    operations: [],
    counterOperations: [],
    mitreLink: null,
    informationLinks: [],
  };

  // Names \u2014 "Name1 (Source1)Name2 (Source2)..."
  const namedItems = [...html.matchAll(/([^(]+?)\s*\(([^)]+)\)/g)];
  if (namedItems.length > 0) {
    card.names = [];
    for (const m of namedItems) {
      card.names.push(m[1].trim());
    }
  }

  // Country
  const countryMatch = html.match(/Country\s+(.+?)(?:\n|<)/);
  if (countryMatch) card.country = countryMatch[1].trim() || null;

  // Sponsor
  const sponsorMatch = html.match(/Sponsor\s+(.+?)(?:\n|<)/);
  if (sponsorMatch) card.sponsor = sponsorMatch[1].trim() || null;

  // Motivation
  const motivationMatch = html.match(/Motivation\s+(.+?)(?:\n|<)/);
  if (motivationMatch) card.motivation = motivationMatch[1].trim() || null;

  // First seen
  const firstSeenMatch = html.match(/First seen\s+(.+?)(?:\n|<)/);
  if (firstSeenMatch) card.firstSeen = firstSeenMatch[1].trim() || null;

  // Description (multi-line)
  const descMatch = html.match(/Description\s*([\s\S]+?)(?=\n(?:Observed|Tools used|Operations|Counter|MITRE|Last change))/);
  if (descMatch) card.description = descMatch[1].trim().replace(/\s+/g, ' ') || null;

  // Sectors
  const sectorsMatch = html.match(/Sectors:\s*(.+?)(?:\n|$)/);
  if (sectorsMatch) {
    card.sectors = sectorsMatch[1].split(',').map((s) => slugify(s)).filter(Boolean);
  }
  // Observed countries
  const countriesMatch = html.match(/Countries:\s*(.+?)(?:\n|$)/);
  if (countriesMatch) {
    card.observedCountries = countriesMatch[1].split(',').map((c) => c.trim()).filter(Boolean);
  }
  // Tools used
  const toolsMatch = html.match(/Tools used\s*(.+?)(?=\n(?:Operations performed|Counter operations|MITRE|Information|Last change))/s);
  if (toolsMatch) {
    card.toolsUsed = toolsMatch[1].split(',').map((t) => t.trim().replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  }
  // Operations
  const opsSection = html.match(/Operations performed\s*([\s\S]+?)(?=\nCounter operations|MITRE|Information|Last change|$)/);
  if (opsSection) {
    const opLines = opsSection[1].trim().split('\n').filter((l) => l.trim());
    for (const line of opLines) {
      const titleMatch = line.match(/^\s*(.+?)\s+<https?:\/\/[^>]+>/);
      const urlMatch = line.match(/<(https?:\/\/[^>]+)>/);
      if (titleMatch) {
        card.operations.push({
          title: titleMatch[1].trim(),
          url: urlMatch ? urlMatch[1] : null,
        });
      }
    }
  }
  // Counter operations
  const counterSection = html.match(/Counter operations\s*([\s\S]+?)(?=\n(?:Information|MITRE|Last change|$))/);
  if (counterSection) {
    const lines = counterSection[1].trim().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const titleMatch = line.match(/^\s*(.+?)\s+<https?:\/\/[^>]+>/);
      const urlMatch = line.match(/<(https?:\/\/[^>]+)>/);
      if (titleMatch) {
        card.counterOperations.push({
          title: titleMatch[1].trim(),
          url: urlMatch ? urlMatch[1] : null,
        });
      }
    }
  }
  // MITRE ATT&CK link
  const mitreMatch = html.match(/attack\.mitre\.org\/groups\/(G\d+)/);
  if (mitreMatch) card.mitreLink = `https://attack.mitre.org/groups/${mitreMatch[1]}/`;
  // Information links
  const infoMatch = html.match(/Information\s*([\s\S]+?)(?=\nMITRE|\nLast change)/);
  if (infoMatch) {
    const links = [...infoMatch[1].matchAll(/<(https?:\/\/[^>]+)>/g)];
    card.informationLinks = links.map((m) => m[1]);
  }

  return card;
}

// ─── Main ────────────────────────────────────────────────────────────

if (!existsSync(STAGING)) {
  console.error('\u2718 Staging folder missing: ' + STAGING);
  console.error('  Run: node scripts/sync-etda-actors.mjs first.');
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'actors'));

// ─── ETDA group list ────────────────────────────────────────────────
const groups = JSON.parse(readFileSync(join(STAGING, 'etda-group-list.json'), 'utf8'));
const actorIndex = [];
let cardFetched = 0;
let cardFailed = 0;

for (const g of groups) {
  const slug = slugify(g.name);
  const cardPath = join(STAGING, 'etda-cards', safeFilename(slug) + '.html');
  const cardHtml = existsSync(cardPath) ? readFileSync(cardPath, 'utf8') : '';
  const parsed = cardHtml ? parseShowcardHtml(cardHtml) : null;

  if (cardHtml && parsed) cardFetched++;
  if (cardHtml && !parsed) cardFailed++;

  const indexEntry = {
    slug,
    name: g.name,
    aliases: g.aliases || [],
    category: g.category,
    country: g.country || parsed?.country || null,
    sponsor: parsed?.sponsor || null,
    motivation: parsed?.motivation || null,
    firstSeen: g.firstSeen || parsed?.firstSeen || null,
    lastSeen: g.lastSeen || null,
    hasDetails: parsed !== null,
    sectorCount: parsed?.sectors?.length ?? 0,
    toolCount: parsed?.toolsUsed?.length ?? 0,
    operationCount: (parsed?.operations?.length ?? 0) + (parsed?.counterOperations?.length ?? 0),
    observedCountries: (parsed?.observedCountries ?? []).slice(0, 20),
    description: shortDesc(parsed?.description ?? ''),
    sizeBytes: 0,
    mitreId: parsed?.mitreLink?.match(/G\d+/)?.[0] || null,
    subgroupCount: g.subgroups?.length ?? 0,
  };
  indexEntry.sizeBytes = JSON.stringify(indexEntry).length;

  const body = {
    ...indexEntry,
    names: parsed?.names ?? [g.name],
    fullDescription: parsed?.description ?? null,
    sectors: parsed?.sectors ?? [],
    toolsUsed: parsed?.toolsUsed ?? [],
    operations: parsed?.operations ?? [],
    counterOperations: parsed?.counterOperations ?? [],
    informationLinks: parsed?.informationLinks ?? [],
    mitreLink: parsed?.mitreLink ?? null,
    subgroups: g.subgroups ?? [],
  };

  writeFileSync(join(OUT, 'actors', safeFilename(slug) + '.json'), JSON.stringify(body));
  actorIndex.push(indexEntry);
}

actorIndex.sort((a, b) => {
  const order = { apt: 0, other: 1, unknown: 2 };
  return (order[a.category] ?? 3) - (order[b.category] ?? 3) || a.name.localeCompare(b.name);
});

// ─── APTmap graph ──────────────────────────────────────────────────
let aptmapData = null;
const aptmapPath = join(STAGING, 'apt_rel.json');
if (existsSync(aptmapPath)) {
  try {
    aptmapData = JSON.parse(readFileSync(aptmapPath, 'utf8'));
    writeFileSync(join(OUT, 'aptmap.json'), JSON.stringify(aptmapData));
    console.log('    loaded APTmap (' + (aptmapData.nodes?.length ?? 0) + ' nodes, ' + (aptmapData.links?.length ?? 0) + ' links)');
  } catch (e) {
    console.warn('  \u26a0 failed to parse APTmap: ' + e.message);
  }
}

// ─── APTmap data files ────────────────────────────────────────────
const APTMAP_DATA_DIR = join(STAGING, 'aptmap-data');
const APTMAP_DATA_OUT = join(OUT, 'aptmap');
ensureDir(APTMAP_DATA_OUT);
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
let aptmapDataFiles = [];
if (existsSync(APTMAP_DATA_DIR)) {
  const files = readdirSync(APTMAP_DATA_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const src = join(APTMAP_DATA_DIR, f);
    const stat = statSync(src);
    if (stat.size > MAX_ASSET_BYTES) {
      console.warn('  \u26a0 skipped ' + f + ' (' + (stat.size / 1024 / 1024).toFixed(1) + ' MB) \u2014 exceeds 25 MB Cloudflare asset limit');
      continue;
    }
    const dest = join(APTMAP_DATA_OUT, f);
    copyFileSync(src, dest);
    aptmapDataFiles.push({ name: f, sizeBytes: stat.size });
  }
  aptmapDataFiles.sort((a, b) => a.name.localeCompare(b.name));
  console.log('    ' + aptmapDataFiles.length + ' aptmap data files  (public/data/apt-actors/aptmap/)');
}

// ─── Index ──────────────────────────────────────────────────────────
const index = {
  source: 'ETDA Threat Group Cards (CC BY-NC-SA 4.0) + AndreaCristaldi/APTmap (MIT design reference)',
  license: 'CC BY-NC-SA 4.0',
  replicatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    actors: actorIndex.length,
    apt: actorIndex.filter((a) => a.category === 'apt').length,
    other: actorIndex.filter((a) => a.category === 'other').length,
    unknown: actorIndex.filter((a) => a.category === 'unknown').length,
    withCards: cardFetched,
    withMitre: actorIndex.filter((a) => a.mitreId).length,
    withTools: actorIndex.filter((a) => a.toolCount > 0).length,
    totalSectors: new Set(actorIndex.flatMap((a) => {
      try { return JSON.parse(readFileSync(join(OUT, 'actors', safeFilename(a.slug) + '.json'), 'utf8')).sectors || []; } catch { return []; }
    })).size,
  },
  lastSyncedAt: new Date().toISOString(),
  lastCardUpdate: actorIndex.filter((a) => a.hasDetails).length > 0 ? new Date().toISOString() : null,
  actorIndex,
  aptmap: aptmapData ? {
    nodes: aptmapData.nodes?.length ?? 0,
    links: aptmapData.links?.length ?? 0,
    aptNodes: (aptmapData.nodes ?? []).filter((n) => n.group === 'APT').length,
    countries: (aptmapData.nodes ?? []).filter((n) => n.group === 'Country').length,
    tools: (aptmapData.nodes ?? []).filter((n) => n.group === 'Tool').length,
    ttps: (aptmapData.nodes ?? []).filter((n) => n.group === 'TTP').length,
  } : null,
  aptmapDataFiles: aptmapDataFiles.length > 0 ? aptmapDataFiles : undefined,
};

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('\u2714 Built:');
console.log('    ' + actorIndex.length + ' actors      (public/data/apt-actors/actors/)');
console.log('      ' + actorIndex.filter((a) => a.category === 'apt').length + ' APT, ' + actorIndex.filter((a) => a.category === 'other').length + ' other, ' + actorIndex.filter((a) => a.category === 'unknown').length + ' unknown');
console.log('      ' + cardFetched + ' with detail cards, ' + cardFailed + ' HTML parse failures');
console.log('    ' + (aptmapData ? '1 aptmap graph' : '0 aptmap (skipped)') + '  (public/data/apt-actors/aptmap.json)');
console.log('    1 slim index              (public/data/apt-actors/index.json)');