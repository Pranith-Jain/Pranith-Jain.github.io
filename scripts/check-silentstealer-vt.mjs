#!/usr/bin/env node
/**
 * Batch-check SilentStealer hashes against VirusTotal.
 * Reads hashes from public/data/silentstealer-hashes.txt, queries VT v3 API,
 * writes results to public/data/silentstealer-vt-results.json.
 *
 * Usage: VT_API_KEY=xxx node scripts/check-silentstealer-vt.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HASHES_FILE = resolve(__dirname, '../public/data/silentstealer-hashes.txt');
const RESULTS_FILE = resolve(__dirname, '../public/data/silentstealer-vt-results.json');

const VT_KEY = process.env.VT_API_KEY;
if (!VT_KEY) {
  console.error('VT_API_KEY not set. Usage: VT_API_KEY=xxx node scripts/check-silentstealer-vt.mjs');
  process.exit(1);
}

const DELAY_MS = 16_000; // VT free tier: 4 req/min → ~15s between requests

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkHash(hash) {
  const res = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
    headers: { 'x-apikey': VT_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return { hash, status: 'error', http_status: res.status };
  }
  const json = await res.json();
  const attrs = json.data?.attributes ?? {};
  const stats = attrs.last_analysis_stats ?? {};
  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const undetected = Number(stats.meaningful_name ? 0 : stats.undetected ?? 0);
  const total = malicious + suspicious + harmless + undetected || 1;
  const score = Math.min(100, Math.round(((malicious + suspicious * 0.5) / total) * 100));
  return {
    hash,
    status: 'ok',
    malicious,
    suspicious,
    harmless,
    undetected,
    total_engines: total,
    score,
    verdict: score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean',
    tags: (attrs.tags ?? []).slice(0, 10),
    names: (attrs.names ?? []).slice(0, 5),
    type_description: attrs.type_description ?? '',
    first_submission_date: attrs.first_submission_date
      ? new Date(attrs.first_submission_date * 1000).toISOString()
      : '',
    last_analysis_date: attrs.last_analysis_date
      ? new Date(attrs.last_analysis_date * 1000).toISOString()
      : '',
  };
}

async function main() {
  const hashes = readFileSync(HASHES_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(`Loaded ${hashes.length} hashes. Starting VT lookups (${DELAY_MS / 1000}s delay)...`);

  const results = [];
  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i];
    process.stdout.write(`[${i + 1}/${hashes.length}] ${hash.slice(0, 12)}... `);
    try {
      const r = await checkHash(hash);
      results.push(r);
      if (r.status === 'ok') {
        console.log(`${r.malicious} mal | ${r.suspicious} sus | score=${r.score} | ${r.verdict}`);
      } else {
        console.log(`HTTP ${r.http_status}`);
      }
    } catch (e) {
      results.push({ hash, status: 'error', error: e.message });
      console.log(`ERROR: ${e.message}`);
    }
    if (i < hashes.length - 1) await sleep(DELAY_MS);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total_hashes: hashes.length,
    ok: results.filter((r) => r.status === 'ok').length,
    errors: results.filter((r) => r.status !== 'ok').length,
    detection_stats: {
      malicious: results.filter((r) => r.verdict === 'malicious').length,
      suspicious: results.filter((r) => r.verdict === 'suspicious').length,
      clean: results.filter((r) => r.verdict === 'clean').length,
    },
    results,
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nDone. Results written to ${RESULTS_FILE}`);
  console.log(
    `Summary: ${summary.detection_stats.malicious} malicious, ${summary.detection_stats.suspicious} suspicious, ${summary.detection_stats.clean} clean, ${summary.errors} errors`
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
