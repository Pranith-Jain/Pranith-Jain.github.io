#!/usr/bin/env node
// Deploy-time guard against the SEO regression this repo already shipped once:
// a 97-char <title> and a 317-char <meta name="description"> in index.html.
// The worker (worker/og-rewriter.ts) only rewrites those for routes that have
// an OG_OVERRIDES entry; the HOME defaults in index.html ship verbatim, so a
// too-long title/description there is served to crawlers unchecked. Wired into
// `prebuild` so `npm run build` / `npm run deploy` fails loudly before shipping.
// Per-route OG_OVERRIDES title length is guarded by the vitest contract test.
import { readFileSync } from 'node:fs';

const TITLE_MAX = 60;
const DESC_MAX = 160;

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m] ?? m);

const titleM = /<title>([^<]*)<\/title>/i.exec(html);
// `\s` (with the `s` flag) tolerates the multi-line/wrapped tag prettier produces.
const descM = /<meta\s+name="description"\s+content="([^"]*)"/is.exec(html);

const errors = [];
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

if (errors.length > 0) {
  console.error('✗ check-meta-lengths:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ check-meta-lengths: index.html title + description within SEO limits (<=${TITLE_MAX}/<=${DESC_MAX}).`);
