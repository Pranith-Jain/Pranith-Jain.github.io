#!/usr/bin/env node
/**
 * Sync the Living Threat Repository (living-threat.rabitanoor.com) incident
 * corpus into staging.
 *
 * The Living Threat Repository (github.com/HudKSD/Living-Threat, MIT) is a
 * Flask app backed by Elasticsearch that continuously maps real-world
 * incident reports to MITRE ATT&CK tactics and techniques. The public
 * deployment keys off a keyless JSON API:
 *
 *   GET /api/bootstrap?size=N   — up to 5000 normalized incident docs
 *                                (AI-enriched: per-kill-chain-stage ATT&CK
 *                                tactic/technique mappings, CVEs, actors,
 *                                tools, severity, priority/relevance scores,
 *                                diamond model, detection hints + rules)
 *
 * The index currently holds ~21k incidents (`latest_seq`) but the bootstrap
 * endpoint caps at size=5000 — so we mirror the Threaticon-catalog approach
 * and ship the newest 5000 (documented cap, see build script).
 *
 * Run by:
 *   1. GitHub Action (.github/workflows/threat-intel-sync.yml)
 *   2. Manual: `node scripts/sync-living-threat.mjs`
 *
 * After sync, run `node scripts/build-living-threat.mjs` to slice staged
 * data into public/data/threat-intel/living-threat/.
 *
 * Source: https://living-threat.rabitanoor.com (MIT, public, no key)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const OUT = join(STAGING, 'living-threat');
const UA = 'pranithjain-threat-intel-sync/1.0 (+https://pranithjain.qzz.io)';

export const LIVING_THREAT = {
  source: 'living-threat.rabitanoor.com',
  sourceUrl: 'https://living-threat.rabitanoor.com/',
  repoUrl: 'https://github.com/HudKSD/Living-Threat',
  bootstrapUrl: 'https://living-threat.rabitanoor.com/api/bootstrap?size=5000',
  description:
    'Living Threat Repository — real-world incidents continuously mapped to MITRE ATT&CK tactics and techniques, with per-kill-chain-stage detection + remediation notes (AI-enriched), CVEs, threat actors, tools, priority scoring, and hunt-pack guidance.',
  license: 'MIT (github.com/HudKSD/Living-Threat); ATT&CK is a MITRE trademark — platform not affiliated with MITRE',
};

// The upstream bootstrap endpoint honours size up to 5000. Never ask for less.
export const MAX_INCIDENTS = 5000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [2000, 5000, 10_000];

function ensureOut() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
}

async function fetchJsonWithRetry(url, { expected = 'bootstrap' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = RETRY_BACKOFF_MS[attempt - 1] ?? 15_000;
      console.log(`  ⚠ ${expected} attempt ${attempt}/${MAX_RETRIES} failed — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const body = await res.json();
      if (expected === 'bootstrap' && (!body || !Array.isArray(body.docs))) {
        throw new Error('bootstrap response missing docs array');
      }
      return body;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`fetch failed after ${MAX_RETRIES} retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function main() {
  console.log('Living Threat sync — fetching bootstrap from', LIVING_THREAT.bootstrapUrl);
  const payload = await fetchJsonWithRetry(LIVING_THREAT.bootstrapUrl, { expected: 'bootstrap' });

  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  if (docs.length === 0) {
    console.error('  ✘ bootstrap returned zero docs — aborting');
    process.exit(1);
  }
  console.log(`  ✔ fetched ${docs.length} incident docs`);

  ensureOut();
  const staged = {
    source: LIVING_THREAT.source,
    sourceUrl: LIVING_THREAT.sourceUrl,
    repoUrl: LIVING_THREAT.repoUrl,
    description: LIVING_THREAT.description,
    license: LIVING_THREAT.license,
    syncedAt: new Date().toISOString(),
    meta: {
      apiUrl: payload.meta?.index ?? null,
      latestTs: payload.meta?.latest_ts ?? null,
      latestSeq: payload.meta?.latest_seq ?? null,
      anchorTs: payload.meta?.anchor_ts ?? null,
      uiNow: payload.meta?.ui_now ?? null,
      fetchedAt: payload.meta?.fetched_at ?? null,
      upstreamCount: docs.length,
      morningRate: null,
    },
    docs,
  };
  const p = join(OUT, 'incidents.json');
  writeFileSync(p, JSON.stringify(staged));
  const bytes = Buffer.byteLength(JSON.stringify(staged), 'utf8');
  console.log(`    ✔ staged ${docs.length} incidents → ${p} (${(bytes / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error('  ✘', e instanceof Error ? e.message : e);
  process.exit(1);
});