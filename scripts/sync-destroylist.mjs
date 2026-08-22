#!/usr/bin/env node
/**
 * Sync the Destroylist (phishdestroy/destroylist) phishing-domain feeds into
 * threat-intel-staging/destroylist/.
 *
 * Fetches (all keyless, MIT-licensed):
 *   list.txt                    — primary curated feed (~193k domains)
 *   community/blocklist.txt     — community aggregate, 13+ sources (~1M lines;
 *                                 kept OUT of the shipped asset bundle — used
 *                                 only for counts + delta stats here)
 *   dns/active_domains.txt      — DNS-verified active subset of primary
 *   count.json                  — badge counter (primary entry count)
 *
 * Output:
 *   threat-intel-staging/destroylist/primary.txt
 *   threat-intel-staging/destroylist/community.txt
 *   threat-intel-staging/destroylist/meta.json
 *
 * Run:  node scripts/sync-destroylist.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'destroylist');
const RAW_BASE = 'https://raw.githubusercontent.com/phishdestroy/destroylist/main';

mkdirSync(STAGING, { recursive: true });

function normalizeLine(line) {
  // Strip hosts-file syntax ("0.0.0.0 domain"), comments, scheme, path,
  // www prefix and trailing dots — destroylist publishes plain domains but
  // some mirrors wrap them.
  let d = line.trim();
  if (!d || d.startsWith('#')) return null;
  d = d.replace(/^(?:\d{1,3}(?:\.\d{1,3}){3}\s+|::1\s+)/, '');
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  d = d.replace(/^www\./i, '').replace(/\.$/, '').toLowerCase();
  if (!d || !d.includes('.') || /\s/.test(d)) return null;
  // Bare IPv4/IPv6 literals are not "phishing domains" for this feed's purpose.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(d)) return null;
  return d;
}

async function fetchLines(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  const set = new Set();
  let dropped = 0;
  for (const line of text.split('\n')) {
    const d = normalizeLine(line);
    if (d) set.add(d);
    else if (line.trim() && !line.startsWith('#')) dropped += 1;
  }
  console.log(`  ${label}: ${set.size.toLocaleString()} unique domains (${dropped} lines dropped)`);
  return set;
}

async function fetchJson(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json());
  } catch (e) {
    console.warn(`  ${label} unavailable: ${e instanceof Error ? e.message : String(e)} (non-fatal)`);
    return null;
  }
}

console.log('Syncing destroylist feeds…');
const primary = await fetchLines(`${RAW_BASE}/list.txt`, 'primary');
const community = await fetchLines(`${RAW_BASE}/community/blocklist.txt`, 'community');
const active = await fetchLines(`${RAW_BASE}/dns/active_domains.txt`, 'primary-active');
const countBadge = await fetchJson(`${RAW_BASE}/count.json`, 'count.json');

// Active must be a subset of primary — intersect defensively against drift
// between the two upstream files.
const activeClean = new Set([...active].filter((d) => primary.has(d)));

// Primary ships as hash-bucketed assets (~4MB total). The 1M-line community
// aggregate is counted here but deliberately NOT persisted — it stays
// reachable at runtime through the keyless api.destroy.tools lookup instead
// of bloating the deployment bundle by ~23MB.
writeFileSync(join(STAGING, 'primary.txt'), [...primary].sort().join('\n'));

const meta = {
  syncedAt: new Date().toISOString(),
  source: 'github.com/phishdestroy/destroylist',
  license: 'MIT',
  counts: {
    primary: primary.size,
    community: community.size,
    primaryActive: activeClean.size,
    upstreamBadge: typeof countBadge?.message === 'string' ? countBadge.message : undefined,
  },
};
writeFileSync(join(STAGING, 'meta.json'), JSON.stringify(meta, null, 2));
console.log('Done:', JSON.stringify(meta.counts));
