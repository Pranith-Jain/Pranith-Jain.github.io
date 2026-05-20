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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
  // Portfolio (5)
  '/',
  '/about',
  '/skills',
  '/experience',
  '/projects',
  // Landings (2)
  '/dfir',
  '/threatintel',
  // Static catalogs / education (8)
  '/threatintel/wiki',
  '/threatintel/awesome-lists',
  '/threatintel/secops-tools',
  '/threatintel/cve-resources',
  '/threatintel/osint-framework',
  '/dfir/diamond',
  '/dfir/owasp',
  '/dfir/lolbins',
  // Frameworks / training (5)
  '/dfir/kill-chain',
  '/dfir/tabletop',
  '/dfir/grc',
  '/dfir/data-classification',
  '/dfir/privacy-hub',
  // Live-feed surfaces (5) — prerendered chrome + loading state, then
  // client hydrates and fetches /api/v1/* on mount.
  '/threatintel/threat-feeds',
  '/threatintel/writeups',
  '/threatintel/cyber-crime',
  '/threatintel/ransomware-activity',
  '/threatintel/live-iocs',
  '/threatintel/detections',
];

const SHELL_PATH = resolve(ROOT, 'dist/index.html');
const SERVER_BUNDLE = resolve(ROOT, '.ssr-build/entry-server.js');

async function main() {
  if (!existsSync(SHELL_PATH)) {
    console.error(`prerender: missing ${SHELL_PATH} — run \`vite build\` first.`);
    process.exit(1);
  }
  if (!existsSync(SERVER_BUNDLE)) {
    console.error(
      `prerender: missing ${SERVER_BUNDLE} — run \`vite build --ssr src/entry-server.tsx\` first.`,
    );
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
  for (const route of ROUTES) {
    try {
      // render() is async since Phase 3 — we use renderToReadableStream
      // so React awaits every Suspense boundary (lazy routes, lazy data).
      const { html: appHtml } = await render(route);
      const finalHtml = shell.replace(/<div id="root"><\/div>/, `<div id="root">${appHtml}</div>`);
      if (finalHtml === shell) {
        throw new Error('prerender: shell did not contain <div id="root"></div> placeholder');
      }
      // Route '/' becomes 'home'; other routes have slashes replaced with
      // double-underscore so we don't accidentally create nested folders.
      const slug = route === '/' ? 'home' : route.slice(1).replace(/\//g, '__');
      const outFile = resolve(prerenderDir, `${slug}.html`);
      await writeFile(outFile, finalHtml, 'utf8');
      manifest.push({ route, file: `__prerendered/${slug}.html` });
      const sizeKB = (finalHtml.length / 1024).toFixed(1);
      console.log(`  ✓ ${route.padEnd(30)} → __prerendered/${slug}.html  (${sizeKB} KB)`);
      okCount++;
    } catch (err) {
      console.error(`  ✗ ${route}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Manifest tells the Worker which routes have prerendered HTML available.
  await writeFile(
    resolve(prerenderDir, 'manifest.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), routes: manifest }, null, 2),
    'utf8',
  );

  console.log(`\nprerender: ${okCount}/${ROUTES.length} routes rendered → dist/__prerendered/`);
  if (okCount === 0) process.exit(1);
}

void main();
