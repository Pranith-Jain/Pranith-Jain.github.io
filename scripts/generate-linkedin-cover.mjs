#!/usr/bin/env node
/**
 * LinkedIn personal banner (1584×396) on the navy brand. Identity-forward,
 * no metrics: PJ mark + name + role + tagline on the left, and a right-side
 * motif chosen from several designs. Same DNA as the OG cards (navy gradient,
 * faint grid, top-right glow, left accent bar, Hanken Grotesk via resvg-wasm).
 * Bottom-left is kept clear for the profile-photo overlap.
 *
 *   node scripts/generate-linkedin-cover.mjs            → default (globe)
 *   node scripts/generate-linkedin-cover.mjs <motif>    → one motif
 *   node scripts/generate-linkedin-cover.mjs --variants → all, to -<motif>.png
 *
 * motifs: globe | graph | radar | circuit
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1584;
const H = 396;
const BRAND = '#6d8bf7';
const FAINT = '#46588f';
const ROSE = '#fb7185';
const CX = 1334; // motif center
const CY = 184;

/* ── Motif: wireframe globe + threat arcs ─────────────────────────── */
function globe() {
  const cx = CX;
  const cy = CY;
  const r = 116;
  const lats = [-94, -52, 0, 52, 94]
    .map((dy) => {
      const rx = Math.sqrt(Math.max(r * r - dy * dy, 1));
      const ry = Math.max(rx * 0.2, 3);
      return `<ellipse cx="${cx}" cy="${cy + dy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${FAINT}" stroke-opacity="${dy === 0 ? 0.22 : 0.13}" stroke-width="1.2"/>`;
    })
    .join('\n  ');
  const lons =
    [r, r * 0.56, r * 0.2]
      .map((rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${r}" fill="none" stroke="${FAINT}" stroke-opacity="0.13" stroke-width="1.2"/>`)
      .join('\n  ') +
    `\n  <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${FAINT}" stroke-opacity="0.13" stroke-width="1.2"/>`;
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
  <circle cx="${cx}" cy="${cy}" r="${r * 1.25}" fill="url(#node)" opacity="0.45"/>
  ${lats}
  ${lons}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND}" stroke-opacity="0.32" stroke-width="1.6"/>
  ${arcs}`;
}

/* ── Motif: relationship / knowledge graph (hub → tiers) ──────────── */
function graph() {
  const cx = CX;
  const cy = CY;
  const hub = { x: cx, y: cy };
  const inner = [
    { x: cx - 96, y: cy - 64 },
    { x: cx + 98, y: cy - 50 },
    { x: cx - 40, y: cy + 88 },
  ];
  const outer = [
    { x: 1172, y: 70, c: FAINT },
    { x: 1176, y: 184, c: BRAND },
    { x: 1224, y: 318, c: ROSE },
    { x: 1402, y: 306, c: FAINT },
    { x: 1524, y: 210, c: FAINT },
    { x: 1502, y: 84, c: FAINT },
    { x: 1470, y: 252, c: BRAND },
  ];
  const E = [
    [hub, inner[0]], [hub, inner[1]], [hub, inner[2]],
    [inner[0], outer[0]], [inner[0], outer[1]], [inner[0], outer[2]],
    [inner[1], outer[5]], [inner[1], outer[4]], [inner[1], outer[6]],
    [inner[2], outer[2]], [inner[2], outer[3]], [inner[1], hub],
  ];
  const edges = E.map(([a, b]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${FAINT}" stroke-opacity="0.4" stroke-width="1.3"/>`).join('\n  ');
  const halo = (n, k) => `<circle cx="${n.x}" cy="${n.y}" r="${k}" fill="url(#node)" opacity="0.6"/>`;
  const halos = [halo(hub, 28), ...inner.map((n) => halo(n, 18)), ...outer.filter((o) => o.c !== FAINT).map((o) => halo(o, 16))].join('\n  ');
  const dots =
    `<circle cx="${hub.x}" cy="${hub.y}" r="8" fill="${BRAND}"/>` +
    inner.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="5.5" fill="${BRAND}"/>`).join('') +
    outer.map((o) => `<circle cx="${o.x}" cy="${o.y}" r="${o.c === ROSE ? 5 : 4.5}" fill="${o.c}"/>`).join('');
  return `
  ${edges}
  ${halos}
  ${dots}`;
}

/* ── Motif: radar sweep + blips ───────────────────────────────────── */
function radar() {
  const cx = CX;
  const cy = CY;
  const rings = [54, 106, 158].map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND}" stroke-opacity="${0.18 - r / 1400}" stroke-width="1.3"/>`).join('\n  ');
  const cross = `<line x1="${cx - 158}" y1="${cy}" x2="${cx + 158}" y2="${cy}" stroke="${FAINT}" stroke-opacity="0.12" stroke-width="1"/>
  <line x1="${cx}" y1="${cy - 158}" x2="${cx}" y2="${cy + 158}" stroke="${FAINT}" stroke-opacity="0.12" stroke-width="1"/>`;
  // sweep wedge (−18° … +30°) filled with a fading gradient
  const a1 = (-18 * Math.PI) / 180;
  const a2 = (30 * Math.PI) / 180;
  const R = 158;
  const sweep = `<path d="M ${cx} ${cy} L ${(cx + R * Math.cos(a1)).toFixed(0)} ${(cy + R * Math.sin(a1)).toFixed(0)} A ${R} ${R} 0 0 1 ${(cx + R * Math.cos(a2)).toFixed(0)} ${(cy + R * Math.sin(a2)).toFixed(0)} Z" fill="url(#sweep)"/>
  <line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(a2)).toFixed(0)}" y2="${(cy + R * Math.sin(a2)).toFixed(0)}" stroke="${BRAND}" stroke-opacity="0.5" stroke-width="1.4"/>`;
  const blips = [
    { x: cx + 64, y: cy - 40, c: BRAND, r: 5 },
    { x: cx - 70, y: cy + 22, c: FAINT, r: 4 },
    { x: cx + 30, y: cy + 96, c: BRAND, r: 4.5 },
    { x: cx + 116, y: cy + 30, c: ROSE, r: 5 },
    { x: cx - 36, y: cy - 88, c: FAINT, r: 4 },
  ]
    .map((b) => `<circle cx="${b.x}" cy="${b.y}" r="${b.r * 3.2}" fill="url(#node)" opacity="0.5"/>\n  <circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${b.c}"/>`)
    .join('\n  ');
  return `
  ${rings}
  ${cross}
  ${sweep}
  <circle cx="${cx}" cy="${cy}" r="4" fill="${BRAND}"/>
  ${blips}`;
}

