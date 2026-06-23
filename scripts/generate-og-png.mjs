#!/usr/bin/env node
/**
 * Generate the social OG cards (1200×630) for the branded surfaces. The worker
 * swaps the og:image / twitter:image meta per route (worker/og-rewriter.ts):
 *
 *   /            → public/og-image.png        (home · brand indigo)
 *   /dfir        → public/og-dfir.png         (CRUCIBLE · brand indigo)
 *   /threatintel → public/og-threatintel.png  (PANOPTICON · rose)
 *   /radar       → public/og-scout.png        (SCOUT · sky)
 *   /threatnexus → public/og-argus.png        (ARGUS · brand indigo)
 *
 * Cards are built from config here (no hand-edited SVG sources) so they stay
 * consistent with the LinkedIn cover (docs/linkedin-cover-*) and the live OG
 * raster pipeline: same dark slate gradient, grid, glow, left accent bar,
 * scan-ring motif, and the brand Hanken Grotesk font embedded via resvg-wasm.
 *
 * Run: node scripts/generate-og-png.mjs
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CARDS = [
  {
    slug: 'og-image',
    label: 'home',
    accent: '#2c3ee5', accent2: '#5a78f2', accentText: '#a1b6fb',
    eyebrow: 'SECURITY TOOLS · THREAT INTEL · DFIR',
    headline: ['Browser-side DFIR tooling &', 'a live threat-intel platform'],
    accentFrom: 1,
    features: '90+ DFIR tools · 100+ threat intel feeds · no signup',
    stats: [['90+', 'tools'], ['100+', 'feeds'], ['free', 'no signup']],
    footer: 'pranithjain.qzz.io  ·  CRUCIBLE  ·  PANOPTICON',
  },
  {
    slug: 'og-dfir',
    label: 'CRUCIBLE (/dfir)',
    accent: '#2c3ee5', accent2: '#5a78f2', accentText: '#a1b6fb',
    eyebrow: 'CRUCIBLE · DFIR TOOLKIT',
    headline: ['90+ DFIR tools that run', 'entirely in your browser'],
    accentFrom: 1,
    features: 'IOC checker · phishing analysis · CVE triage · rule conversion',
    stats: [['90+', 'tools'], ['11', 'categories'], ['100%', 'client-side']],
    footer: 'pranithjain.qzz.io/dfir  ·  no data leaves your machine',
  },
  {
    slug: 'og-threatintel',
    label: 'PANOPTICON (/threatintel)',
    accent: '#2c3ee5', accent2: '#5a78f2', accentText: '#a1b6fb',
    eyebrow: 'PANOPTICON · THREAT INTEL PLATFORM',
    headline: ['Live intelligence from', '100+ public feeds'],
    accentFrom: 1,
    features: 'Ransomware leaks · CVEs · dark web · actor tracking',
    stats: [['100+', 'feeds'], ['18', 'correlated'], ['free', 'no login']],
    footer: 'pranithjain.qzz.io/threatintel  ·  edge-hosted',
  },
  {
    slug: 'og-scout',
    label: 'SCOUT (/radar)',
    accent: '#0ea5e9', accent2: '#38bdf8', accentText: '#bae6fd',
    eyebrow: 'SCOUT · RECON SCANNER',
    headline: ['Deep crawl, JS analysis,', 'secret detection & scoring'],
    accentFrom: 1,
    features: 'Multi-page crawl · API discovery · domain enumeration',
    stats: [['30+', 'checks'], ['50-page', 'crawl'], ['free', 'edge-hosted']],
    footer: 'pranithjain.qzz.io/radar  ·  no signup',
  },
  {
    slug: 'og-argus',
    label: 'ARGUS (/threatnexus)',
    accent: '#2c3ee5', accent2: '#5a78f2', accentText: '#a1b6fb',
    eyebrow: 'ARGUS · THREAT NEXUS',
    headline: ['Nation-state threat intel', 'with 3D globe visualization'],
    accentFrom: 1,
    features: 'Actor dossiers · relationship graphs · live feeds',
    stats: [['6', 'views'], ['APT', 'data'], ['interactive', 'visual']],
    footer: 'pranithjain.qzz.io/threatnexus  ·  standalone',
  },
];

function buildSvg(c) {
  const lh = c.headline.length >= 3 ? 62 : 70;
  const hSize = c.headline.length >= 3 ? 50 : 58;
  const y0 = c.headline.length >= 3 ? 268 : 286;
  const headline = c.headline
    .map((line, i) => {
      const fill = i >= c.accentFrom ? c.accentText : '#ffffff';
      return `<text x="80" y="${y0 + i * lh}" font-size="${hSize}" font-weight="800" letter-spacing="0.3" fill="${fill}">${esc(line)}</text>`;
    })
    .join('\n  ');
  const stats = c.stats
    .map(([num, lbl], i) => {
      const x = 80 + i * 250;
      return `<text x="${x}" y="528" font-size="42" font-weight="800" fill="${c.accentText}">${esc(num)}</text>
  <text x="${x}" y="556" font-size="15" font-weight="600" letter-spacing="2" fill="#94a3b8">${esc(lbl.toUpperCase())}</text>`;
    })
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="'Hanken Grotesk', system-ui, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070b1c"/><stop offset="50%" stop-color="#1c2538"/><stop offset="100%" stop-color="#070b1c"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="16%" r="60%">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.32"/><stop offset="55%" stop-color="${c.accent}" stop-opacity="0.07"/><stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.accent2}"/><stop offset="100%" stop-color="${c.accent}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="${c.accent2}" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- scan-ring motif (right) -->
  <g stroke="${c.accent2}" fill="none">
    <circle cx="1030" cy="300" r="74" stroke-opacity="0.16" stroke-width="1.5"/>
    <circle cx="1030" cy="300" r="130" stroke-opacity="0.10" stroke-width="1.5"/>
    <circle cx="1030" cy="300" r="188" stroke-opacity="0.05" stroke-width="1.5"/>
  </g>
  <circle cx="1030" cy="300" r="5" fill="${c.accent2}"/>
  <circle cx="1095" cy="252" r="4" fill="#fbbf24"/>
  <circle cx="962" cy="356" r="4" fill="#38bdf8"/>

  <rect x="0" y="0" width="8" height="630" fill="url(#bar)"/>

  <!-- header: brand mark + name -->
  <rect x="80" y="64" width="56" height="56" rx="13" fill="${c.accent}"/>
  <text x="108" y="102" text-anchor="middle" font-size="24" font-weight="800" fill="#ffffff">PJ</text>
  <text x="152" y="92" font-size="27" font-weight="800" letter-spacing="0.5" fill="#ffffff">pranithjain.qzz.io</text>
  <text x="153" y="116" font-size="13" font-weight="700" letter-spacing="3" fill="${c.accentText}">BUILT ON CLOUDFLARE WORKERS</text>

  <!-- section eyebrow -->
  <text x="80" y="208" font-size="18" font-weight="800" letter-spacing="4" fill="${c.accentText}">${esc(c.eyebrow)}</text>

  <!-- headline -->
  ${headline}

  <!-- features -->
  <text x="80" y="${y0 + c.headline.length * lh + 22}" font-size="22" font-weight="400" fill="#cbd5e1">${esc(c.features)}</text>

  <!-- divider -->
  <rect x="80" y="486" width="120" height="4" rx="2" fill="${c.accent2}"/>

  <!-- stats -->
  ${stats}

  <!-- footer -->
  <text x="80" y="600" font-size="20" font-weight="700" letter-spacing="0.5" fill="#94a3b8"><tspan fill="${c.accentText}" font-weight="800">${esc(c.footer)}</tspan></text>
</svg>`;
}

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers = [
  readFileSync(join(root, 'public/og/hanken-700.ttf')),
  readFileSync(join(root, 'public/og/hanken-400.ttf')),
];

for (const c of CARDS) {
  const svg = buildSvg(c);
  writeFileSync(join(root, `public/${c.slug}.svg`), svg);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true },
    background: '#0b1120',
  });
  const png = resvg.render().asPng();
  writeFileSync(join(root, `public/${c.slug}.png`), png);
  console.log(`✓ ${c.slug}.png (${(png.length / 1024).toFixed(1)} KB) · ${c.label}`);
}
