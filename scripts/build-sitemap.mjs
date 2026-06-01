#!/usr/bin/env node
/**
 * Auto-generate `public/sitemap.xml` from:
 *   1. The `ROUTES` array in `scripts/prerender.mjs` (single source of
 *      truth for routes that should be in the sitemap)
 *   2. Published case studies in `src/data/case-studies.ts`
 *   3. Published research articles in `src/data/threatintel/research.ts`
 *
 * Why: previously the sitemap was hand-edited and silently drifted from
 * the prerender list (5–9 routes were missing on most audits). This
 * script regenerates from the same constants the rest of the build uses,
 * so the sitemap can never disagree with what's actually deployed.
 *
 * Run via:
 *   node scripts/build-sitemap.mjs
 *
 * Wired into the build pipeline via `prebuild` (see package.json). Can
 * also be run manually as a sanity check.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const BASE_URL = 'https://pranithjain.qzz.io';

function quote(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readPrerenderRoutes() {
  const src = readFileSync(resolve(ROOT, 'scripts/prerender.mjs'), 'utf-8');
  // Match every `'/<path>'` string literal in the ROUTES array. The
  // array is the only place the prerender script enumerates paths.
  const matches = src.match(/^  '(\/[^']*)'/gm) ?? [];
  return matches.map((m) => m.replace(/^  '|'$/g, ''));
}

function readPublishedCaseStudySlugs() {
  const path = resolve(ROOT, 'src/data/case-studies.ts');
  if (!existsSync(path)) return [];
  const src = readFileSync(path, 'utf-8');
  // Find every `slug: 'foo'` pair where the surrounding object also
  // has `published: true`. Approximates `publishedCaseStudies` (which
  // also sorts but ordering doesn't matter for a sitemap).
  const blocks = src.split(/\{\s*slug:/);
  const slugs = [];
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split(/\}/)[0];
    const slugMatch = block.match(/^\s*'([^']+)'/);
    if (!slugMatch) continue;
    if (!/published:\s*true/.test(block)) continue;
    slugs.push(slugMatch[1]);
  }
  return slugs;
}

function readPublishedResearchSlugs() {
  const path = resolve(ROOT, 'src/data/threatintel/research.ts');
  if (!existsSync(path)) return [];
  const src = readFileSync(path, 'utf-8');
  // Same heuristic as case-studies: find every published post.
  const blocks = src.split(/\{\s*slug:/);
  const slugs = [];
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split(/\}/)[0];
    const slugMatch = block.match(/^\s*'([^']+)'/);
    if (!slugMatch) continue;
    if (!/published:\s*true/.test(block)) continue;
    slugs.push(slugMatch[1]);
  }
  return slugs;
}

function classifyRoute(path) {
  // Returns { changefreq, priority, group } for a given prerender path.
  // The group is used to emit the right "<!-- group -->" comment in the
  // output so the sitemap stays human-readable.
  if (path === '/') return { changefreq: 'weekly', priority: '1.0', group: 'Portfolio' };
  if (['/about', '/skills', '/experience'].includes(path))
    return { changefreq: 'monthly', priority: '0.8', group: 'Portfolio' };
  if (path === '/projects') return { changefreq: 'weekly', priority: '0.9', group: 'Portfolio' };
  if (path === '/blog') return { changefreq: 'weekly', priority: '0.6', group: 'Portfolio' };
  if (path === '/dfir' || path === '/threatintel')
    return { changefreq: 'daily', priority: '0.9', group: 'Landings' };
  if (path.startsWith('/dfir/'))
    return { changefreq: 'monthly', priority: '0.7', group: 'DFIR tools' };
  if (path.startsWith('/threatintel/research'))
    return { changefreq: 'monthly', priority: '0.6', group: 'Threat Intel — research' };
  if (path.startsWith('/threatintel/'))
    return { changefreq: 'weekly', priority: '0.7', group: 'Threat Intel — pages' };
  return { changefreq: 'monthly', priority: '0.5', group: 'Misc' };
}

function entryFor(path, opts = {}) {
  const cls = classifyRoute(path);
  return [
    '  <url>',
    `    <loc>${quote(BASE_URL + path)}</loc>`,
    `    <lastmod>${opts.lastmod ?? TODAY_ISO}</lastmod>`,
    `    <changefreq>${opts.changefreq ?? cls.changefreq}</changefreq>`,
    `    <priority>${opts.priority ?? cls.priority}</priority>`,
    '  </url>',
  ].join('\n');
}

function buildSitemap() {
  const prerenderRoutes = readPrerenderRoutes();
  const caseStudySlugs = readPublishedCaseStudySlugs();
  const researchSlugs = readPublishedResearchSlugs();

  // Group prerender routes by their classifier group so the output keeps
  // the same sectioned layout the hand-edited sitemap had.
  const grouped = new Map();
  for (const path of prerenderRoutes) {
    const { group } = classifyRoute(path);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(path);
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  // Emit grouped prerender routes in the order they appear.
  for (const [group, paths] of grouped) {
    lines.push(`  <!-- ${group} (${paths.length}) -->`);
    for (const path of paths) {
      const cls = classifyRoute(path);
      lines.push(entryFor(path));
    }
  }

  // Case studies (read from src/data/case-studies.ts)
  if (caseStudySlugs.length) {
    lines.push(`  <!-- Case studies (${caseStudySlugs.length}) -->`);
    for (const slug of caseStudySlugs) {
      lines.push(entryFor(`/projects/${slug}`, { changefreq: 'yearly', priority: '0.8' }));
    }
  }

  // Research articles (read from src/data/threatintel/research.ts)
  if (researchSlugs.length) {
    lines.push(`  <!-- Research articles (${researchSlugs.length}) -->`);
    for (const slug of researchSlugs) {
      lines.push(entryFor(`/threatintel/research/${slug}`, { changefreq: 'monthly', priority: '0.6' }));
    }
  }

  lines.push('</urlset>');
  return {
    xml: lines.join('\n') + '\n',
    counts: {
      prerender: prerenderRoutes.length,
      caseStudies: caseStudySlugs.length,
      research: researchSlugs.length,
      total: prerenderRoutes.length + caseStudySlugs.length + researchSlugs.length,
    },
  };
}

async function main() {
  const { xml, counts } = buildSitemap();
  const outPath = resolve(ROOT, 'public/sitemap.xml');
  await writeFile(outPath, xml, 'utf-8');
  console.log(
    `sitemap: wrote ${outPath} (${counts.total} urls — ${counts.prerender} prerender + ${counts.caseStudies} case studies + ${counts.research} research)`
  );
}

main().catch((err) => {
  console.error('build-sitemap failed:', err);
  process.exit(1);
});
