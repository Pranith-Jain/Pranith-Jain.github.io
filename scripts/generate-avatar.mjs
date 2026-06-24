#!/usr/bin/env node
/**
 * Square profile avatar (rendered 800×800, designed on a 400 grid) for
 * Twitter/X and other socials. A brand EMBLEM (not initials), centered and
 * corner-safe for the circular crop, on the navy brand. resvg-wasm raster.
 *
 *   node scripts/generate-avatar.mjs            → default (eye), → public/avatar.png
 *   node scripts/generate-avatar.mjs <variant>  → eye | radar | network | globe
 *   node scripts/generate-avatar.mjs --variants → all, to public/avatar-<v>.png
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = 400;
const C = S / 2;
const BRAND = '#6d8bf7';
const BRIGHT = '#9db4fb';
const FAINT = '#46588f';
const ROSE = '#fb7185';
const polar = (r, deg) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];

/* ── Eye / aperture — the all-seeing watcher (PANOPTICON) ─────────── */
function eye() {
  const lidUp = `M ${C - 140} ${C} Q ${C} ${C - 96} ${C + 140} ${C}`;
  const lidLo = `M ${C - 140} ${C} Q ${C} ${C + 96} ${C + 140} ${C}`;
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const [x1, y1] = polar(60, i * 15);
    const [x2, y2] = polar(86, i * 15);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${BRAND}" stroke-opacity="0.22" stroke-width="2"/>`;
  }).join('\n  ');
  return `
  <circle cx="${C}" cy="${C}" r="118" fill="url(#node)" opacity="0.7"/>
  <path d="${lidUp}" fill="none" stroke="${BRAND}" stroke-opacity="0.55" stroke-width="3"/>
  <path d="${lidLo}" fill="none" stroke="${BRAND}" stroke-opacity="0.55" stroke-width="3"/>
  <circle cx="${C}" cy="${C}" r="88" fill="none" stroke="${BRAND}" stroke-opacity="0.3" stroke-width="2"/>
  ${spokes}
  <circle cx="${C}" cy="${C}" r="58" fill="none" stroke="${BRIGHT}" stroke-opacity="0.6" stroke-width="2.4"/>
  <circle cx="${C}" cy="${C}" r="34" fill="#0a1430"/>
  <circle cx="${C}" cy="${C}" r="34" fill="none" stroke="${BRIGHT}" stroke-opacity="0.7" stroke-width="2"/>
  <circle cx="${C}" cy="${C}" r="13" fill="${BRAND}"/>
  <circle cx="${C - 7}" cy="${C - 7}" r="5" fill="#ffffff" fill-opacity="0.9"/>`;
}

/* ── Radar scope — recon / monitoring (SCOUT) ─────────────────────── */
function radar() {
  const rings = [44, 84, 124].map((r) => `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${BRAND}" stroke-opacity="0.22" stroke-width="2"/>`).join('\n  ');
  const cross = `<line x1="${C - 130}" y1="${C}" x2="${C + 130}" y2="${C}" stroke="${FAINT}" stroke-opacity="0.25" stroke-width="1.6"/>
  <line x1="${C}" y1="${C - 130}" x2="${C}" y2="${C + 130}" stroke="${FAINT}" stroke-opacity="0.25" stroke-width="1.6"/>`;
  const [sx, sy] = polar(124, -20);
  const [ex, ey] = polar(124, 34);
  const sweep = `<path d="M ${C} ${C} L ${sx.toFixed(0)} ${sy.toFixed(0)} A 124 124 0 0 1 ${ex.toFixed(0)} ${ey.toFixed(0)} Z" fill="url(#sweep)"/>
  <line x1="${C}" y1="${C}" x2="${ex.toFixed(0)}" y2="${ey.toFixed(0)}" stroke="${BRIGHT}" stroke-opacity="0.7" stroke-width="2.2"/>`;
  const [bx, by] = polar(70, 22);
  const blip = `<circle cx="${bx.toFixed(0)}" cy="${by.toFixed(0)}" r="16" fill="url(#nodeRose)" opacity="0.8"/>\n  <circle cx="${bx.toFixed(0)}" cy="${by.toFixed(0)}" r="6" fill="${ROSE}"/>`;
  return `
  <circle cx="${C}" cy="${C}" r="128" fill="url(#node)" opacity="0.6"/>
  ${rings}
  ${cross}
  ${sweep}
  ${blip}
  <circle cx="${C}" cy="${C}" r="5" fill="${BRIGHT}"/>`;
}

