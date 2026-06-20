#!/usr/bin/env node
// Deploy-time guard against the SEO regression this repo already shipped once:
// a 97-char <title> and a 317-char <meta name="description"> in index.html, plus
// per-route OG descriptions creeping past 160 chars. The worker
// (worker/og-rewriter.ts) only rewrites for routes that have an OG_OVERRIDES
// entry; the HOME defaults in index.html ship verbatim, and the override map
// feeds straight into the `<meta>` tags the social-media crawler reads. Wired
// into `prebuild` so `npm run build` / `npm run deploy` fails loudly before
// shipping.
import { readFileSync } from 'node:fs';

const TITLE_MAX = 60;
const DESC_MAX = 160;

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m] ?? m);

const errors = [];

// --- index.html: <title> + <meta name="description"> ---
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const titleM = /<title>([^<]*)<\/title>/i.exec(html);
// `\s` (with the `s` flag) tolerates the multi-line/wrapped tag prettier produces.
const descM = /<meta\s+name="description"\s+content="([^"]*)"/is.exec(html);

if (!titleM) {
  errors.push('index.html: <title> not found');
} else {
  const len = decode(titleM[1]).length;
  if (len > TITLE_MAX) errors.push(`index.html <title> is ${len} chars (max ${TITLE_MAX})`);
}
if (!descM) {
  errors.push('index.html: <meta name="description"> not found');
} else {
  const len = decode(descM[1]).length;
  if (len > DESC_MAX) errors.push(`index.html <meta name="description"> is ${len} chars (max ${DESC_MAX})`);
}

// --- worker/og-rewriter.ts: OG_OVERRIDES title/description per route ---
// Static parse: each entry is `'/<route>': { title: '...', description: '...'[, image: '...'] },`.
// Tolerates multi-line string literals and trailing commas; ignores the
// dynamic `generateOgMeta()` paths (blog post, briefing) which are already
// length-capped at runtime (.slice(0, 280)).
const ogSrc = readFileSync(new URL('../worker/og-rewriter.ts', import.meta.url), 'utf8');
// Pull everything between `export const OG_OVERRIDES = {` and the matching `};`.
const ogBlock = ogSrc.match(/export const OG_OVERRIDES[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!ogBlock) {
  errors.push('worker/og-rewriter.ts: OG_OVERRIDES block not found (parser drift)');
} else {
  const body = ogBlock[1];
  // Match `  '/path': { ... },` blocks (path may contain slashes, dots, dashes).
  const entryRe = /'([^']+)':\s*\{([\s\S]*?)\},?\n/g;
  let em;
  while ((em = entryRe.exec(body)) !== null) {
    const route = em[1];
    const entry = em[2];
    const tM = /title:\s*'((?:[^'\\]|\\.)*)'/.exec(entry);
    const dM = /description:\s*\n?\s*'((?:[^'\\]|\\.)*)'/.exec(entry);
    if (!tM || !dM) continue; // not a full title+description entry
    const title = decode(tM[1]);
    const desc = decode(dM[1]);
    if (title.length > TITLE_MAX) {
      errors.push(`OG_OVERRIDES[${route}].title is ${title.length} chars (max ${TITLE_MAX})`);
    }
    if (desc.length > DESC_MAX) {
      errors.push(`OG_OVERRIDES[${route}].description is ${desc.length} chars (max ${DESC_MAX})`);
    }
  }
}

if (errors.length > 0) {
  console.error('✗ check-meta-lengths:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ check-meta-lengths: index.html + OG_OVERRIDES within SEO limits (<=${TITLE_MAX}/<=${DESC_MAX}).`);
