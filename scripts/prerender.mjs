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
  // ── Portfolio (8) ──────────────────────────────────────────────
  '/',
  '/about',
  '/skills',
  '/experience',
  '/projects',
  '/behind-the-reports',
  '/sponsor',
  '/blog',

  // ── Landings (4) ───────────────────────────────────────────────
  '/dfir',
  '/dfir/catalog',
  '/dfir/vs',
  '/radar',
  '/threatintel',
  '/threatintel/catalog',
  '/threatintel/actors/attribution',
  '/threatintel/actors/catalog',
  '/threatintel/actors/directory',
  '/threatintel/actors/dna',
  '/threatintel/actors/graph',
  '/threatintel/actors/kb',
  '/threatintel/actors/timeline',
  '/threatintel/actors/usernames',
  '/threatintel/campaigns/active',
  '/threatintel/campaigns/cross',
  '/threatintel/campaigns/generator',
  '/threatintel/campaigns/lifecycle',
  '/threatintel/cves/advisories',
  '/threatintel/cves/cves',
  '/threatintel/cves/exploitable',
  '/threatintel/cves/k8s',
  '/threatintel/cves/list',
  '/threatintel/cves/resources',
  '/threatintel/darkweb/bitcoin',
  '/threatintel/darkweb/crime',
  '/threatintel/darkweb/deepdark',
  '/threatintel/darkweb/disclosures',
  '/threatintel/darkweb/forums',
  '/threatintel/darkweb/infostealer',
  '/threatintel/darkweb/leaks',
  '/threatintel/darkweb/markets',
  '/threatintel/darkweb/ransom-activity',
  '/threatintel/darkweb/ransom-map',
  '/threatintel/darkweb/ransom-report',
  '/threatintel/darkweb/ransomwhere',
  '/threatintel/darkweb/recon',
  '/threatintel/darkweb/watch',
  '/threatintel/detections/detections',
  '/threatintel/detections/disarm',
  '/threatintel/detections/signal',
  '/threatintel/detections/yara',
  '/threatintel/external/awesome',
  '/threatintel/external/external',
  '/threatintel/external/supply',
  '/threatintel/feeds/catalog',
  '/threatintel/feeds/mythreatintel',
  '/threatintel/feeds/quality',
  '/threatintel/feeds/reliability',
  '/threatintel/feeds/scheduler',
  '/threatintel/feeds/sources',
  '/threatintel/feeds/status',
  '/threatintel/feeds/threatfeeds',
  '/threatintel/infra/cloud',
  '/threatintel/infra/domain',
  '/threatintel/infra/infra',
  '/threatintel/infra/webamon',
  '/threatintel/iocs/aggregated',
  '/threatintel/iocs/c2',
  '/threatintel/iocs/correlation',
  '/threatintel/iocs/cross',
  '/threatintel/iocs/enrichment',
  '/threatintel/iocs/entity',
  '/threatintel/iocs/feeds',
  '/threatintel/iocs/live',
  '/threatintel/iocs/map',
  '/threatintel/iocs/observable',
  '/threatintel/iocs/soc',
  '/threatintel/malware/iocs',
  '/threatintel/malware/malpedia',
  '/threatintel/malware/maltrail',
  '/threatintel/malware/packages',
  '/threatintel/malware/sandbox',
  '/threatintel/malware/vault',
  '/threatintel/osint/cli',
  '/threatintel/osint/framework',
  '/threatintel/osint/map',
  '/threatintel/osint/secops',
  '/threatintel/osint/certs',
  '/threatintel/osint/toolbox',
  '/threatintel/phishing/phish',
  '/threatintel/phishing/scam',
  '/threatintel/phishing/urls',
  '/threatintel/predictive/analytics',
  '/threatintel/predictive/analyze',
  '/threatintel/predictive/assessments',
  '/threatintel/predictive/certstream',
  '/threatintel/predictive/dashboard',
  '/threatintel/predictive/global-pulse',
  '/threatintel/predictive/metrics',
  '/threatintel/predictive/observe',
  '/threatintel/predictive/pir',
  '/threatintel/predictive/predictions',
  '/threatintel/predictive/predictive',
  '/threatintel/predictive/threat-pulse',
  '/threatintel/research-hub/ach',
  '/threatintel/research-hub/ai',
  '/threatintel/research-hub/agentic',
  '/threatintel/research-hub/attack-flow',
  '/threatintel/research-hub/campaign-gen',
  '/threatintel/research-hub/knowledge',
  '/threatintel/research-hub/post',
  '/threatintel/research-hub/redhunt',
  '/threatintel/research-hub/redhunt-labs',
  '/threatintel/research-hub/reports',
  '/threatintel/research-hub/research',
  '/threatintel/research-hub/signal',
  '/threatintel/research-hub/volexity',
  '/threatintel/research-hub/writeups',
  '/threatintel/social/crypto-scam',
  '/threatintel/social/firehose',
  '/threatintel/social/news',
  '/threatintel/social/reddit',
  '/threatintel/social/scraped-intel',
  '/threatintel/social/telegram-channels',
  '/threatintel/social/telegram-leaks',
  '/threatintel/social/telegram-settings',
  '/threatintel/social/telegram-stats',
  '/threatintel/social/x-firehose',
  '/threatintel/social/x-live',
  '/threatintel/social/x-watch',
  '/threatintel/tools/copilot',
  '/threatintel/tools/graph',
  '/threatintel/tools/investigations',
  '/threatintel/tools/mcp',
  '/threatintel/tools/misp',
  '/threatintel/tools/settings',
  '/threatintel/tools/stix',
  '/threatintel/tools/unified-search',
  '/threatintel/tools/watches',
  '/threatintel/tools/workspaces',
  '/threatintel/tools/tg-intel-search',
  '/threatintel/tools/socradar-tools',
  '/threatintel/wiki/f3ead',
  '/threatintel/wiki/insider',
  '/threatintel/wiki/llm',
  '/threatintel/wiki/mitre',
  '/threatintel/wiki/owasp',
  '/threatintel/wiki/wiki',

  // ── DFIR: tools that were mapped in worker/router.ts PRERENDERED_ROUTES
  //    but missing here, so they were served as the bare SPA shell and
  //    cached 24h as "prerendered". Now generated like their siblings. ──
  '/dfir/ai-rule-generator',
  '/dfir/fp-lens',
  '/dfir/threat-graph',
  '/dfir/attack-chain',
  '/dfir/hunting-query-generator',
  '/dfir/sandbox',
  '/dfir/ir-playbooks',
  '/dfir/stealer-parser',
  '/dfir/taxii',
  '/dfir/bloom',
  '/dfir/whois-history',
  '/dfir/passive-dns',
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
  '/dfir/personal-security',

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
  '/dfir/pi-taxonomy',
  '/dfir/ironsight',
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

  // ── DFIR: API security (6) — 0 API calls ──────────────────────
  '/dfir/openapi-audit',
  '/dfir/sec-headers',
  '/dfir/secret-scan',
  '/dfir/medusa-scan',
  '/dfir/graphql-audit',
  '/dfir/osv-scan',

  // ── DFIR: STIX (2) — 0 API calls ──────────────────────────────
  '/dfir/stix',
  '/dfir/stix-builder',

  // ── DFIR: security frameworks (3) — 0 API calls ───────────────
  '/dfir/nhi',
  '/dfir/jwt',
  '/dfir/privacy',
  '/dfir/zero-trust-ai-agents',

  // ── DFIR: dark web workbench (2) — 0 API calls ────────────────
  '/dfir/pgp-tool',
  '/dfir/tor-gateway',

  // ── DFIR: investigator workbenches (6) — 0 API calls ──────────
  '/dfir/domain-investigator',
  '/dfir/ioc-investigate',
  '/dfir/username-investigator',
  '/dfir/yara-workbench',
  '/dfir/stix-workbench',
  '/dfir/malware-analyzer',

  // ── DFIR: specialist tools (8) — 0 API calls ──────────────────
  '/dfir/attack-navigator',
  '/dfir/mitre-matrix',
  '/dfir/vuln-toolkit',
  '/dfir/sec-headers-live',
  '/dfir/email-deliverability',
  '/dfir/ioc-lifecycle',
  '/dfir/osint-mapper',
  '/dfir/multi-search',
  '/dfir/notebooks',

  // ── DFIR: triage & forensic tools (5) — 0 API calls ───────────
  '/dfir/dnscope',
  '/dfir/regscope',
  '/dfir/tracer',
  '/dfir/tracerules',
  '/dfir/phone-osint',
  '/dfir/phone-intel',
  '/dfir/weather-osint',
  '/dfir/infostealer-intel',

  // ── DFIR: AI agent tools (4) — 0 API calls ────────────────────
  '/dfir/agent',
  '/dfir/agent-enrich',
  '/dfir/attmap-ai',
  '/dfir/x-verdikt',

  // ── DFIR: tools that fetch /api/v1/* on mount (33) ────────────
  // Prerendered chrome + loading state, then client hydrates.
  '/dfir/ioc-check',
  '/dfir/phishing',
  '/dfir/domain',
  '/dfir/domain-rep',
  '/dfir/full-spectrum',
  '/dfir/exposure',
  '/dfir/exposed-host',
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
  '/dfir/email-osnit',
  '/dfir/crypto-trace',

  // ── Static threatintel catalogs (11) — 0 API calls ────────────
  '/threatintel/mitre',
  '/threatintel/actor-kb',
  '/threatintel/actor-dna',
  '/threatintel/campaign-lifecycle',
  '/threatintel/attribution',
  '/threatintel/intelligence-gaps',
  '/threatintel/cross-campaign',
  '/threatintel/most-wanted',
  '/threatintel/apt-tracker',
  '/threatintel/extremists',
  '/threatintel/predators',
  '/threatintel/rules',
  // '/threatintel/briefings' removed from prerender: list is data-driven
  // (fetches /api/v1/briefings/list on mount). Prerendering the empty
  // initial state causes a React 18 hydration mismatch that leaves the
  // stale SSR'd list visible. Same root cause as the detail-page fix in
  // worker/router.ts (DYNAMIC_ROUTE_FALLBACKS).

  // ── ThreatIntel pages (4) — 0 API calls ───────────────────────
  '/threatintel/about',
  '/threatintel/external-resources',
  '/threatintel/threatsignal',
  '/threatintel/bitwire-blocklist',
  '/threatintel/owasp-ai-landscape',
  '/threatintel/curated-toolbox',
  '/threatintel/redhunt-labs',
  '/threatintel/redhunt-insights',
  '/threatintel/ai-report',
  '/threatintel/mcp-search',
  '/threatintel/live-center',
  '/threatintel/telegram',
  '/threatintel/telegram-monitor',
  '/threatintel/source-health',
  '/threatintel/soc-dashboard',
  '/threatintel/cyberpulse',
  '/threatintel/telegram-iocs',
  '/threatintel/malware/supply-chain',

  // ── ThreatIntel: static catalogs (5) — 0 API calls ────────────
  '/threatintel/awesome-lists',
  '/threatintel/secops-tools',
  '/threatintel/cve-resources',
  '/threatintel/osint-framework',

  // ── H3AD-SEC AI tools (5) — make API calls, prerendered chrome ─
  '/dfir/insight-ai',
  '/dfir/querycraft-ai',
  '/dfir/chrono-ai',
  '/dfir/malbrief-ai',
  '/dfir/verdikt-ai',

  // ── H3AD-SEC hunting / detection / ops (5) — prerendered chrome ─
  '/dfir/pivex',
  '/dfir/tracepulse',
  '/dfir/quicktrace',
  '/dfir/phishops',
  '/dfir/phishbook',

  // ── ThreatIntel: live-feed surfaces (38) — prerendered chrome ─
  // Client hydrates and fetches /api/v1/* on mount.
  '/threatintel/pulse',
  '/threatintel/ransomware-map',
  '/threatintel/certstream',
  '/threatintel/campaign-generator',
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
  '/threatintel/soc-ransomware',
  '/threatintel/soc-vulns',
  '/threatintel/soc-iocs',
  '/threatintel/correlation',
  '/threatintel/actor-timeline',
  '/threatintel/re-leaks',
  '/threatintel/c2-tracker',
  '/threatintel/signal',
  '/threatintel/research',
  '/threatintel/cve-list',
  '/threatintel/threat-map',
  '/threatintel/facilities',
  '/threatintel/deepdarkcti',
  '/threatintel/ransomware-live',
  '/threatintel/ransomwhere',
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
  '/threatintel/copilot-chat',
  '/threatintel/observe',
  '/threatintel/watches',
  '/threatintel/workspaces',
  // Live-feed surfaces that were already prerendered
  '/threatintel/threat-feeds',
  '/threatintel/writeups',
  '/threatintel/cyber-crime',
  '/threatintel/ransomware-activity',
  '/threatintel/live-iocs',
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
  '/dfir/report-parser',
  '/dfir/report-composer',
  '/dfir/report-analyzer',
  '/dfir/threat-hunt',

  // ── Phase 5: New gap features ─────────────────────────────────
  '/dfir/export-hub',

  // ── ThreatIntel: real pages, not redirects (28) ──────────────
  '/threatintel/ach',
  '/threatintel/actor-usernames',
  '/threatintel/aggregated-feeds',
  '/threatintel/predictions',
  '/threatintel/analyze',
  '/threatintel/atlas',
  '/threatintel/collection-slo',
  '/threatintel/cross-correlate',
  '/threatintel/crypto-scams',
  '/threatintel/darkweb-tools',
  '/threatintel/entity-resolution',
  '/threatintel/feed-catalog',
  '/threatintel/feed-scheduler',
  '/threatintel/f3ead',
  '/threatintel/insider-threat-matrix',
  '/threatintel/intel-dashboard',
  '/threatintel/investigations',
  '/threatintel/malware-iocs',
  '/threatintel/malware-vault',
  '/threatintel/observable-db',
  '/threatintel/phishing-wordlists',
  '/threatintel/pir-dashboard',
  '/threatintel/threat-actor-db',
  '/threatintel/cti-dashboard',
  '/threatintel/ti-dashboard',
  '/threatintel/projectdiscovery',
  '/threatintel/ransom-report',
  '/threatintel/relationship-graph',
  '/threatintel/source-reliability',
  '/threatintel/telegram-leaks',
  '/threatintel/telegram-leaks/channels',
  '/threatintel/telegram-leaks/stats',
  '/threatintel/yara',
  '/threatintel/llm-threat-atlas',
  '/threatintel/osint-map',
  '/threatintel/osint-cli-tools',
  '/threatintel/reports',
  '/threatintel/stix-bundles',
  '/threatintel/ioc-feeds',
  '/threatintel/malware-sandbox',
  '/threatintel/threat-actor-catalog',
  '/threatintel/threat-landscape',
  '/dfir/copilot',
  '/dfir/orkl',
  '/dfir/wifi-investigation',

  // ── ThreatIntel: hub pages (11) — Suspense-wrapped tabs, prerendered chrome ─
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
