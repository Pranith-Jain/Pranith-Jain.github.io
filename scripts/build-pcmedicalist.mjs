#!/usr/bin/env node
/**
 * Build the PCMedicalist feed manifest under public/data/pcmedicalist/.
 *
 * Reads staged digests from ./pcmedicalist-staging/ (created by
 * `node scripts/sync-pcmedicalist.mjs`) and emits:
 *   public/data/pcmedicalist/index.json               (slim — no bodies)
 *   public/data/pcmedicalist/digests/<date>.json      (slim digest body)
 *
 * The upstream feed.json is ~4.6 MB/day (3.5k+ items). We never mirror it
 * wholesale: each digest body keeps the run summary, the two social posts,
 * and the TOP_N items per intelligence layer (default 10). A live deep-dive
 * REST route proxies the full feed on demand (see api/src/routes/pcmedicalist.ts).
 *
 * Source: https://github.com/PCMedicalist/pcmedicalist-intellegence-feed
 * License: CC BY 4.0 (attribution via in-data "source" field satisfies)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'pcmedicalist-staging');
const OUT = join(ROOT, 'public', 'data', 'pcmedicalist');

const TOP_N = parseInt(process.env.PCM_TOP_PER_LAYER ?? '10', 10) || 10;

/** Layer id → canonical name + trust (taxonomy v1.0 from the upstream README). */
const LAYER_NAMES = {
  1: { name: 'Standards', trust: 100 },
  2: { name: 'Government Security Intel', trust: 99 },
  3: { name: 'Cryptography', trust: 98 },
  4: { name: 'Computer Science', trust: 97 },
  5: { name: 'Security News', trust: 90 },
  6: { name: 'Vendor Research', trust: 95 },
  7: { name: 'Software Development', trust: 92 },
  8: { name: 'Vulnerability Intel', trust: 100 },
  9: { name: 'Supply Chain Security', trust: 98 },
  10: { name: 'AI Security', trust: 97 },
  11: { name: 'Community / Practitioner', trust: 85 },
};

function slimItem(item) {
  return {
    id: item.id ?? null,
    title: item.title ?? '',
    summary: item.summary ?? '',
    url: item.url ?? null,
    source: item.source ?? null,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    published: item.published ?? null,
    severity: item.severity ?? null,
    trust_score: item.trust_score ?? null,
    cves: Array.isArray(item.cves) ? item.cves : [],
    technologies: Array.isArray(item.technologies) ? item.technologies.slice(0, 8) : [],
    source_type: item.source_type ?? null,
  };
}

function buildDigest(date) {
  const dir = join(STAGING, date);
  const feedPath = join(dir, 'feed.json');
  const summaryPath = join(dir, 'summary.json');
  const postsPath = join(dir, 'posts.json');
  if (!existsSync(feedPath)) return null;

  const items = JSON.parse(readFileSync(feedPath, 'utf8'));
  const feed = Array.isArray(items) ? items : (items.items ?? []);
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : {};
  const posts = existsSync(postsPath) ? JSON.parse(readFileSync(postsPath, 'utf8')) : {};

  // Group by _layer (default to category-derived layer 8 / "Vulnerability Intel").
  const byLayer = new Map();
  for (const item of feed) {
    const layerNum = typeof item._layer === 'number' ? item._layer : 8;
    if (!byLayer.has(layerNum)) byLayer.set(layerNum, []);
    byLayer.get(layerNum).push(item);
  }

  const layers = [];
  for (const [layerNum, layerItems] of byLayer) {
    const meta = LAYER_NAMES[layerNum] ?? { name: item?._layer_name ?? `Layer ${layerNum}`, trust: null };
    const sorted = [...layerItems].sort(
      (a, b) => (b.trust_score ?? 0) - (a.trust_score ?? 0) || String(b.published ?? '').localeCompare(String(a.published ?? ''))
    );
    layers.push({
      layer: layerNum,
      name: meta.name,
      trust: meta.trust,
      count: layerItems.length,
      top: sorted.slice(0, TOP_N).map(slimItem),
    });
  }
  layers.sort((a, b) => a.layer - b.layer);

  const summaryPerFeed = summary.per_feed ?? {};
  return {
    date,
    feedsTotal: summary.feeds_total ?? Object.keys(summaryPerFeed).length ?? null,
    itemsRaw: summary.items_raw ?? feed.length ?? null,
    itemsDeduped: summary.items_deduped ?? null,
    perFeed: summaryPerFeed,
    postA: posts.post_a ?? null,
    postB: posts.post_b ?? null,
    layers,
    sourceUrl: `https://app.pcmedicalist.com/intel/${date}`,
    upstreamDigestUrl: `https://github.com/PCMedicalist/pcmedicalist-intellegence-feed/tree/main/digests/${date}/`,
    rawMarkdownUrl: `https://raw.githubusercontent.com/PCMedicalist/pcmedicalist-intellegence-feed/main/digests/${date}/feed.json`,
  };
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-pcmedicalist.mjs first.');
  process.exit(1);
}

mkdirSync(join(OUT, 'digests'), { recursive: true });

let existingIndex = { digests: [] };
const indexPath = join(OUT, 'index.json');
if (existsSync(indexPath)) {
  try {
    existingIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    /* ignore */
  }
}
const existingDigests = new Map((existingIndex.digests ?? []).map((d) => [d.date, d]));

const dates = readdirSync(STAGING)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort();

const merged = new Map(existingDigests);
let built = 0;

for (const date of dates) {
  const digest = buildDigest(date);
  if (!digest) continue;

  const outPath = join(OUT, 'digests', `${date}.json`);
  const newSize = JSON.stringify(digest).length;

  const existing = merged.get(date);
  if (existing && existing.sizeBytes === newSize) {
    console.log(`  ─ ${date} (unchanged, ${newSize} bytes)`);
    continue;
  }

  writeFileSync(outPath, JSON.stringify(digest));
  merged.set(date, {
    date,
    pushedAt: digest.postA ? new Date().toISOString() : null,
    feedsTotal: digest.feedsTotal,
    itemsRaw: digest.itemsRaw,
    itemsDeduped: digest.itemsDeduped,
    layerCounts: digest.layers.map((l) => ({ layer: l.layer, name: l.name, count: l.count })),
    sizeBytes: newSize,
  });
  built++;
  console.log(`  ✔ ${date} (${newSize} bytes, ${digest.layers.length} layers)`);
}

const allDigests = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
const index = {
  source: 'github.com/PCMedicalist/pcmedicalist-intellegence-feed',
  sourceUrl: 'https://app.pcmedicalist.com/intel',
  license: 'CC-BY-4.0',
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: { digests: allDigests.length },
  digests: allDigests,
};
writeFileSync(indexPath, JSON.stringify(index));

console.log(`\n✔ Built ${built} digest(s), ${allDigests.length} total in index`);
