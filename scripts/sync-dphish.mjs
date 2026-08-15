#!/usr/bin/env node
/**
 * Sync the dPhish (dphish.com) phishing threat-intel feed via TAXII 2.1.
 *
 * dPhish publishes a public OpenCTI-backed TAXII 2.1 collection of STIX 2.1
 * phishing indicators (malicious domains, phishing URLs, sender IPs,
 * phone numbers, attachment rules). The collection endpoint requires no
 * auth even though the discovery/root endpoints do.
 *
 *   Collection: 68f57461-5c20-451d-ab32-6357d1fbef0b
 *   Objects:    https://tip.dphish.live/taxii2/root/collections/<id>/objects/
 *
 * The API supports TAXII `next` cursors and the `added_after` filter, so
 * incremental syncs pass `added_after = last sync - 24h` and merge by STIX
 * id, keeping the newest `modified` revision. First run fetches everything.
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml)
 *   2. Manual: `node scripts/sync-dphish.mjs`
 *
 * After sync, run `node scripts/build-dphish.mjs` to slice the staged data
 * into public/data/threat-intel/dphish/.
 *
 * Source: https://dphish.com/feeds (free, public TAXII 2.1 feed, no key)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const OUT = join(STAGING, 'dphish');
const UA = 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)';

export const DPHISH = {
  source: 'dphish.com',
  sourceUrl: 'https://dphish.com/feeds/',
  collectionId: '68f57461-5c20-451d-ab32-6357d1fbef0b',
  collectionUrl: 'https://tip.dphish.live/taxii2/root/collections/68f57461-5c20-451d-ab32-6357d1fbef0b/objects/',
  description:
    'Phishing threat-intel feed — malicious domains, phishing URLs, sender IPs, phone numbers, and attachment detection rules (TAXII 2.1 / STIX 2.1, public).',
  license: 'Public feed (no registration required)',
};

// Safety caps: the collection is tiny (tens of objects today), but never
// let one sync grow unbounded.
export const MAX_OBJECTS = 20_000;
const MAX_PAGES = 200;

function ensureOut() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
}

/** Map STIX observable main types to platform indicator categories. */
export function observableTypeToCategory(mainType) {
  switch (mainType) {
    case 'Domain-Name':
      return 'domain';
    case 'IPv4-Addr':
      return 'ipv4';
    case 'IPv6-Addr':
      return 'ipv6';
    case 'Url':
      return 'url';
    case 'Phone-Number':
      return 'phone';
    case 'StixFile':
      return 'file';
    case 'Email-Addr':
      return 'email';
    default:
      return 'other';
  }
}

/** Pull the observable value out of a STIX 2.1 indicator object. */
export function indicatorValue(indicator) {
  const opencti = indicator.extensions?.['extension-definition--ea279b3e-5c71-4632-ac08-831c66a786ba'];
  const ov = opencti?.observable_values?.[0];
  if (ov?.value) return ov.value;
  // Fallback: parse the STIX pattern [type:value = 'x']
  const m = /=\s*'([^']+)'\s*\]\s*$/.exec(indicator.pattern ?? '');
  return m ? m[1] : indicator.name ?? null;
}

/** Normalize a STIX 2.1 indicator into the shared staging shape. */
export function normalizeIndicator(ind) {
  const opencti =
    ind.extensions?.['extension-definition--ea279b3e-5c71-4632-ac08-831c66a786ba'] ?? {};
  const mainType = typeof opencti.main_observable_type === 'string' ? opencti.main_observable_type : null;
  const observableValues = Array.isArray(opencti.observable_values) ? opencti.observable_values : [];
  const value = indicatorValue(ind);
  return {
    stixId: ind.id ?? null,
    name: ind.name ?? null,
    value,
    category: observableTypeToCategory(mainType),
    mainObservableType: mainType,
    observableValues,
    pattern: ind.pattern ?? null,
    patternType: ind.pattern_type ?? null,
    description: ind.description ?? null,
    created: ind.created ?? null,
    modified: ind.modified ?? null,
    revoked: ind.revoked ?? false,
    confidence: typeof ind.confidence === 'number' ? ind.confidence : null,
    validFrom: ind.valid_from ?? null,
    validUntil: ind.valid_until ?? null,
    labels: Array.isArray(ind.labels) ? ind.labels : [],
    indicatorTypes: Array.isArray(ind.indicator_types) ? ind.indicator_types : [],
    score: typeof opencti.score === 'number' ? opencti.score : null,
    detection: opencti.detection ?? null,
  };
}