/* ── Motif: circuit traces + pads (PCB) ───────────────────────────── */
function circuit() {
  // orthogonal/diagonal traces with pads + vias, brand on navy, one rose pad
  const traces = [
    'M 1150 96 H 1280 L 1320 136 H 1430',
    'M 1150 196 H 1248 L 1288 156',
    'M 1180 286 H 1300 L 1340 246 H 1470 L 1510 206',
    'M 1430 76 V 150 H 1520',
    'M 1320 136 V 246',
    'M 1470 252 H 1540',
  ]
    .map((d) => `<path d="${d}" fill="none" stroke="${BRAND}" stroke-opacity="0.34" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join('\n  ');
  const pads = [
    { x: 1150, y: 96, c: BRAND },
    { x: 1430, y: 136, c: BRAND },
    { x: 1150, y: 196, c: FAINT },
    { x: 1180, y: 286, c: FAINT },
    { x: 1510, y: 206, c: BRAND },
    { x: 1430, y: 76, c: ROSE },
    { x: 1520, y: 150, c: FAINT },
    { x: 1320, y: 246, c: FAINT },
    { x: 1540, y: 252, c: FAINT },
  ]
    .map((p) => {
      const bright = p.c !== FAINT;
      const halo = bright ? `<circle cx="${p.x}" cy="${p.y}" r="13" fill="url(#node)" opacity="0.55"/>` : '';
      return `${halo}<rect x="${p.x - 4}" y="${p.y - 4}" width="8" height="8" rx="2" fill="${p.c}"/>`;
    })
    .join('\n  ');
  // small via dots along traces
  const vias = [[1288, 156], [1340, 246], [1280, 96], [1300, 286], [1470, 252]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${FAINT}"/>`)
    .join('\n  ');
  return `
  ${traces}
  ${vias}
  ${pads}`;
}

const MOTIFS = { globe, graph, radar, circuit };

function cover(motifSvg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
    <radialGradient id="sweep" cx="0%" cy="50%" r="100%">
      <stop offset="0%" stop-color="#6d8bf7" stop-opacity="0.34"/><stop offset="100%" stop-color="#6d8bf7" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#6d8bf7" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="6" height="${H}" fill="url(#bar)"/>

  ${motifSvg}

  <rect x="100" y="110" width="66" height="66" rx="15" fill="url(#pj)"/>
  <text x="133" y="154" text-anchor="middle" font-size="30" font-weight="800" fill="#ffffff">PJ</text>

  <text x="186" y="146" font-size="52" font-weight="800" letter-spacing="-0.5" fill="#ffffff">Pranith Jain</text>
  <text x="188" y="178" font-size="17" font-weight="700" letter-spacing="2.8" fill="#a1b6fb">CERTIFIED CYBER CRIMINOLOGIST · OSINT · THREAT INTEL · AI SECURITY</text>

  <text x="100" y="262" font-size="29" font-weight="400" fill="#dbe3f4">Edge-native security tooling &amp; a live threat-intelligence platform,</text>
  <text x="100" y="300" font-size="29" font-weight="400" fill="#94a3b8">built at the intersection of <tspan fill="#a1b6fb" font-weight="600">AI, OSINT &amp; detection</tspan>.</text>

  <text x="206" y="356" font-size="15" font-weight="700" letter-spacing="2.5" fill="#5b6b8f"><tspan fill="#a1b6fb">pranithjain.qzz.io</tspan>   ·   CRUCIBLE   ·   PANOPTICON   ·   SCOUT   ·   ARGUS</text>
</svg>`;
}

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers = [readFileSync(join(root, 'public/og/hanken-700.ttf')), readFileSync(join(root, 'public/og/hanken-400.ttf'))];

function render(svg) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true },
    background: '#070b1c',
  })
    .render()
    .asPng();
}

const arg = process.argv[2];
if (arg === '--variants') {
  for (const [name, fn] of Object.entries(MOTIFS)) {
    const png = render(cover(fn()));
    writeFileSync(join(root, `public/linkedin-cover-${name}.png`), png);
    console.log(`✓ linkedin-cover-${name}.png (${(png.length / 1024).toFixed(1)} KB)`);
  }
} else {
  const name = MOTIFS[arg] ? arg : 'circuit';
  const svg = cover(MOTIFS[name]());
  writeFileSync(join(root, 'public/linkedin-cover.svg'), svg);
  writeFileSync(join(root, 'public/linkedin-cover.png'), render(svg));
  console.log(`✓ linkedin-cover.png · motif=${name} · ${W}×${H}`);
}
