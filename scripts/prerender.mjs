#!/usr/bin/env node
/**
 * SSR prerender step. Runs after `vite build` + `vite build --ssr`.
 *
 * For each route in ROUTES below, imports the SSR bundle's `render(url)`,
 * generates the route's HTML, and writes it into dist/<route>/index.html.
 * Cloudflare's Assets binding then serves the prerendered HTML for that
 * route instead of the empty SPA shell — meaning users see real content
 * before React even loads.
 *
 * Client-side React still mounts: main.tsx uses hydrateRoot() (added in
 * Phase 2) which adopts the existing DOM rather than creating new nodes.
 *
 * Phase 1 (this file's current scope): only the home route is rendered,
 * as a proof of concept. The pipeline is staged but PRODUCTION DOES NOT
 * SERVE THE PRERENDERED HTML YET — that happens in Phase 2 when we
 * confirm the model works.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cpus } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// Render up to N routes in parallel. CPU-bound (React SSR walks the full
// tree + serializes), so concurrency = CPU count keeps cores saturated
// without excessive memory from 100+ concurrent render streams.
const CONCURRENCY = Math.max(1, cpus().length);

// Phase 3 (2026-05-12): expanded from `/` only to a batch of 20 static-
// content routes. Each was verified to make 0 /api/v1/ calls on mount,
// so renderToString actually produces useful content (not data-loading
// fallback states).
//
// Phase 3.1 (2026-05-12 later same day): added live-feed pages too.
// These DO fetch on mount, so the prerendered HTML contains the page
// chrome + initial "loading…" state. useEffect is client-only so SSR
// doesn't hang on data. Win: chrome paints from HTML (instant FCP)
// rather than waiting for JS parse + React mount, and hydration matches
// the initial loading-state tree so there's no tearing.
const ROUTES = [
  // ── Portfolio (6) ──────────────────────────────────────────────
  '/',
  '/about',
  '/skills',
  '/experience',
  '/projects',
  '/blog',

  // ── Landings (2) ───────────────────────────────────────────────
  '/dfir',
  '/threatintel',

  // ── DFIR: tools that were mapped in worker/router.ts PRERENDERED_ROUTES
  //    but missing here, so they were served as the bare SPA shell and
  //    cached 24h as "prerendered". Now generated like their siblings. ──
  '/dfir/ai-rule-generator',
  '/dfir/threat-graph',
  '/dfir/attack-chain',
  '/dfir/hunting-query-generator',
  '/dfir/sandbox',
  '/dfir/ir-playbooks',
  '/dfir/stealer-parser',
  '/dfir/taxii',
  '/dfir/bloom',
  '/dfir/whois-history',
  '/dfir/open-directory',

  // ── DFIR: static catalogs & education (8) — 0 API calls ───────
  '/dfir/diamond',
  '/dfir/owasp',
  '/dfir/lolbins',
  '/dfir/kill-chain',
  '/dfir/tabletop',
  '/dfir/grc',
  '/dfir/data-classification',
  '/dfir/privacy-hub',

  // ── DFIR: utilities & decoders (7) — 0 API calls ──────────────
  '/dfir/timestamp',
  '/dfir/hash-calc',
  '/dfir/decode',
  '/dfir/encoder',
  '/dfir/punycode',
  '/dfir/dork-builder',
  '/dfir/brand-impersonation',

  // ── DFIR: image / media (3) — 0 API calls ─────────────────────
  '/dfir/image-fingerprint',
  '/dfir/reverse-image',
  '/dfir/exif',

  // ── DFIR: file format analyzers (8) — 0 API calls ─────────────
  '/dfir/plist-protobuf',
  '/dfir/pcap-triage',
  '/dfir/registry-hive',
  '/dfir/evtx',
  '/dfir/sqlite',
  '/dfir/ios-backup',
  '/dfir/mobile-sqlite',
  '/dfir/apk-analyzer',

  // ── DFIR: binary / log analyzers (5) — 0 API calls ────────────
  '/dfir/pe',
  '/dfir/web-log',
  '/dfir/prefetch',
  '/dfir/powershell-deobf',
  '/dfir/screenshot-intel',

  // ── DFIR: detection & analysis (8) — 0 API calls ──────────────
  '/dfir/rule-converter',
  '/dfir/rule-playground',
  '/dfir/yara',
  '/dfir/detection-lab',
  '/dfir/prompt-injection',
  '/dfir/mcp-audit',
  '/dfir/agent-map',
  '/dfir/cve-prioritizer',

  // ── DFIR: cloud security (7) — 0 API calls ────────────────────
  '/dfir/iam-analyzer',
  '/dfir/gcp-iam',
  '/dfir/azure-rbac',
  '/dfir/sg-analyzer',
  '/dfir/cloudtrail-triage',
  '/dfir/k8s-rbac',
  '/dfir/terraform-scan',

  // ── DFIR: API security (5) — 0 API calls ──────────────────────
  '/dfir/openapi-audit',
  '/dfir/sec-headers',
  '/dfir/secret-scan',
  '/dfir/graphql-audit',
  '/dfir/osv-scan',

  // ── DFIR: STIX (2) — 0 API calls ──────────────────────────────
  '/dfir/stix',
  '/dfir/stix-builder',

  // ── DFIR: security frameworks (3) — 0 API calls ───────────────
  '/dfir/nhi',
  '/dfir/jwt',
  '/dfir/privacy',

  // ── DFIR: dark web workbench (2) — 0 API calls ────────────────
  '/dfir/pgp-tool',
  '/dfir/tor-gateway',

  // ── DFIR: tools that fetch /api/v1/* on mount (33) ────────────
  // Prerendered chrome + loading state, then client hydrates.
  '/dfir/ioc-check',
  '/dfir/phishing',
  '/dfir/domain',
  '/dfir/domain-rep',
  '/dfir/full-spectrum',
  '/dfir/exposure',
  '/dfir/dashboard',
  '/dfir/cve',
  '/dfir/cert-search',
  '/dfir/atlas',
  '/dfir/asn',
  '/dfir/breach',
  '/dfir/url-preview',
  '/dfir/extract',
  '/dfir/ioc-pivot',
  '/dfir/google-dorks',
  '/dfir/linux-triage',
  '/dfir/takeover',
  '/dfir/email-defense',
  '/dfir/dmarc-analyzer',
  '/dfir/dlp-scan',
  '/dfir/username',
  '/dfir/wayback',
  '/dfir/ip-geo',
  '/dfir/log-parser',
  '/dfir/socmint',
  '/dfir/tools/about',
  '/dfir/web-scan',
  '/dfir/malware-scan',
  '/dfir/sample-scan',
  '/dfir/eml',
  '/dfir/url-rep',
  '/dfir/email-rep',
  '/dfir/crypto-trace',

  // ── Static threatintel catalogs (11) — 0 API calls ────────────
  '/threatintel/mitre',
  '/threatintel/actor-kb',
  '/threatintel/actor-dna',
  '/threatintel/predictive',
  '/threatintel/campaign-lifecycle',
  '/threatintel/attribution',
  '/threatintel/intelligence-gaps',
  '/threatintel/cross-campaign',
  '/threatintel/actors',
  '/threatintel/rules',
  '/threatintel/briefings',

  // ── ThreatIntel pages (4) — 0 API calls ───────────────────────
  '/threatintel/about',
  '/threatintel/external-resources',

  // ── ThreatIntel: static catalogs (5) — 0 API calls ────────────
  '/threatintel/wiki',
  '/threatintel/awesome-lists',
  '/threatintel/secops-tools',
  '/threatintel/cve-resources',
  '/threatintel/osint-framework',

  // ── ThreatIntel: live-feed surfaces (38) — prerendered chrome ─
  // Client hydrates and fetches /api/v1/* on mount.
  '/threatintel/pulse',
  '/threatintel/darkweb',
  '/threatintel/ransomware-map',
  '/threatintel/certstream',
  '/threatintel/campaign-generator',
  '/threatintel/campaigns',
  '/threatintel/malicious-packages',
  '/threatintel/x-watch',
  '/threatintel/x-live',
  '/threatintel/mythreatintel',
  '/threatintel/cybersec',
  '/threatintel/breach',
  '/threatintel/reddit',
  '/threatintel/x',
  '/threatintel/status',
  '/threatintel/metrics',
  '/threatintel/correlation',
  '/threatintel/actor-timeline',
  '/threatintel/re-leaks',
  '/threatintel/c2-tracker',
  '/threatintel/signal',
  '/threatintel/research',
  '/threatintel/cve-list',
  '/threatintel/threat-map',
  '/threatintel/deepdarkcti',
  '/threatintel/ransomware-live',
  '/threatintel/infostealer',
  '/threatintel/feed-sources',
  '/threatintel/settings',
  '/threatintel/negotiations',
  '/threatintel/maltrail',
  '/threatintel/malpedia',
  '/threatintel/breach-forums',
  '/threatintel/domain-monitor',
  '/threatintel/scam-watch',
  '/threatintel/tech-ai-news',
  '/threatintel/onion-watch',
  '/threatintel/telegram-watch',
  '/threatintel/telegram-settings',
  '/threatintel/misp-browser',
  '/threatintel/search',
  '/threatintel/ioc-enrichment',
  '/threatintel/copilot',
  '/threatintel/watches',
  // Live-feed surfaces that were already prerendered
  '/threatintel/threat-feeds',
  '/threatintel/writeups',
  '/threatintel/cyber-crime',
  '/threatintel/ransomware-activity',
  '/threatintel/live-iocs',
  '/threatintel/detections',
  '/threatintel/assessments',
  '/threatintel/feed-quality',

  // ── Phase 4 (2026-06-04): 43 real static routes that existed in App.tsx
  //    but had no entry here or in worker/router.ts PRERENDERED_ROUTES.
  //    Without this, those routes were served as the bare SPA shell and
  //    cached 24h as if "prerendered" (silent drift). Now they get the
  //    same chrome+loading-state treatment as their siblings.

  // ── Portfolio (2) ────────────────────────────────────────────
  '/admin',
  '/copilot',

  // ── DFIR: real pages (10) ────────────────────────────────────
  '/dfir/abuse-rep',
  '/dfir/asset-intel',
  '/dfir/blocklists',
  '/dfir/ct-monitor',
  '/dfir/file',
  '/dfir/host-graph',
  '/dfir/identity-lookup',
  '/dfir/ioc-lifecycle',
  '/dfir/report-parser',
  '/dfir/threat-hunt',

  // ── ThreatIntel: real pages, not redirects (28) ──────────────
  '/threatintel/ach',
  '/threatintel/actor-usernames',
  '/threatintel/aggregated-feeds',
  '/threatintel/analyze',
  '/threatintel/atlas',
  '/threatintel/collection-slo',
  '/threatintel/cross-correlate',
  '/threatintel/crypto-scams',
  '/threatintel/darkweb-tools',
  '/threatintel/entity-resolution',
  '/threatintel/feed-catalog',
  '/threatintel/feed-scheduler',
  '/threatintel/insider-threat-matrix',
  '/threatintel/intel-dashboard',
  '/threatintel/investigations',
  '/threatintel/malware-iocs',
  '/threatintel/malware-vault',
  '/threatintel/observable-db',
  '/threatintel/phishing-wordlists',
  '/threatintel/pir-dashboard',
  '/threatintel/projectdiscovery',
  '/threatintel/ransom-payments',
  '/threatintel/ransom-report',
  '/threatintel/relationship-graph',
  '/threatintel/source-reliability',
  '/threatintel/telegram-leaks',
  '/threatintel/telegram-leaks/channels',
  '/threatintel/telegram-leaks/stats',
  '/threatintel/yara',
];

const SHELL_PATH = resolve(ROOT, 'dist/index.html');
const SERVER_BUNDLE = resolve(ROOT, '.ssr-build/entry-server.js');

async function main() {
  if (!existsSync(SHELL_PATH)) {
    console.error(`prerender: missing ${SHELL_PATH} — run \`vite build\` first.`);
    process.exit(1);
  }
  if (!existsSync(SERVER_BUNDLE)) {
    console.error(`prerender: missing ${SERVER_BUNDLE} — run \`vite build --ssr src/entry-server.tsx\` first.`);
    process.exit(1);
  }

  const shell = await readFile(SHELL_PATH, 'utf8');
  // Dynamic import of the local file via file:// URL (ESM requirement).
  const { render } = await import(pathToFileURL(SERVER_BUNDLE).href);
  if (typeof render !== 'function') {
    throw new Error('prerender: server bundle does not export render(url)');
  }

  // Prerendered HTML goes under dist/__prerendered/ so Cloudflare Assets
  // doesn't auto-serve it for the matching route. The Worker's fetch
  // handler explicitly looks up __prerendered/<slug>.html and falls back
  // to the SPA shell (dist/index.html) when it's missing. Keeping the
  // SPA shell untouched means unknown routes still get the correct
  // fallback behavior.
  const prerenderDir = resolve(ROOT, 'dist/__prerendered');
  await mkdir(prerenderDir, { recursive: true });

  const manifest = [];
  let okCount = 0;

  async function renderOne(route) {
    const { html: appHtml } = await render(route);
    const finalHtml = shell.replace(/<div id="root"><\/div>/, `<div id="root">${appHtml}</div>`);
    if (finalHtml === shell) {
      throw new Error('prerender: shell did not contain <div id="root"></div> placeholder');
    }
    const slug = route === '/' ? 'home' : route.slice(1).replace(/\//g, '__');
    const outFile = resolve(prerenderDir, `${slug}.html`);
    await writeFile(outFile, finalHtml, 'utf8');
    const sizeKB = (finalHtml.length / 1024).toFixed(1);
    console.log(`  ✓ ${route.padEnd(30)} → __prerendered/${slug}.html  (${sizeKB} KB)`);
    return { route, file: `__prerendered/${slug}.html` };
  }

  // Process routes in concurrent batches to saturate CPU without
  // overwhelming memory from N simultaneous render streams.
  for (let i = 0; i < ROUTES.length; i += CONCURRENCY) {
    const batch = ROUTES.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(renderOne));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        manifest.push(result.value);
        okCount++;
      } else {
        console.error(`  ✗ ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    }
  }

  // Manifest tells the Worker which routes have prerendered HTML available.
  await writeFile(
    resolve(prerenderDir, 'manifest.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), routes: manifest }, null, 2),
    'utf8'
  );

  console.log(`\nprerender: ${okCount}/${ROUTES.length} routes rendered → dist/__prerendered/`);
  if (okCount === 0) process.exit(1);

  // ── Drift guard ─────────────────────────────────────────────────────────
  // worker/router.ts (PRERENDERED_ROUTES) maps each route to /__prerendered/
  // <slug>. With not_found_handling:"single-page-application", a MISSING
  // prerendered asset is served as the SPA shell at status 200 — so a route
  // listed there without a generated file is silently served (and cached 24h)
  // as the bare shell labelled "prerendered". Fail the build on that drift,
  // including a route here that failed to render (absent from the manifest).
  const generated = new Set(manifest.map((m) => m.file.replace(/^__prerendered\//, '').replace(/\.html$/, '')));
  const routerSrc = await readFile(resolve(ROOT, 'worker/router.ts'), 'utf8');
  const expected = [...new Set([...routerSrc.matchAll(/\/__prerendered\/([a-zA-Z0-9_-]+)/g)].map((m) => m[1]))];
  const missing = expected.filter((slug) => !generated.has(slug));
  if (missing.length > 0) {
    console.error(
      `\nprerender: ✗ ${missing.length} PRERENDERED_ROUTES entr${missing.length === 1 ? 'y has' : 'ies have'} no generated HTML`
    );
    console.error('  (each is served as the bare SPA shell, cached 24h as "prerendered"):');
    for (const slug of missing) console.error(`    /__prerendered/${slug}`);
    console.error('\n  Fix: add the route to ROUTES above, or remove it from worker/router.ts PRERENDERED_ROUTES.\n');
    process.exit(1);
  }
  console.log(`prerender: ✓ all ${expected.length} PRERENDERED_ROUTES entries have generated HTML.`);
}

void main();
