#!/usr/bin/env node
/**
 * Pre-render EVERY route's OG card PNG at build time into dist/og/pages/.
 *
 * WHY: page cards were previously rasterized on-demand inside the Worker
 * (/api/v1/og-image/page/<dot>.png). That pipeline works when curled, but X's
 * crawler kept failing the image fetch and caching the failure per-URL for
 * days — every share rendered the image-less fallback chip. Static build-time
 * assets remove every runtime variable (Worker CPU limits, resvg cold-starts,
 * caches.default per-colo misses, auth edge cases): the cards become plain
 * files on Cloudflare's asset CDN — the most crawler-proof delivery there is.
 *
 * Sources of truth per route:
 *   - Route list:  all dist HTML files written by scripts/prerender.mjs
 *   - Title/desc:  extracted from the prerendered HTML itself (<title> +
 *                  <meta name=description>) — byte-identical to what a
 *                  crawler would read at runtime.
 *   - Visuals:     same flat-design card as worker/og-image.ts (dark slate,
 *                  accent discs + scan rings, left bar, section badge,
 *                  Hanken Grotesk).
 *
 * Branded surfaces ('/', '/dfir', '/threatintel', '/radar', '/threatnexus')
 * are skipped — they already ship hand-tuned static cards
 * (scripts/generate-og-png.mjs → public/og-*.png).
 *
 * Run: node scripts/generate-page-og.mjs   (wired into `npm run build`
 * after prerender so dist/ contains both the HTML and these PNGs)
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
// Written OUTSIDE dist/ on purpose: 261 extra PNGs would push the deploy
// past the Workers free plan's 20,000 static-asset file limit. Instead the
// script drops them in .og-cache/ and scripts/upload-page-og.mjs uploads
// each to KV_CACHE (key: ogpage:v1:<dot>.png) — the runtime handler reads
// KV first, so serving costs one KV read, not a wasm rasterization.
const OUT_DIR = join(root, '.og-cache', 'pages');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Branded surfaces already have hand-tuned static cards (public/og-*.png).
const SKIP_ROUTES = new Set(['/', '/dfir', '/threatintel', '/radar', '/threatnexus']);

// Section badge/product mapping — mirrors ogMetaForPath in worker/og-rewriter.ts.
function sectionFor(first) {
  if (first === 'dfir') return { badge: 'DFIR TOOLKIT', product: 'CRUCIBLE' };
  if (first === 'threatintel') return { badge: 'THREAT INTEL', product: 'PANOPTICON' };
  if (first === 'radar') return { badge: 'RECON SCANNER', product: 'SCOUT' };
  if (first === 'blog') return { badge: 'BLOG POST', product: 'CRUCIBLE' };
  return { badge: 'SECURITY TOOLS', product: 'CRUCIBLE' };
}

function deriveTitleFromRoute(route) {
  const segs = route.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  return segs.length === 0
    ? 'Pranith Jain'
    : last
        .split(/[-_]/)
        .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
}

/** Collect routes from prerendered HTML: dist/__prerendered/<seg>__<seg>.html */
function collectRoutes() {
  const routes = [];
  const prDir = join(DIST, '__prerendered');
  if (!existsSync(prDir)) return routes;
  for (const entry of readdirSync(prDir)) {
    if (!entry.endsWith('.html')) continue;
    const base = entry.replace(/\.html$/, '');
    if (!base.includes('__')) continue; // flat legacy files, not prerendered routes
    const route = '/' + base.split('__').join('/');
    routes.push(route);
  }
  return routes;
}

/** Extract <title> + meta description from prerendered HTML (crawler view). */
function extractMeta(html, route) {
  const t = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const d = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1]?.trim();
  return {
    title: t || deriveTitleFromRoute(route),
    description: d || `${deriveTitleFromRoute(route)} — pranithjain.qzz.io`,
  };
}