/* ── Network mark — intelligence graph / OSINT ────────────────────── */
function network() {
  const hub = [C, C];
  const sats = [90, 162, 234, 306, 18].map((d) => polar(96, d));
  const edges =
    sats.map(([x, y]) => `<line x1="${hub[0]}" y1="${hub[1]}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${FAINT}" stroke-opacity="0.45" stroke-width="2"/>`).join('\n  ') +
    '\n  ' +
    sats.map(([x, y], i) => {
      const [nx, ny] = sats[(i + 1) % sats.length];
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${FAINT}" stroke-opacity="0.25" stroke-width="1.6"/>`;
    }).join('\n  ');
  const nodes = sats
    .map(([x, y], i) => {
      const c = i === 4 ? ROSE : BRAND;
      const g = i === 4 ? 'nodeRose' : 'node';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="20" fill="url(#${g})" opacity="0.7"/>\n  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${c}"/>`;
    })
    .join('\n  ');
  return `
  ${edges}
  <circle cx="${hub[0]}" cy="${hub[1]}" r="30" fill="url(#node)" opacity="0.8"/>
  ${nodes}
  <circle cx="${hub[0]}" cy="${hub[1]}" r="13" fill="${BRIGHT}"/>`;
}

/* ── Wireframe globe — threat map ─────────────────────────────────── */
function globe() {
  const r = 116;
  const lats = [-92, -50, 0, 50, 92]
    .map((dy) => {
      const rx = Math.sqrt(Math.max(r * r - dy * dy, 1));
      return `<ellipse cx="${C}" cy="${C + dy}" rx="${rx.toFixed(1)}" ry="${Math.max(rx * 0.2, 3).toFixed(1)}" fill="none" stroke="${FAINT}" stroke-opacity="${dy === 0 ? 0.4 : 0.22}" stroke-width="1.6"/>`;
    })
    .join('\n  ');
  const lons =
    [r, r * 0.56, r * 0.2].map((rx) => `<ellipse cx="${C}" cy="${C}" rx="${rx.toFixed(1)}" ry="${r}" fill="none" stroke="${FAINT}" stroke-opacity="0.22" stroke-width="1.6"/>`).join('\n  ') +
    `\n  <line x1="${C}" y1="${C - r}" x2="${C}" y2="${C + r}" stroke="${FAINT}" stroke-opacity="0.22" stroke-width="1.6"/>`;
  const [mx, my] = polar(r, -36);
  return `
  <circle cx="${C}" cy="${C}" r="${r * 1.2}" fill="url(#node)" opacity="0.6"/>
  ${lats}
  ${lons}
  <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${BRAND}" stroke-opacity="0.4" stroke-width="2"/>
  <circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="14" fill="url(#nodeRose)" opacity="0.8"/>
  <circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="6" fill="${ROSE}"/>`;
}

const VARIANTS = { eye, radar, network, globe };

function avatar(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="80%">
      <stop offset="0%" stop-color="#16264e"/><stop offset="100%" stop-color="#070b1c"/>
    </radialGradient>
    <radialGradient id="node" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6d8bf7" stop-opacity="0.5"/><stop offset="100%" stop-color="#6d8bf7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nodeRose" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fb7185" stop-opacity="0.6"/><stop offset="100%" stop-color="#fb7185" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sweep" cx="0%" cy="50%" r="100%">
      <stop offset="0%" stop-color="#6d8bf7" stop-opacity="0.4"/><stop offset="100%" stop-color="#6d8bf7" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#6d8bf7" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" fill="url(#grid)"/>
  <circle cx="${C}" cy="${C}" r="188" fill="none" stroke="#6d8bf7" stroke-opacity="0.45" stroke-width="3"/>
  ${inner}
</svg>`;
}

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers = [readFileSync(join(root, 'public/og/hanken-700.ttf')), readFileSync(join(root, 'public/og/hanken-400.ttf'))];
const render = (svg) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: 800 }, font: { fontBuffers, defaultFontFamily: 'Hanken Grotesk', loadSystemFonts: true }, background: '#070b1c' })
    .render()
    .asPng();

const arg = process.argv[2];
if (arg === '--variants') {
  for (const [name, fn] of Object.entries(VARIANTS)) {
    writeFileSync(join(root, `public/avatar-${name}.png`), render(avatar(fn())));
    console.log(`✓ avatar-${name}.png`);
  }
} else {
  const name = VARIANTS[arg] ? arg : 'eye';
  const svg = avatar(VARIANTS[name]());
  writeFileSync(join(root, 'public/avatar.svg'), svg);
  writeFileSync(join(root, 'public/avatar.png'), render(svg));
  console.log(`✓ avatar.png · variant=${name} · 800×800`);
}
