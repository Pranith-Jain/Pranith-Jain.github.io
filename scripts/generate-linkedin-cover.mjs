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

// Right-side motif: a wireframe globe with threat arcs springing off it —
// the GlobalPulse view, distilled. Brand-blue wireframe, one rose accent arc.
const BRAND = '#6d8bf7';
const FAINT = '#46588f';
const ROSE = '#fb7185';
const G = { cx: 1332, cy: 184, r: 116 };

function globe() {
  const { cx, cy, r } = G;
  // latitude parallels — horizontal ellipses flattened for perspective
  const lats = [-94, -52, 0, 52, 94]
    .map((dy) => {
      const rx = Math.sqrt(Math.max(r * r - dy * dy, 1));
      const ry = Math.max(rx * 0.2, 3);
      const op = dy === 0 ? 0.22 : 0.13;
      return `<ellipse cx="${cx}" cy="${cy + dy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${FAINT}" stroke-opacity="${op}" stroke-width="1.2"/>`;
    })
    .join('\n  ');
  // longitude meridians — vertical ellipses + the central pole line
  const lons =
    [r, r * 0.56, r * 0.2]
      .map(
        (rx) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${r}" fill="none" stroke="${FAINT}" stroke-opacity="0.13" stroke-width="1.2"/>`
      )
      .join('\n  ') +
    `\n  <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${FAINT}" stroke-opacity="0.13" stroke-width="1.2"/>`;
  const outline = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND}" stroke-opacity="0.32" stroke-width="1.6"/>`;
  const haze = `<circle cx="${cx}" cy="${cy}" r="${r * 1.25}" fill="url(#node)" opacity="0.45"/>`;
  // threat arcs: surface origin → external target, lofted via a quadratic ctrl
  const arcs = [
    { sx: cx + 64, sy: cy - 80, ex: 1512, ey: 64, c: BRAND, loft: 70 },
    { sx: cx + 96, sy: cy + 28, ex: 1524, ey: 244, c: BRAND, loft: 54 },
    { sx: cx + 18, sy: cy - 104, ex: 1452, ey: 30, c: ROSE, loft: 64 },
    { sx: cx - 70, sy: cy + 82, ex: 1232, ey: 330, c: FAINT, loft: 46 },
  ]
    .map((a) => {
      const mx = (a.sx + a.ex) / 2;
      const my = (a.sy + a.ey) / 2 - a.loft;
      const bright = a.c !== FAINT;
      const halo = bright ? `<circle cx="${a.ex}" cy="${a.ey}" r="15" fill="url(#node)" opacity="0.6"/>` : '';
      return `<path d="M ${a.sx} ${a.sy} Q ${mx.toFixed(0)} ${my.toFixed(0)} ${a.ex} ${a.ey}" fill="none" stroke="${a.c}" stroke-opacity="${bright ? 0.72 : 0.4}" stroke-width="1.6"/>
  ${halo}
  <circle cx="${a.sx}" cy="${a.sy}" r="2.6" fill="${a.c}"/>
  <circle cx="${a.ex}" cy="${a.ey}" r="${a.c === ROSE ? 5 : 4.5}" fill="${a.c}"/>`;
    })
    .join('\n  ');
  return `
  ${haze}
  ${lats}
  ${lons}
  ${outline}
  ${arcs}`;
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

  ${globe()}

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
