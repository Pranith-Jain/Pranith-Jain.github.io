#!/usr/bin/env node
/**
 * Build the ThreatCluster entity-intelligence manifest under
 * public/data/threat-intel/threatcluster/entities/.
 *
 * ThreatCluster cluster feeds carry no structured entity metadata, so we
 * derive entities deterministically at build time from four in-repo
 * signal sources (no LLM, no external API):
 *
 *   1. MISP event bodies      — misp-galaxy clusters (threat-actor,
 *                              ransomware-group, malware) are canonical,
 *                              structured attribution (requires the
 *                              misp-events/ staging dir written by
 *                              scripts/sync-threatcluster.mjs).
 *   2. Dark-web victims       — the `group` and `sector` fields are
 *                              canonical ransomware-group and sector
 *                              entities (structure, not inference).
 *   3. CVE feeds              — vulnerabilities + exploits are canonical
 *                              cve entities with severity/KEV context.
 *   4. Daily-Hunt IOC families — the ~130 ransomware/APT/malware families
 *                              in public/data/threat-intel/iocs/ act as a
 *                              name + alias dictionary; their names and
 *                              aliases are matched (case-insensitive
 *                              substring, length-capped) against cluster,
 *                              CVE and MISP-event text. CVE IDs are also
 *                              regex-extracted from cluster text.
 *
 * Every entity profile carries: first/last seen, mention frequency by
 * day, recent activity (record slugs), and a weighted related-entity
 * graph built from record-level co-occurrence (two entities sharing the
 * same cluster/victim/CVE/event get an edge).
 *
 * Output:
 *   entities/index.json              (slim explorer index, counts)
 *   entities/<actor|group|malware|cve|sector>/<slug>.json  (profiles)
 *
 * Run after `node scripts/sync-threatcluster.mjs && node scripts/build-threatcluster.mjs`.
 * Data is read at runtime by worker/lib/threat-intel-manifest.ts via env.ASSETS.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'threatcluster');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'threatcluster', 'entities');
const IOC_DIR = join(ROOT, 'public', 'data', 'threat-intel', 'iocs');
const THREATICON_MALWARE = join(ROOT, 'public', 'data', 'threat-intel', 'threaticon', 'malware.json');

const ENTITY_TYPES = ['actor', 'group', 'malware', 'cve', 'sector'];
const DICTIONARY_TYPES = { ransomware: 'group', apt: 'actor', apt_group: 'actor' };

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// JSON.stringify with indent changed in Node >= 21 (arrays become
// multiline). Keep entity output byte-stable across Node versions so
// rebuilds don't churn the committed tree: arrays of primitives stay
// inline, exactly like pre-21 formatting.
function stringifyIndent(value, indent = 2, depth = 0) {
  const pad = ' '.repeat(indent * depth);
  const inner = ' '.repeat(indent * (depth + 1));
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrimitive = value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v));
    if (allPrimitive) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    const items = value.map((v) => inner + stringifyIndent(v, indent, depth + 1));
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => `${inner}${JSON.stringify(k)}: ${stringifyIndent(value[k], indent, depth + 1)}`);
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// Replicate the id/slug derivation from build-threatcluster.mjs so links
// resolve to the same per-record bodies.
function victimId(item) {
  const base = item.title.replace(/— claimed by .*$/i, '').trim();
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
  return `${slug}-${hashString(item.guid || item.title).slice(0, 4)}`;
}

function clusterSlug(item) {
  const m = /\/cluster\/([^/?#]+)/.exec(item.guid || item.link || '');
  if (m) return m[1];
  return String(item.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function parseVictimFields(item) {
  const victim = item.title.replace(/— claimed by .*$/i, '').trim();
  const group = /— claimed by (.+)$/i.exec(item.title)?.[1]?.trim() ?? null;
  let sector = null;
  let country = null;
  for (const cat of item.categories ?? []) {
    if (cat.startsWith('Group:')) continue;
    if (cat.startsWith('Sector:')) sector = cat.slice('Sector:'.length).trim();
    if (cat.startsWith('Country:')) country = cat.slice('Country:'.length).trim();
  }
  return { victim, group, sector, country };
}

const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

for (const f of ['clusters', 'vulnerabilities', 'exploits', 'victims', 'misp']) {
  if (!existsSync(join(STAGING, `${f}.json`))) {
    console.error(`✘ Staging file missing: ${join(STAGING, `${f}.json`)}`);
    console.error('  Run: node scripts/sync-threatcluster.mjs first.');
    process.exit(1);
  }
}

const staged = {
  clusters: readJsonIfExists(join(STAGING, 'clusters.json')) ?? { items: [] },
  vulnerabilities: readJsonIfExists(join(STAGING, 'vulnerabilities.json')) ?? { items: [] },
  exploits: readJsonIfExists(join(STAGING, 'exploits.json')) ?? { items: [] },
  victims: readJsonIfExists(join(STAGING, 'victims.json')) ?? { items: [] },
  mispEvents: readJsonIfExists(join(STAGING, 'misp-events', 'index.json')) ?? { events: [] },
};

// ─── 1. Entity registry ────────────────────────────────────────────────
// key (lowercased canonical name) → entity draft.

const entities = new Map(); // key → {type, name, key, aliases:Set, sources:Set, meta}

function ensureEntity(type, name, opts = {}) {
  const key = opts.key ?? String(name).trim().toLowerCase();
  if (!key) return null;
  let ent = entities.get(key);
  if (!ent) {
    ent = {
      type,
      name: opts.name ?? String(name).trim(),
      key,
      aliases: new Set(),
      sources: new Set(),
      mitreTechniques: new Set(),
      description: opts.description ?? null,
      records: new Map(), // recordKey → record meta
      frequency: new Map(), // YYYY-MM-DD → count
      related: new Map(), // `${type}::${key}` → count
      victims: [],
    };
    entities.set(key, ent);
  }
  for (const s of opts.sources ?? []) ent.sources.add(s);
  for (const a of opts.aliases ?? []) if (a && a !== ent.name) ent.aliases.add(String(a).trim());
  if (opts.description && !ent.description) ent.description = opts.description;
  for (const t of opts.mitreTechniques ?? []) if (t) ent.mitreTechniques.add(t);
  return ent;
}

// 2. Daily-Hunt family dictionary (name + alias + category → entity type).
const dictionary = []; // {names:[...], type, description, mitreTechniques}
for (const file of existsSync(IOC_DIR) ? readdirSync(IOC_DIR).filter((f) => f.endsWith('.json')) : []) {
  const body = readJsonIfExists(join(IOC_DIR, file));
  if (!body?.family) continue;
  const dtype = DICTIONARY_TYPES[body.category] ?? (body.category !== 'apt' && body.category !== 'ransomware' ? 'malware' : null);
  if (!dtype) continue;
  const names = [body.family, ...(body.aliases ?? [])].map((n) => String(n).trim()).filter((n) => n.length >= 3);
  dictionary.push({
    names,
    type: dtype,
    description: body.description ?? null,
    mitreTechniques: body.mitreTechniques ?? [],
  });
}
console.log(`Dictionary: ${dictionary.length} families loaded from ${IOC_DIR}`);

// 2b. Threaticon malware dictionary (build-time only, from the built
// threaticon manifest). Merges the platform's family catalog into the
// match dictionary so cluster text matching picks up more families.
// Skipped gracefully if the threaticon build hasn't run yet.
const tiMalware = readJsonIfExists(THREATICON_MALWARE);
if (tiMalware?.families?.length) {
  const known = new Set(dictionary.flatMap((f) => f.names).map((n) => n.toLowerCase()));
  let added = 0;
  for (const fam of tiMalware.families) {
    const name = String(fam.name ?? '').trim();
    if (name.length < 4) continue;
    const key = name.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    dictionary.push({
      names: [name],
      type: 'malware',
      description: fam.category ? `Malware family (${fam.category}) from the Threaticon catalog.` : null,
      mitreTechniques: [],
    });
    added++;
  }
  console.log(`Dictionary: +${added} families merged from Threaticon (${THREATICON_MALWARE})`);
} else {
  console.log(`Dictionary: Threaticon malware manifest not found (${THREATICON_MALWARE}) — skipping`);
}

// 3. Canonical entities from structured fields + MISP galaxies.

// Victims → ransomware groups + sectors (canonical).
for (const item of staged.victims.items) {
  const vid = victimId(item);
  const fields = parseVictimFields(item);
  if (fields.group) {
    const ent = ensureEntity('group', fields.group, { sources: ['victims'] });
    addRecord(ent, {
      recordType: 'victim',
      slug: vid,
      title: item.title,
      pubDate: item.pubDate ?? null,
      sector: fields.sector,
      country: fields.country,
    });
  }
  if (fields.sector) {
    const ent = ensureEntity('sector', fields.sector, { sources: ['victims'] });
    addRecord(ent, {
      recordType: 'victim',
      slug: vid,
      title: item.title,
      pubDate: item.pubDate ?? null,
      group: fields.group,
      country: fields.country,
    });
  }
  if (fields.group && fields.sector) {
    relate(fields.group.toLowerCase(), fields.sector.toLowerCase());
  }
}

// MISP galaxy clusters → actors / groups / malware (canonical).
// Values sharing a galaxy-cluster uuid inside one event are aliases.
for (const ev of staged.mispEvents.events) {
  const byUuid = new Map();
  for (const g of ev.galaxies ?? []) {
    if (!g?.type || !g?.value) continue;
    const type = g.type === 'threat-actor' ? 'actor' : g.type === 'ransomware-group' ? 'group' : g.type === 'malware' ? 'malware' : null;
    if (!type) continue;
    const uuid = g.uuid ?? `${ev.uuid}:${g.type}:${g.value}`;
    if (!byUuid.has(uuid)) byUuid.set(uuid, []);
    byUuid.get(uuid).push({ type, value: String(g.value) });
  }
  for (const clusterValues of byUuid.values()) {
    const primary = clusterValues.sort((a, b) => b.value.length - a.value.length)[0];
    const ent = ensureEntity(primary.type, primary.value, { sources: ['misp'] });
    addRecord(ent, {
      recordType: 'mispEvent',
      slug: ev.uuid,
      title: ev.info ?? ev.uuid,
      pubDate: ev.date ? `${ev.date}T00:00:00.000Z` : null,
    });
    // Values sharing a galaxy-cluster uuid are aliases of the primary.
    for (const c of clusterValues) {
      if (c.value !== primary.value && c.type === primary.type) ent.aliases.add(c.value);
    }
  }
}

// Canonical CVEs from the vulnerabilities + exploits feeds.
for (const item of [...staged.vulnerabilities.items, ...staged.exploits.items]) {
  const cveId = (/(CVE-\d{4}-\d{4,7})/i.exec(`${item.guid} ${item.link} ${item.title}`)?.[1] ?? null)?.toUpperCase();
  if (!cveId) continue;
  const ent = ensureEntity('cve', cveId, {
    key: cveId.toLowerCase(),
    sources: [item.categories?.some((c) => /KEV/i.test(c)) || /KEV/i.test(item.title ?? '') ? 'exploits' : 'vulnerabilities'],
  });
  addRecord(ent, {
    recordType: item.categories?.some((c) => /KEV/i.test(c)) || item.link?.includes('/exploit') ? 'exploit' : 'vulnerability',
    slug: cveId,
    title: item.title ?? cveId,
    pubDate: item.pubDate ?? null,
    severity: /Severity:\s*([A-Z]+)/i.exec(item.description ?? '')?.[1]?.toUpperCase() ?? null,
    inKev: /KEV/i.test(`${item.title ?? ''} ${item.description ?? ''} ${item.categories?.join(' ') ?? ''}`),
  });
  ent.description = item.description ?? null;
}

// ─── 4. Text matching over clusters + CVEs + MISP events ───────────────

function matchDictionary(text, type) {
  const hay = (text ?? '').toLowerCase();
  if (!hay) return [];
  const out = [];
  for (const fam of dictionary) {
    if (fam.type !== type) continue;
    for (const name of fam.names) {
      const n = name.toLowerCase();
      if (n.length < 3) continue;
      if (n.length < 6 && !new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(hay)) continue;
      if (hay.includes(n)) {
        out.push(fam);
        break;
      }
    }
  }
  return out;
}

function addRecord(ent, rec) {
  const recordKey =
    rec.recordType === 'mispEvent' ? `misp::${rec.slug}` : `${rec.recordType}::${rec.slug}`;
  ent.records.set(recordKey, rec);
  const day = rec.pubDate ? rec.pubDate.slice(0, 10) : 'unknown';
  ent.frequency.set(day, (ent.frequency.get(day) ?? 0) + 1);
}

function relate(aKey, bKey) {
  if (aKey === bKey) return;
  const a = entities.get(aKey);
  const b = entities.get(bKey);
  if (!a || !b) return;
  const rel = `${b.type}::${bKey}`;
  a.related.set(rel, (a.related.get(rel) ?? 0) + 1);
  const rel2 = `${a.type}::${aKey}`;
  b.related.set(rel2, (b.related.get(rel2) ?? 0) + 1);
}

for (const item of staged.clusters.items) {
  const text = `${item.title ?? ''} ${item.description ?? ''}`;
  const pubDate = item.pubDate ?? null;
  const rec = {
    recordType: 'cluster',
    slug: clusterSlug(item),
    title: item.title,
    pubDate,
    sourceCount: item.categories?.find((c) => /^(\d+)\s+Sources?$/i.test(c))?.[1] ?? null,
  };
  const keys = new Set();
  for (const t of ['actor', 'group', 'malware']) {
    for (const fam of matchDictionary(text, t)) {
      // Prefer the family's own name over aliases for the canonical key.
      const canonicalName = fam.names[0];
      const ent = ensureEntity(t, canonicalName, {
        sources: ['dictionary'],
        description: fam.description ?? undefined,
        mitreTechniques: fam.mitreTechniques,
      });
      addRecord(ent, { ...rec, recordType: 'cluster' });
      keys.add(`${t}::${ent.key}`);
    }
  }
  for (const m of text.matchAll(CVE_RE)) {
    const cveId = m[0].toUpperCase();
    const ent = ensureEntity('cve', cveId, { key: cveId.toLowerCase(), sources: ['clusters'] });
    addRecord(ent, { ...rec, recordType: 'cluster' });
    keys.add(`cve::${ent.key}`);
  }
  const all = [...keys];
  for (const k of all) for (const k2 of all) relate(k, k2);
}

for (const item of [...staged.vulnerabilities.items]) {
  const text = `${item.title ?? ''} ${item.description ?? ''}`;
  const rec = { recordType: 'vulnerability', slug: (/(CVE-\d{4}-\d{4,7})/i.exec(`${item.guid} ${item.link} ${item.title}`)?.[1] ?? '').toUpperCase(), title: item.title, pubDate: item.pubDate ?? null };
  const keys = new Set();
  for (const t of ['actor', 'group', 'malware']) {
    for (const fam of matchDictionary(text, t)) {
      const ent = ensureEntity(t, fam.names[0], { sources: ['dictionary'], description: fam.description ?? undefined, mitreTechniques: fam.mitreTechniques });
      addRecord(ent, { ...rec, recordType: 'vulnerability' });
      keys.add(`${t}::${ent.key}`);
    }
  }
  const all = [...keys];
  for (const k of all) for (const k2 of all) relate(k, k2);
}

for (const item of [...staged.exploits.items]) {
  const text = `${item.title ?? ''} ${item.description ?? ''}`;
  const rec = { recordType: 'exploit', slug: (/(CVE-\d{4}-\d{4,7})/i.exec(`${item.guid} ${item.link} ${item.title}`)?.[1] ?? '').toUpperCase(), title: item.title, pubDate: item.pubDate ?? null };
  const keys = new Set();
  for (const t of ['actor', 'group', 'malware']) {
    for (const fam of matchDictionary(text, t)) {
      const ent = ensureEntity(t, fam.names[0], { sources: ['dictionary'], description: fam.description ?? undefined, mitreTechniques: fam.mitreTechniques });
      addRecord(ent, { ...rec, recordType: 'exploit' });
      keys.add(`${t}::${ent.key}`);
    }
  }
  const all = [...keys];
  for (const k of all) for (const k2 of all) relate(k, k2);
}

// ─── 5. Emit profiles ───────────────────────────────────────────────────

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Deterministic slugs: sorted by key, collisions get a -N suffix.
const slugSeen = new Set();
function slugFor(ent) {
  const base = safeFilename(ent.name.toLowerCase()).slice(0, 72) || 'entity';
  let slug = base;
  let i = 1;
  while (slugSeen.has(slug)) slug = `${base}-${i++}`;
  slugSeen.add(slug);
  return slug;
}
const slugs = new Map();
for (const key of [...entities.keys()].sort()) {
  slugs.set(key, slugFor(entities.get(key)));
}

const indexEntries = [];
const counts = {};
for (const t of ENTITY_TYPES) counts[t] = 0;

for (const ent of entities.values()) {
  const records = [...ent.records.values()].sort((a, b) => (b.pubDate ?? '').localeCompare(a.pubDate ?? ''));
  const firstSeen = records.map((r) => r.pubDate).filter(Boolean).sort()[0] ?? null;
  const lastSeen = records.map((r) => r.pubDate).filter(Boolean).sort().at(-1) ?? null;
  const frequency = [...ent.frequency.entries()]
    .filter(([d]) => d !== 'unknown')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const related = [...ent.related.entries()]
    .map(([key, weight]) => {
      const [type, k] = key.split('::');
      const target = entities.get(k);
      if (!target) return null;
      return { type, slug: slugs.get(k), name: target.name, weight };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);

  const slug = slugs.get(ent.key);
  const entry = {
    type: ent.type,
    slug,
    name: ent.name,
    aliases: [...ent.aliases].sort(),
    sources: [...ent.sources].sort(),
    mentionCount: records.length,
    firstSeen,
    lastSeen,
  };
  indexEntries.push(entry);
  counts[ent.type] += 1;

  const relatedTypes = [...ent.related.keys()].map((k) => k.split('::')[0]);
  const recap = (word) => (records.length === 1 ? `${word} one record` : `${word} ${records.length} records`);

  let summary;
  if (ent.type === 'cve') {
    const sev = records.find((r) => r.severity)?.severity ?? null;
    const kev = records.some((r) => r.inKev);
    const exp = records.some((r) => r.recordType === 'exploit');
    summary = `${ent.name} — ${sev ?? 'unknown'} severity, ${kev ? 'listed in CISA KEV, ' : ''}${exp ? 'public exploit in feed, ' : ''}${recap('seen in')}.`;
  } else if (ent.type === 'group') {
    const sectorsRec = records.filter((r) => r.recordType === 'victim' && r.sector);
    const countriesRec = records.filter((r) => r.recordType === 'victim' && r.country);
    const victims = records.filter((r) => r.recordType === 'victim');
    const uniqueSectors = new Set(sectorsRec.map((r) => r.sector));
    const uniqueCountries = new Set(countriesRec.map((r) => r.country));
    summary = `Ransomware group with ${victims.length} leak-site victim${victims.length === 1 ? '' : 's'} across ${uniqueSectors.size || 0} sector${uniqueSectors.size === 1 ? '' : 's'} and ${uniqueCountries.size || 0} countr${uniqueCountries.size === 1 ? 'y' : 'ies'}.`;
  } else if (ent.type === 'sector') {
    const groups = new Set(records.filter((r) => r.group).map((r) => r.group));
    const countries = new Set(records.filter((r) => r.country).map((r) => r.country));
    summary = `Sector hit by ${records.length} leak-site victim${records.length === 1 ? '' : 's'} across ${groups.size} ransomware group${groups.size === 1 ? '' : 's'} and ${countries.size} countr${countries.size === 1 ? 'y' : 'ies'}.`;
  } else if (ent.type === 'actor') {
    summary = `Threat actor ${recap('mentioned in')}${ent.description ? `. ${ent.description}` : ''}`;
  } else {
    summary = `Malware family ${recap('mentioned in')}${ent.description ? `. ${ent.description}` : ''}`;
  }
  if (summary.length > 400) summary = `${summary.slice(0, 397)}...`;

  const body = {
    ...entry,
    summary,
    frequency,
    recentActivity: records.slice(0, 12).map((r) => ({
      recordType: r.recordType,
      slug: r.slug,
      title: r.title,
      pubDate: r.pubDate,
    })),
    relatedEntities: related,
    mitreTechniques: ent.mitreTechniques.size ? [...ent.mitreTechniques].slice(0, 12) : [],
  };

  if (ent.type === 'group') {
    body.victims = records.filter((r) => r.recordType === 'victim').map((r) => ({
      id: r.slug,
      victim: r.title,
      sector: r.sector ?? null,
      country: r.country ?? null,
      pubDate: r.pubDate,
    }));
  }

  const dir = join(OUT, ent.type);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.json`), `${stringifyIndent(body)}\n`);
}

// entity index
const byType = {};
for (const t of ENTITY_TYPES) {
  byType[t] = indexEntries
    .filter((e) => e.type === t)
    .sort((a, b) => b.mentionCount - a.mentionCount || a.name.localeCompare(b.name))
    .map(({ type, slug, name, aliases, mentionCount, firstSeen, lastSeen }) => ({ type, slug, name, aliases: aliases.slice(0, 4), mentionCount, firstSeen, lastSeen }));
}

const index = {
  source: 'threatcluster.io',
  url: 'https://threatcluster.io/entities',
  description:
    'Derived entity intelligence from ThreatCluster clusters, MISP galaxy attribution, dark-web victims and CVE feeds. Entities are extracted deterministically at build time from in-repo signals (MISP galaxy tags, victim group/sector fields, CVE regexes, Daily-Hunt family dictionary matching) — no LLM in the loop.',
  builtAt: new Date().toISOString(),
  counts,
  entities: byType,
};

writeFileSync(join(OUT, 'index.json'), `${stringifyIndent(index)}\n`);

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('\nEntities built:');
for (const t of ENTITY_TYPES) {
  console.log(`    ${t.padEnd(12)} ${String(counts[t]).padStart(4)}`);
}
console.log(`    ${'total'.padEnd(12)} ${String(total).padStart(4)}`);
console.log(`\nWrote ${total + 1} files to ${OUT}`);