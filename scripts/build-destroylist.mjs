#!/usr/bin/env node
/**
 * Build the Destroylist (phishdestroy/destroylist) manifest under
 * public/data/threat-intel/destroylist/.
 *
 * Reads staging in ./threat-intel-staging/destroylist/ (from
 * `node scripts/sync-destroylist.mjs`) and emits:
 *   index.json            — source meta, counts, sync timestamp, bucket count
 *   buckets/<nn>.json     — hash-bucketed sorted domain arrays. Membership
 *                           check at runtime = fetch ONE bucket via ASSETS +
 *                           binary search; the loader LRU-caches buckets.
 *
 * Bucketing: djb2 hash of the domain mod BUCKET_COUNT. 64 buckets keep each
 * asset ~60-70KB for the ~193k-domain primary feed — one subrequest per
 * cold lookup, zero KV, no public egress.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'destroylist');
const OUT = join(ROOT, 'public', 'data', 'threat-intel', 'destroylist');

const BUCKET_COUNT = 64;

/** Same djb2 as the runtime loader — MUST stay in sync with threat-intel-manifest.ts. */
export function bucketOf(domain) {
  let h = 5381;
  const s = String(domain).toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h % BUCKET_COUNT;
}

function readStaging() {
  const p = join(STAGING, 'primary.txt');
  if (!existsSync(p)) {
    console.error(`  ⚠ no staging file at ${p} — run \`node scripts/sync-destroylist.mjs\` first`);
    process.exit(1);
  }
  return readFileSync(p, 'utf8').split('\n').filter(Boolean);
}

const domains = readStaging();

// ── Bucket ──────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'buckets'), { recursive: true });

const buckets = Array.from({ length: BUCKET_COUNT }, () => []);
for (const d of domains) buckets[bucketOf(d)].push(d);
for (const b of buckets) b.sort();

let written = 0;
for (let i = 0; i < BUCKET_COUNT; i++) {
  if (buckets[i].length === 0) continue;
  writeFileSync(join(OUT, 'buckets', `${String(i).padStart(2, '0')}.json`), JSON.stringify(buckets[i]));
  written += 1;
}

// Root-domain rollup for the blocklists feed + UI stats: registered label
// heuristic (last two labels; handles common two-part public suffixes).
const TWO_PART = new Set([
  'co.uk','org.uk','ac.uk','gov.uk','com.au','net.au','org.au','co.nz','com.br',
  'com.mx','com.ar','co.za','com.sg','com.tr','co.in','co.jp','ne.jp','or.jp',
  'com.cn','com.tw','com.hk','com.ua','com.ng','com.gh','co.ke','com.pk',
]);
function rootDomain(d) {
  const parts = d.split('.');
  if (parts.length <= 2) return d;
  const last2 = parts.slice(-2).join('.');
  return TWO_PART.has(last2) ? parts.slice(-3).join('.') : last2;
}
const roots = new Set(domains.map(rootDomain));

// ── Index ───────────────────────────────────────────────────────────────
const metaPath = join(STAGING, 'meta.json');
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};

const index = {
  source: 'github.com/phishdestroy/destroylist',
  license: 'MIT',
  syncedAt: meta.syncedAt ?? new Date().toISOString(),
  bucketCount: BUCKET_COUNT,
  bucketsWritten: written,
  counts: {
    primary: domains.length,
    primaryRoots: roots.size,
    community: meta.counts?.community ?? null,
    primaryActive: meta.counts?.primaryActive ?? null,
  },
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

// Sorted root-domain list consumed by build-blocklists.mjs (pfSense/iptables/
// suricata formats) — root domains only, per destroylist's own guidance that
// full lists carry hosting-platform subdomains unsuitable for firewall rules.
writeFileSync(join(OUT, 'roots.json'), JSON.stringify([...roots].sort()));

console.log(
  `destroylist build: ${domains.length.toLocaleString()} domains → ${written}/${BUCKET_COUNT} buckets, ` +
    `${roots.size.toLocaleString()} root domains`
);
