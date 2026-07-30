#!/usr/bin/env node
/**
 * Build the Webamon DTB manifest under public/data/webamon-dtb/.
 *
 * Reads markdown from ./webamon-dtb-staging/ (created by
 * `node scripts/sync-webamon-dtb.mjs`) and emits structured JSON:
 *   public/data/webamon-dtb/index.json
 *   public/data/webamon-dtb/briefs/<date>.json
 *
 * Source: https://github.com/webamon-org/Daily-Threat-Brief (Apache-2.0)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'webamon-dtb-staging');
const OUT = join(ROOT, 'public', 'data', 'webamon-dtb');

function parseBrief(md, date) {
  const lines = md.split('\n');

  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/[🛡️️]/gu, '').trim() : `Webamon DTB ${date}`;

  const tlpMatch = md.match(/\*\*TLP:(\w+)\*\*/i);
  const tlp = tlpMatch ? tlpMatch[1].toUpperCase() : 'CLEAR';

  const estateMatch = md.match(/Estate:\s*([\d,]+)\s*campaigns tracked\s*·\s*([\d,]+)\s*unique domains\s*·\s*([\d.]+)%\s*online/i);
  const estate = estateMatch
    ? {
        campaignsTracked: parseInt(estateMatch[1].replace(/,/g, ''), 10),
        uniqueDomains: parseInt(estateMatch[2].replace(/,/g, ''), 10),
        percentOnline: parseFloat(estateMatch[3]),
      }
    : null;

  const kpis = [];
  const numbersSection = md.match(/##\s*📊\s*By the numbers[\s\S]*?(?=\n##|\n---|\n\*\*|$)/i);
  if (numbersSection) {
    const kpiRe = /\*\*([\d,]+)\*\*\s+(.+)/g;
    let m;
    while ((m = kpiRe.exec(numbersSection[0])) !== null) {
      kpis.push({ value: m[1].replace(/,/g, ''), label: m[2].trim() });
    }
  }

  const movements = [];
  const movedSection = md.match(/##\s*🔍\s*What moved today[\s\S]*?(?=\n##|\n---|\n\*\*|$)/i);
  if (movedSection) {
    const moveRe = /(🔺|🔻|🔁|🎭)\s*\*\*(.+?)\*\*\s*[—–-]\s*(.+?)(?=\n\n|\n🔺|\n🔻|\n🔁|\n🎭|$)/gs;
    let m;
    while ((m = moveRe.exec(movedSection[0])) !== null) {
      const icon = m[1];
      const category = icon === '🔺' ? 'growth' : icon === '🔻' ? 'takedown' : icon === '🔁' ? 'infra-rotation' : 'lure-refresh';
      const linkMatch = m[2].match(/\[(.+?)\]\((.+?)\)/);
      movements.push({
        category,
        title: linkMatch ? linkMatch[1] : m[2].replace(/\[|\]/g, ''),
        url: linkMatch ? linkMatch[2] : null,
        detail: m[3].trim(),
      });
    }
  }

  const campaigns = [];
  const campaignSection = md.match(/##\s*🎯\s*Campaigns worth a look[\s\S]*?(?=\n##|\n---|\n\*\*|$)/i);
  if (campaignSection) {
    const campRe = /\*\*\[(.+?)\]\((.+?)\)\*\*\s*[—–-]\s*(.+?)(?=\n\n\*\*\[|\n##|\n---|$)/gs;
    let m;
    while ((m = campRe.exec(campaignSection[0])) !== null) {
      campaigns.push({ name: m[1], url: m[2], summary: m[3].trim() });
    }
  }

  const clusters = [];
  const radarSection = md.match(/##\s*📡\s*On the radar[\s\S]*?(?=\n##|\n---|\nSee the full|$)/i);
  if (radarSection) {
    const clusterCountMatch = radarSection[0].match(/(\d+)\s*clusters live\s*\((\d+)\s*critical,\s*(\d+)\s*high\)/i);
    const clusterCount = clusterCountMatch
      ? { total: parseInt(clusterCountMatch[1], 10), critical: parseInt(clusterCountMatch[2], 10), high: parseInt(clusterCountMatch[3], 10) }
      : null;
    const clusterRe = /(\w+ cluster)\s*[—–-]\s*([\d,]+)\s*domains,\s*\+([\d,]+)\s*\((.+?)\)/g;
    let m;
    while ((m = clusterRe.exec(radarSection[0])) !== null) {
      clusters.push({
        type: m[1],
        domains: parseInt(m[2].replace(/,/g, ''), 10),
        growth: parseInt(m[3].replace(/,/g, ''), 10),
        sample: m[4],
      });
    }
    if (clusterCount) clusters.unshift(clusterCount);
  }

  return {
    date,
    title,
    tlp,
    estate,
    kpis,
    movements,
    campaigns,
    clusters: Array.isArray(clusters) && typeof clusters[0] === 'object' && 'total' in clusters[0]
      ? { summary: clusters[0], entries: clusters.slice(1) }
      : { summary: null, entries: clusters },
    sourceUrl: `https://github.com/webamon-org/Daily-Threat-Brief/tree/main/${date}`,
    rawMarkdown: md,
  };
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-webamon-dtb.mjs first.');
  process.exit(1);
}

mkdirSync(join(OUT, 'briefs'), { recursive: true });

let existingIndex = { briefs: [] };
const indexPath = join(OUT, 'index.json');
if (existsSync(indexPath)) {
  try { existingIndex = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { /* ignore */ }
}
const existingBriefs = new Map((existingIndex.briefs ?? []).map((b) => [b.date, b]));

const files = readdirSync(STAGING).filter((f) => f.endsWith('.md')).sort();
const mergedBriefs = new Map(existingBriefs);
let count = 0;

for (const file of files) {
  const date = file.replace('.md', '');
  const md = readFileSync(join(STAGING, file), 'utf8');
  const parsed = parseBrief(md, date);
  const outPath = join(OUT, 'briefs', `${date}.json`);
  const newSize = JSON.stringify(parsed).length;

  const existing = mergedBriefs.get(date);
  if (existing && existing.sizeBytes === newSize) {
    console.log(`  ─ ${date} (unchanged, ${newSize} bytes)`);
    count++;
    continue;
  }

  writeFileSync(outPath, JSON.stringify(parsed));
  mergedBriefs.set(date, {
    date,
    title: parsed.title,
    tlp: parsed.tlp,
    kpiCount: parsed.kpis.length,
    campaignCount: parsed.campaigns.length,
    movementCount: parsed.movements.length,
    sizeBytes: newSize,
  });
  count++;
  console.log(`  ✔ ${date} (${newSize} bytes)`);
}

const allBriefs = [...mergedBriefs.values()].sort((a, b) => b.date.localeCompare(a.date));
const index = {
  source: 'github.com/webamon-org/Daily-Threat-Brief',
  license: 'Apache-2.0',
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: { briefs: allBriefs.length },
  briefs: allBriefs,
};
writeFileSync(indexPath, JSON.stringify(index));

console.log(`\n✔ Built ${count} brief(s), ${allBriefs.length} total in index`);
