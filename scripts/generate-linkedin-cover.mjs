#!/usr/bin/env node
/**
 * LinkedIn personal banner (1584×630 design, exported 1584×396) on the navy
 * brand. Identity-forward, no metrics: PJ mark + name + role + tagline on the
 * left, a hand-placed node-constellation + scan-ring motif on the right (the
 * thing the platform actually draws — relationship graphs / IOC correlation /
 * recon). Same DNA as the OG cards: navy gradient, faint grid, top-right glow,
 * left accent bar, Hanken Grotesk embedded via resvg-wasm.
 *
 * Bottom-left is kept clear for the profile-photo overlap.
 *
 * Run: node scripts/generate-linkedin-cover.mjs
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1584;
const H = 396;

// Right-side constellation. c: 'hub'|'b' bright brand, 'f' faint, 'r' rose accent.
const HUB = { x: 1300, y: 168, r: 9 };
const NODES = [
  HUB,
  { x: 1168, y: 92, r: 5, c: 'b' },
  { x: 1452, y: 104, r: 6, c: 'b' },
  { x: 1512, y: 214, r: 5, c: 'f' },
  { x: 1392, y: 292, r: 5, c: 'r' },
  { x: 1206, y: 258, r: 5, c: 'f' },
  { x: 1126, y: 182, r: 4, c: 'f' },
  { x: 1436, y: 196, r: 6, c: 'b' },
  { x: 1262, y: 86, r: 4, c: 'f' },
  { x: 1330, y: 326, r: 4, c: 'f' },
  { x: 1238, y: 158, r: 4, c: 'f' },
];
// edges by node index (0 = hub)
const EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 7], [0, 10],
  [1, 8], [1, 10], [2, 7], [2, 8], [5, 6], [5, 9], [4, 9], [3, 7], [6, 10],
];
const NODE_FILL = { hub: '#6d8bf7', b: '#6d8bf7', f: '#46588f', r: '#fb7185' };

function constellation() {
  const edges = EDGES.map(([a, b]) => {
    const p = NODES[a];
    const q = NODES[b];
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#46588f" stroke-opacity="0.38" stroke-width="1.3"/>`;
  }).join('\n  ');
  // glow halos behind the bright nodes
  const halos = NODES.filter((n) => n === HUB || n.c === 'b' || n.c === 'r')
    .map((n) => `<circle cx="${n.x}" cy="${n.y}" r="${(n.r ?? 5) * 3.4}" fill="url(#node)"/>`)
    .join('\n  ');
  const dots = NODES.map((n) => {
    const fill = NODE_FILL[n === HUB ? 'hub' : n.c] ?? '#46588f';
    return `<circle cx="${n.x}" cy="${n.y}" r="${n.r ?? 5}" fill="${fill}"/>`;
  }).join('\n  ');
  return `
  <!-- scan rings centered on the hub -->
  <g fill="none" stroke="#6d8bf7">
    <circle cx="${HUB.x}" cy="${HUB.y}" r="64" stroke-opacity="0.16" stroke-width="1.4"/>
    <circle cx="${HUB.x}" cy="${HUB.y}" r="116" stroke-opacity="0.10" stroke-width="1.4"/>
    <circle cx="${HUB.x}" cy="${HUB.y}" r="176" stroke-opacity="0.05" stroke-width="1.4"/>
  </g>
  ${edges}
  ${halos}
  ${dots}`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Hanken Grotesk', system-ui, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070b1c"/><stop offset="55%" stop-color="#0c1530"/><stop offset="100%" stop-color="#070b1c"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="26%" r="56%">
      <stop offset="0%" stop-color="#435ef1" stop-opacity="0.24"/><stop offset="55%" stop-color="#435ef1" stop-opacity="0.06"/><stop offset="100%" stop-color="#435ef1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5a78f2"/><stop offset="100%" stop-color="#2c3ee5"/>
    </linearGradient>
    <linearGradient id="pj" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2c3ee5"/><stop offset="100%" stop-color="#435ef1"/>
    </linearGradient>
    <radialGradient id="node" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6d8bf7" stop-opacity="0.55"/><stop offset="100%" stop-color="#6d8bf7" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#6d8bf7" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- left brand accent bar -->
  <rect x="0" y="0" width="6" height="${H}" fill="url(#bar)"/>

  ${constellation()}

  <!-- PJ mark -->
  <rect x="100" y="110" width="66" height="66" rx="15" fill="url(#pj)"/>
  <text x="133" y="154" text-anchor="middle" font-size="30" font-weight="800" fill="#ffffff">PJ</text>

  <!-- name + role -->
  <text x="186" y="146" font-size="52" font-weight="800" letter-spacing="-0.5" fill="#ffffff">Pranith Jain</text>
  <text x="188" y="178" font-size="17" font-weight="700" letter-spacing="2.8" fill="#a1b6fb">CERTIFIED CYBER CRIMINOLOGIST · OSINT · THREAT INTEL · AI SECURITY</text>

  <!-- tagline -->
  <text x="100" y="262" font-size="29" font-weight="400" fill="#dbe3f4">Edge-native security tooling &amp; a live threat-intelligence platform,</text>
  <text x="100" y="300" font-size="29" font-weight="400" fill="#94a3b8">built at the intersection of <tspan fill="#a1b6fb" font-weight="600">AI, OSINT &amp; detection</tspan>.</text>

  <!-- work strip (no metrics) — shifted right of x=200 so the circular
       profile-photo overlap (bottom-left ~x12–170) never hides it -->
  <text x="206" y="356" font-size="15" font-weight="700" letter-spacing="2.5" fill="#5b6b8f"><tspan fill="#a1b6fb">pranithjain.qzz.io</tspan>   ·   CRUCIBLE   ·   PANOPTICON   ·   SCOUT   ·   ARGUS</text>
</svg>`;

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers = [
  readFileSync(join(root, 'public/og/hanken-700.ttf')),
  readFileSync(join(root, 'public/og/hanken-400.ttf')),
];

writeFileSync(join(root, 'public/linkedin-cover.svg'), svg);
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true },
  background: '#070b1c',
});
const png = resvg.render().asPng();
writeFileSync(join(root, 'public/linkedin-cover.png'), png);
console.log(`✓ linkedin-cover.png (${(png.length / 1024).toFixed(1)} KB) · ${W}×${H}`);