async function fetchObjects(params = '') {
  const res = await fetch(`${DPHISH.collectionUrl}${params}`, {
    headers: { 'user-agent': UA, accept: 'application/taxii+json;version=2.1' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TAXII fetch failed: ${DPHISH.collectionUrl}${params} → ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchCollection({ addedAfter = null } = {}) {
  const objects = [];
  let next = null;
  const qs = new URLSearchParams({ limit: '500' });
  if (addedAfter) qs.set('added_after', addedAfter);
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = next ? `?${qs.toString()}&next=${encodeURIComponent(next)}` : `?${qs.toString()}`;
    // eslint-disable-next-line no-await-in-loop
    const envelope = await fetchObjects(params);
    const batch = Array.isArray(envelope.objects) ? envelope.objects : [];
    for (const obj of batch) {
      if (obj.type !== 'indicator') continue;
      objects.push(normalizeIndicator(obj));
      if (objects.length >= MAX_OBJECTS) break;
    }
    if (!envelope.more || !envelope.next || objects.length >= MAX_OBJECTS) break;
    next = envelope.next;
  }
  return objects;
}

/** Merge new objects into the existing staging set (by stixId, keep newest modified). */
export function mergeIndicators(prev, incoming) {
  const byId = new Map();
  for (const ind of prev ?? []) {
    if (ind.stixId) byId.set(ind.stixId, ind);
  }
  for (const ind of incoming) {
    if (!ind.stixId) continue;
    const existing = byId.get(ind.stixId);
    if (!existing) {
      byId.set(ind.stixId, ind);
      continue;
    }
    const a = Date.parse(existing.modified ?? '');
    const b = Date.parse(ind.modified ?? '');
    if (isNaN(a) || isNaN(b) || b >= a) byId.set(ind.stixId, ind);
  }
  return [...byId.values()];
}

function readStaging() {
  const p = join(OUT, 'indicators.json');
  if (!existsSync(p)) return { indicators: [], manifest: null };
  try {
    const json = JSON.parse(readFileSync(p, 'utf8'));
    return { indicators: Array.isArray(json.indicators) ? json.indicators : [], manifest: json.manifest ?? null };
  } catch {
    return { indicators: [], manifest: null };
  }
}

export async function main({ add24hOverlap = true } = {}) {
  console.log('dPhish sync — staging into', OUT);
  ensureOut();

  const { indicators: prevIndicators, manifest } = readStaging();
  const after = manifest?.syncedAt
    ? new Date(new Date(manifest.syncedAt).getTime() - (add24hOverlap ? 24 * 3600_000 : 0)).toISOString()
    : null;

  let incoming = [];
  try {
    incoming = await fetchCollection({ addedAfter: after });
    console.log(`    fetched ${incoming.length} new/updated indicators${after ? ` (added_after ${after})` : ' (full)'}`);
  } catch (err) {
    if (prevIndicators.length > 0) {
      console.error(`  ✘ TAXII fetch failed (${err instanceof Error ? err.message : err}) — keeping existing staging`);
      return prevIndicators.length;
    }
    throw err;
  }

  const merged = mergeIndicators(prevIndicators, incoming);
  const nowIso = new Date().toISOString();
  const staged = {
    source: DPHISH.source,
    sourceUrl: DPHISH.sourceUrl,
    collectionId: DPHISH.collectionId,
    collectionUrl: DPHISH.collectionUrl,
    description: DPHISH.description,
    license: DPHISH.license,
    syncedAt: nowIso,
    rawFetched: incoming.length,
    indicatorCount: merged.length,
    indicators: merged,
  };
  writeFileSync(join(OUT, 'indicators.json'), JSON.stringify(staged, null, 2));
  console.log(`    ✔ staged ${merged.length} indicators (${incoming.length} new, ${merged.length - prevIndicators.length} net)`);
  console.log('\nNext: node scripts/build-dphish.mjs');
  return merged.length;
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});