function wrapTitle(title, max) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur.trim());
      cur = w;
    } else cur = (cur + ' ' + w).trim();
    if (lines.length === 3) break;
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines.slice(0, 3);
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function buildSvg(route, title, description) {
  const WIDTH = 1200;
  const HEIGHT = 630;
  const accent = { primary: '#2c3ee5', secondary: '#435ef1', badge: '#1e3aaf' };
  const first = route.split('/').filter(Boolean)[0] ?? '';
  const { badge, product } = sectionFor(first);

  const titleLines = wrapTitle(truncate(title, 80), 38);
  const titleY = titleLines.length === 1 ? 280 : titleLines.length === 2 ? 250 : 230;
  const titleTspans = titleLines
    .map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 68}">${esc(line)}</tspan>`)
    .join('\n          ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0b1120"/>
  <circle cx="990" cy="180" r="300" fill="${accent.primary}" opacity="0.10"/>
  <g stroke="${accent.secondary}" fill="none">
    <circle cx="1010" cy="300" r="110" stroke-opacity="0.20" stroke-width="1.5"/>
    <circle cx="1010" cy="300" r="185" stroke-opacity="0.12" stroke-width="1.5"/>
  </g>
  <circle cx="1010" cy="300" r="6" fill="${accent.secondary}"/>
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="${accent.primary}"/>
  <rect x="80" y="140" rx="4" ry="4" width="${badge.length * 13.5 + 24}" height="36" fill="${accent.badge}"/>
  <text x="92" y="165" fill="white" font-family="'SF Mono', 'Fira Code', monospace" font-size="16" font-weight="700" letter-spacing="2">${esc(badge)}</text>
  <text x="80" y="${titleY}" fill="white" font-family="'Hanken Grotesk', 'Inter', system-ui, sans-serif" font-size="56" font-weight="800">
    ${titleTspans}
  </text>
  <text fill="#94a3b8" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="24" font-weight="400">
    <tspan x="80" y="${titleY + titleLines.length * 68 + 30}">${esc(truncate(description, 90))}</tspan>
  </text>
  <rect x="0" y="580" width="${WIDTH}" height="50" fill="#070b1c" opacity="0.6"/>
  <line x1="0" y1="580" x2="${WIDTH}" y2="580" stroke="${accent.primary}" stroke-opacity="0.3" stroke-width="1"/>
  <text x="80" y="612" fill="#64748b" font-family="'SF Mono', 'Fira Code', monospace" font-size="16" font-weight="500">pranithjain.qzz.io</text>
  <rect x="1060" y="588" rx="6" ry="6" width="36" height="36" fill="${accent.primary}"/>
  <text x="1078" y="614" text-anchor="middle" fill="white" font-family="'Inter', system-ui, sans-serif" font-size="16" font-weight="800">PJ</text>
  <text x="1108" y="612" fill="#64748b" font-family="'SF Mono', 'Fira Code', monospace" font-size="14" font-weight="500">${esc(product)}</text>
</svg>`;
}

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers = [
  readFileSync(join(root, 'public/og/hanken-700.ttf')),
  readFileSync(join(root, 'public/og/hanken-400.ttf')),
];

mkdirSync(OUT_DIR, { recursive: true });

const routes = collectRoutes().filter((r) => !SKIP_ROUTES.has(r));
let built = 0;
let failed = 0;

for (const route of routes) {
  try {
    const base = route.slice(1).split('/').join('__');
    const htmlPath = join(DIST, '__prerendered', `${base}.html`);
    if (!existsSync(htmlPath)) continue;
    const html = readFileSync(htmlPath, 'utf8');
    const { title, description } = extractMeta(html, route);

    const dotId = route.replace(/^\/+/, '').replace(/\//g, '.');
    const svg = buildSvg(route, title, description);
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true },
      background: '#0b1120',
    });
    const png = resvg.render().asPng();
    writeFileSync(join(OUT_DIR, `${dotId}.png`), png);
    built += 1;
  } catch (e) {
    failed += 1;
    console.warn(`  ⚠ ${route}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`  page-og -> ${built} cards (${failed} failed) in .og-cache/pages/ -> KV ogpage:v1:* (best-effort)`);
