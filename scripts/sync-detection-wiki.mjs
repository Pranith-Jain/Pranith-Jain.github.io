#!/usr/bin/env node
/**
 * Sync detection.wiki into local staging under detection-wiki-staging/.
 *
 * detection.wiki is behind Cloudflare JS protection — raw fetch() gets a
 * challenge page. We use Playwright to render the page and extract the
 * fully-rendered content.
 *
 * Fetches:
 *   1. /rules/   — MITRE ATT&CK matrix with per-technique rule counts
 *   2. /labs/    — Detection lab entries with technique mappings
 *   3. /         — Platform catalog (17 platforms)
 *
 * Run:  node scripts/sync-detection-wiki.mjs
 * Then: node scripts/build-detection-wiki.mjs
 *
 * Source: https://detection.wiki/ (public, no API key required)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'detection-wiki-staging');

function ensureStaging() {
  mkdirSync(join(STAGING, 'rules'), { recursive: true });
  mkdirSync(join(STAGING, 'labs'), { recursive: true });
}

function stagePath(rel) { return join(STAGING, rel); }
function writeStaged(rel, data) {
  writeFileSync(stagePath(rel), JSON.stringify(data, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Playwright browser helper ────────────────────────────────────────

async function withBrowser(fn) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function fetchRendered(browser, url, waitFor = 'networkidle') {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: waitFor, timeout: 60_000 });
    // Wait a bit for JS to settle
    await sleep(2000);
    return await page.content();
  } finally {
    await page.close();
  }
}

// ─── Parse the rules page ─────────────────────────────────────────────

function parseRulesPage(html) {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Find technique entries: "Name T1234 42 rules" or "Name T1234.001 1 rule"
  const techniqueRe = /([A-Z][^\n]*?)\s+(T\d{4}(?:\.\d{3})?)\s+(\d+)\s+rules?\b/g;
  const allTechniques = [];
  let match;
  while ((match = techniqueRe.exec(text)) !== null) {
    const [, name, techniqueId, countStr] = match;
    const ruleCount = parseInt(countStr, 10);
    const cleanName = name.replace(/\s+\d+\s+rules?\s*$/, '').trim();
    if (cleanName && techniqueId && ruleCount > 0) {
      allTechniques.push({
        name: cleanName,
        techniqueId,
        ruleCount,
        isSubtechnique: techniqueId.includes('.'),
        parentTechnique: techniqueId.includes('.') ? techniqueId.split('.')[0] : null,
      });
    }
  }

  // Deduplicate by techniqueId (keep highest count)
  const byId = new Map();
  for (const t of allTechniques) {
    const existing = byId.get(t.techniqueId);
    if (!existing || t.ruleCount > existing.ruleCount) {
      byId.set(t.techniqueId, t);
    }
  }

  return [...byId.values()];
}

// ─── Parse the labs page ──────────────────────────────────────────────

function parseLabsPage(html) {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Extract lab slugs from links in the HTML
  const slugRe = /href=["']\/labs\/([a-z0-9-]+)\/?["']/g;
  let match;
  const slugs = new Set();
  while ((match = slugRe.exec(html)) !== null) {
    slugs.add(match[1]);
  }

  // Extract lab entries from the text
  // Pattern: Title followed by author + date, then description
  const labRe = /([A-Z][^\n]{5,80})\n\s*(\w+)\s+(\d{4}-\d{2}-\d{2})\s+([^\n]{20,500})/g;
  const labs = [];
  const seen = new Set();
  while ((match = labRe.exec(text)) !== null) {
    const [, title, author, date, description] = match;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (seen.has(slug)) continue;
    seen.add(slug);
    labs.push({
      title: title.trim(),
      slug: slugs.has(slug) ? slug : slug,
      author: author.trim(),
      date: date.trim(),
      description: description.trim(),
    });
  }

  // Extract technique mappings
  const techniqueLabRe = /(T\d{4}(?:\.\d{3})?)\s+([^\n]+)\n\s*([A-Z][^\n]{5,80})\n\s*(\w+)\s+(\d{4}-\d{2}-\d{2})/g;
  const techniqueMap = new Map();
  while ((match = techniqueLabRe.exec(text)) !== null) {
    const [, techniqueId, techniqueName, labTitle] = match;
    const slug = labTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!techniqueMap.has(slug)) techniqueMap.set(slug, []);
    techniqueMap.get(slug).push({ techniqueId, techniqueName: techniqueName.trim() });
  }

  for (const lab of labs) {
    lab.techniques = techniqueMap.get(lab.slug) || [];
  }

  return { labs, slugs: [...slugs] };
}

// ─── Parse platform catalog from homepage ──────────────────────────────

function parsePlatformCatalog(html) {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const platforms = [];
  const knownPlatforms = [
    'macOS', 'auditd', 'Sysmon for Linux', 'Windows', 'Microsoft 365',
    'Entra ID', 'Azure', 'Microsoft Intune', 'Power Platform', 'Defender XDR',
    'AWS', 'GCP', 'Google Workspace', 'GitHub', 'Kubernetes', 'Okta', 'Sublime',
  ];

  for (const name of knownPlatforms) {
    const idx = text.indexOf(name);
    if (idx >= 0) {
      const chunk = text.substring(idx, idx + 300);
      const nums = chunk.match(/\b(\d{2,6})\b/g) || [];
      platforms.push({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        numbers: nums.map(Number),
      });
    }
  }

  return platforms;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 detection.wiki sync (via Playwright)');
  ensureStaging();

  await withBrowser(async (browser) => {
    // 1. Fetch homepage → platform catalog
    console.log('  📡 Fetching homepage (platform catalog)...');
    const homeHtml = await fetchRendered(browser, 'https://detection.wiki/');
    const platforms = parsePlatformCatalog(homeHtml);
    writeStaged('platforms.json', platforms);
    console.log(`  ✅ ${platforms.length} platforms parsed`);

    // 2. Fetch rules page → MITRE ATT&CK matrix
    console.log('  📡 Fetching rules page (ATT&CK matrix)...');
    const rulesHtml = await fetchRendered(browser, 'https://detection.wiki/rules/');
    const techniques = parseRulesPage(rulesHtml);
    writeStaged('rules/techniques.json', techniques);
    console.log(`  ✅ ${techniques.length} techniques parsed`);

    // Parse filter metadata
    const filterMeta = {
      vendors: ['Sigma', 'Elastic', 'Splunk', 'Kusto', 'YARA-L', 'Panther', 'Sublime MQL'],
      platforms: ['Windows', 'Linux', 'macOS', 'AWS', 'Azure', 'GCP', 'Microsoft 365',
        'Intune', 'Google Workspace', 'Okta', 'GitHub', 'Kubernetes'],
      domains: ['Endpoint', 'Cloud', 'Identity', 'SaaS', 'Container', 'Network', 'Web', 'Application'],
      statuses: ['stable', 'deprecated', 'test', 'experimental', 'unspecified'],
    };
    writeStaged('rules/filters.json', filterMeta);

    // 3. Fetch labs page
    console.log('  📡 Fetching labs page...');
    const labsHtml = await fetchRendered(browser, 'https://detection.wiki/labs/');
    const { labs, slugs } = parseLabsPage(labsHtml);
    writeStaged('labs/index.json', labs);
    console.log(`  ✅ ${labs.length} labs found (${slugs.length} unique slugs)`);

    // 4. Fetch individual lab detail pages
    console.log('  📡 Fetching lab detail pages...');
    for (const slug of slugs) {
      const cachePath = `labs/${slug}.json`;
      if (existsSync(stagePath(cachePath))) {
        console.log(`    ⏭  ${slug} (cached)`);
        continue;
      }
      try {
        const labHtml = await fetchRendered(browser, `https://detection.wiki/labs/${slug}/`);
        // Extract title
        const titleMatch = labHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(' | detection.wiki', '').trim() : slug;

        // Extract text content
        const text = labHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Extract KQL queries
        const queries = [];
        const kqlRe = /```(?:kql|sql)\n([\s\S]*?)```/g;
        let m;
        while ((m = kqlRe.exec(text)) !== null) {
          const q = m[1].trim();
          if (q.length > 20) queries.push(q);
        }

        // Extract technique references
        const techniques = [];
        const techRe = /\b(T\d{4}(?:\.\d{3})?)\b/g;
        const seenTechs = new Set();
        while ((m = techRe.exec(text)) !== null) {
          if (!seenTechs.has(m[1])) {
            techniques.push(m[1]);
            seenTechs.add(m[1]);
          }
        }

        const detail = {
          slug,
          title,
          body: text,
          queries,
          techniques,
          queryCount: queries.length,
          sizeBytes: Buffer.byteLength(text, 'utf8'),
        };
        writeStaged(cachePath, detail);
        console.log(`    ✅ ${slug} (${detail.queryCount} queries, ${detail.techniques.length} techniques)`);
        await sleep(500);
      } catch (e) {
        console.warn(`    ⚠ ${slug}: ${e.message}`);
      }
    }
  });

  // Write manifest
  writeStaged('manifest.json', {
    syncedAt: new Date().toISOString(),
    techniqueCount: readFileSync(stagePath('rules/techniques.json'), 'utf8').length > 0 ? JSON.parse(readFileSync(stagePath('rules/techniques.json'), 'utf8')).length : 0,
    labCount: readFileSync(stagePath('labs/index.json'), 'utf8').length > 0 ? JSON.parse(readFileSync(stagePath('labs/index.json'), 'utf8')).length : 0,
  });

  console.log('\n✨ Sync complete. Run: node scripts/build-detection-wiki.mjs');
}

main().catch((e) => {
  console.error('✘ Sync failed:', e.message);
  process.exit(1);
});
