#!/usr/bin/env node
/**
 * Build the security-investigator manifest under public/data/si/.
 *
 * Reads source files from ./security-investigator-replication/ (the
 * upstream-tracking folder; not committed). Re-run after editing that
 * folder or after `node scripts/sync-si-from-upstream.mjs` to pick up
 * upstream changes.
 *
 * Emits:
 *   public/data/si/index.json              (slim — no bodies, no docs)
 *   public/data/si/skills/<slug>.json      (1 per skill, includes svgWidgetsYaml)
 *   public/data/si/queries/<slug>.json     (1 per query)
 *   public/data/si/automations/<slug>.json (1 per workflow)
 *   public/data/si/docs/<slug>.md          (1 per upstream docs/*.md)
 *   public/data/si/docs-index.json         (slim doc index)
 *   public/data/si/routing-prompt.md       (.github/copilot-instructions.md verbatim)
 *   public/data/si/ref/<name>.json         (MITRE catalog + known-kql-tables + m365-coverage)
 *
 * Safe to run repeatedly — wipes public/data/si/ on each run.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SI = join(ROOT, 'security-investigator-replication');
const OUT = join(ROOT, 'public', 'data', 'si');

const CATEGORIES = {
  'threat-pulse': 'Quick Scan',
  'context-memory-review': 'Quick Scan',
  'user-investigation': 'Core Investigation',
  'computer-investigation': 'Core Investigation',
  'incident-investigation': 'Core Investigation',
  'ioc-investigation': 'Core Investigation',
  'honeypot-investigation': 'Core Investigation',
  'authentication-tracing': 'Auth & Access',
  'ca-policy-investigation': 'Auth & Access',
  'exposure-investigation': 'Posture & Exposure',
  'ai-agent-posture': 'Posture & Exposure',
  'app-registration-posture': 'Posture & Exposure',
  'email-threat-posture': 'Posture & Exposure',
  'identity-posture': 'Posture & Exposure',
  'data-security-analysis': 'Data Security',
  'geomap-visualization': 'Visualization',
  'heatmap-visualization': 'Visualization',
  'svg-dashboard': 'Visualization',
  'detection-authoring': 'Tooling',
  'kql-query-authoring': 'Tooling',
  'mitre-coverage-report': 'Tooling',
  'mcp-usage-monitoring': 'Tooling',
  'sentinel-ingestion-report': 'Tooling',
  'threat-intel-campaign': 'Tooling',
};

function parseFrontmatter(text) {
  const m = /^---\s*\n(.*?)\n---\s*\n(.*)$/s.exec(text);
  if (!m) return [{}, text];
  const fm = {};
  let curKey = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('  ') && curKey) {
      fm[curKey] += ' ' + line.trim();
      continue;
    }
    const m2 = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m2) {
      curKey = m2[1];
      let val = m2[2].trim();
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      fm[curKey] = val;
    }
  }
  return [fm, m[2]];
}

function extractTriggers(desc) {
  if (!desc) return [];
  let m = /[Tt]rigger[s]?\s+(?:on|when|keywords?)\s+(?:on|like|:)?\s*([^.]+)/.exec(desc);
  if (!m) m = /[Tt]riggers?\s+(?:on|when)\s+keywords?\s+like\s+([^.]+)/.exec(desc);
  if (!m) return [];
  const out = [];
  for (const p of m[1].split(/,\s*/)) {
    const v = p.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim();
    if (v && v.length < 60) out.push(v);
  }
  return out;
}

function safeFilename(slug) {
  return slug.replace(/\//g, '__');
}

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

function hasAssets(dir) {
  return ['.yaml', '.ps1', '.json'].some((ext) =>
    readdirSync(dir).some((p) => p.endsWith(ext)),
  );
}

function hasSvgWidgetsYaml(dir) {
  return existsSync(join(dir, 'svg-widgets.yaml'));
}

if (!existsSync(SI)) {
  console.error(`✘ Source folder missing: ${SI}`);
  console.error('  Either restore it (e.g. `git checkout security-investigator-replication/`)');
  console.error('  or re-fetch from upstream:');
  console.error('    node scripts/sync-si-from-upstream.mjs');
  process.exit(1);
}

// Wipe and rebuild.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'skills'));
ensureDir(join(OUT, 'queries'));
ensureDir(join(OUT, 'automations'));
ensureDir(join(OUT, 'docs'));
ensureDir(join(OUT, 'ref'));

// ─── SKILLS ───────────────────────────────────────────────────────────
const skills = [];

// scope-drift-detection has nested subdirs
const sdRoot = join(SI, '.github', 'skills', 'scope-drift-detection');
if (existsSync(sdRoot)) {
  for (const sd of readdirSync(sdRoot).sort()) {
    const dir = join(sdRoot, sd);
    if (!statSync(dir).isDirectory()) continue;
    const md = join(dir, 'SKILL.md');
    if (!existsSync(md)) continue;
    const text = readFileSync(md, 'utf8');
    const [fm, body] = parseFrontmatter(text);
    const slug = `scope-drift-detection/${sd}`;
    const svgYaml = hasSvgWidgetsYaml(dir) ? readFileSync(join(dir, 'svg-widgets.yaml'), 'utf8') : null;
    skills.push({
      slug, name: fm.name || sd, category: 'Behavioral Drift',
      description: fm.description || '',
      triggerKeywords: extractTriggers(fm.description || ''),
      hasAssets: hasAssets(dir), hasSvgWidgets: !!svgYaml, sizeBytes: body.length,
    });
    writeFileSync(join(OUT, 'skills', `${safeFilename(slug)}.json`), JSON.stringify({
      slug, name: fm.name || sd, bodyMarkdown: body,
      category: 'Behavioral Drift', domain: slug,
      description: fm.description || '',
      triggerKeywords: extractTriggers(fm.description || ''),
      ...(svgYaml ? { svgWidgetsYaml: svgYaml } : {}),
    }));
  }
}

for (const sub of readdirSync(join(SI, '.github', 'skills')).sort()) {
  if (sub === 'scope-drift-detection') continue;
  const dir = join(SI, '.github', 'skills', sub);
  if (!statSync(dir).isDirectory()) continue;
  const md = join(dir, 'SKILL.md');
  if (!existsSync(md)) continue;
  const text = readFileSync(md, 'utf8');
  const [fm, body] = parseFrontmatter(text);
  const svgYaml = hasSvgWidgetsYaml(dir) ? readFileSync(join(dir, 'svg-widgets.yaml'), 'utf8') : null;
  skills.push({
    slug: sub, name: fm.name || sub,
    category: CATEGORIES[sub] || 'Other',
    description: fm.description || '',
    triggerKeywords: extractTriggers(fm.description || ''),
    hasAssets: hasAssets(dir), hasSvgWidgets: !!svgYaml, sizeBytes: body.length,
  });
  writeFileSync(join(OUT, 'skills', `${safeFilename(sub)}.json`), JSON.stringify({
    slug: sub, name: fm.name || sub, bodyMarkdown: body,
    category: CATEGORIES[sub] || 'Other', domain: sub,
    description: fm.description || '',
    triggerKeywords: extractTriggers(fm.description || ''),
    ...(svgYaml ? { svgWidgetsYaml: svgYaml } : {}),
  }));
}

// ─── QUERIES ──────────────────────────────────────────────────────────
const queries = [];
const queriesDir = join(SI, 'queries');
if (existsSync(queriesDir)) {
  for (const domain of readdirSync(queriesDir).sort()) {
    const dir = join(queriesDir, domain);
    if (!statSync(dir).isDirectory()) continue;
    if (domain === 'threat-intelligence') {
      for (const month of readdirSync(dir).sort()) {
        const mdir = join(dir, month);
        if (!statSync(mdir).isDirectory()) continue;
        for (const f of readdirSync(mdir).filter((n) => n.endsWith('.md')).sort()) {
          const fp = join(mdir, f);
          const text = readFileSync(fp, 'utf8');
          const titleMatch = /^#\s+(.+)$/m.exec(text);
          const title = titleMatch ? titleMatch[1] : f.replace(/\.md$/, '');
          const slug = `threat-intelligence/${month}/${f.replace(/\.md$/, '')}`;
          const rec = { slug, domain: 'threat-intelligence', subdomain: month, title, filename: f, sizeBytes: statSync(fp).size };
          queries.push(rec);
          writeFileSync(join(OUT, 'queries', `${safeFilename(slug)}.json`), JSON.stringify({ ...rec, bodyMarkdown: text }));
        }
      }
    } else {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'README.md').sort()) {
        const fp = join(dir, f);
        const text = readFileSync(fp, 'utf8');
        const titleMatch = /^#\s+(.+)$/m.exec(text);
        const title = titleMatch ? titleMatch[1] : f.replace(/\.md$/, '');
        const slug = `${domain}/${f.replace(/\.md$/, '')}`;
        const rec = { slug, domain, subdomain: null, title, filename: f, sizeBytes: statSync(fp).size };
        queries.push(rec);
        writeFileSync(join(OUT, 'queries', `${safeFilename(slug)}.json`), JSON.stringify({ ...rec, bodyMarkdown: text }));
      }
    }
  }
}

// ─── AUTOMATIONS ──────────────────────────────────────────────────────
const automations = [];
const autoDir = join(SI, 'automations');
if (existsSync(autoDir)) {
  for (const f of readdirSync(autoDir).filter((n) => n.endsWith('.workflow.md')).sort()) {
    const fp = join(autoDir, f);
    const text = readFileSync(fp, 'utf8');
    const titleMatch = /^#\s+(.+)$/m.exec(text);
    const title = titleMatch ? titleMatch[1] : f.replace(/\.workflow\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const slug = f.replace(/\.workflow\.md$/, '');
    const interval = slug.includes('weekly') ? 'weekly' : 'daily';
    const rec = { slug, title, filename: f, interval, sizeBytes: text.length };
    automations.push(rec);
    writeFileSync(join(OUT, 'automations', `${slug}.json`), JSON.stringify({ ...rec, bodyMarkdown: text }));
  }
}

// ─── DOCS (upstream docs/*.md) ────────────────────────────────────────
const docs = [];
const docsDir = join(SI, 'docs');
if (existsSync(docsDir)) {
  for (const f of readdirSync(docsDir).filter((n) => n.endsWith('.md')).sort()) {
    const fp = join(docsDir, f);
    const text = readFileSync(fp, 'utf8');
    const titleMatch = /^#\s+(.+)$/m.exec(text);
    const title = titleMatch ? titleMatch[1] : f.replace(/\.md$/, '');
    const slug = f.replace(/\.md$/, '').toLowerCase();
    docs.push({ slug, title, filename: f, sizeBytes: text.length });
    writeFileSync(join(OUT, 'docs', `${slug}.md`), text);
  }
  const docsMeta = {
    source: 'github.com/SCStelz/security-investigator/docs',
    license: 'MIT',
    count: docs.length,
    docs,
  };
  writeFileSync(join(OUT, 'docs-index.json'), JSON.stringify(docsMeta));
}

// ─── ROUTING PROMPT (.github/copilot-instructions.md) ─────────────────
const routingSrc = join(SI, '.github', 'copilot-instructions.md');
let routingBytes = 0;
if (existsSync(routingSrc)) {
  const text = readFileSync(routingSrc, 'utf8');
  writeFileSync(join(OUT, 'routing-prompt.md'), text);
  routingBytes = text.length;
}

// ─── REFERENCE DATA (mitre-coverage-report's JSON files + any other
//      *.json files at .github/skills/<name>/*.json that look like data) ─
const refFiles = [];
function walkRefs(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const fp = join(dir, name);
    if (statSync(fp).isDirectory()) {
      walkRefs(fp);
    } else if (name.endsWith('.json') && !name.endsWith('.workflow.json')) {
      // Skip SKILL.json if it exists, etc — only copy the reference datasets.
      // Heuristic: skip files starting with 'example-' or 'SKILL'.
      if (/^(example-|SKILL)/i.test(name)) continue;
      try {
        const parsed = JSON.parse(readFileSync(fp, 'utf8'));
        // Skip arrays-of-objects that look like test fixtures (heuristic: any
        // file smaller than 5KB that isn't a known dataset).
        const isKnown = /known-kql|m365-platform|mitre-attck/i.test(name);
        if (!isKnown && statSync(fp).size < 5_000) continue;
        const outName = name;
        writeFileSync(join(OUT, 'ref', outName), JSON.stringify(parsed));
        refFiles.push({ filename: outName, sizeBytes: statSync(fp).size });
      } catch { /* not JSON — skip */ }
    }
  }
}
walkRefs(join(SI, '.github', 'skills'));



// ─── SCRIPTS (PowerShell + detection authoring manifests) ────────────
const scriptsOut = join(OUT, 'scripts');
ensureDir(scriptsOut);
const scriptFiles = [];

// detection-authoring: Deploy-CustomDetections.ps1 + example-manifest.json
const deploySrc = join(SI, '.github', 'skills', 'detection-authoring');
for (const f of ['Deploy-CustomDetections.ps1', 'example-manifest.json']) {
  const fp = join(deploySrc, f);
  if (!existsSync(fp)) continue;
  const text = readFileSync(fp, 'utf8');
  const outName = f === 'example-manifest.json' ? 'example-detection-manifest.json' : f;
  writeFileSync(join(scriptsOut, outName), text);
  scriptFiles.push({ name: outName, sizeBytes: text.length });
}

// mitre-coverage-report: Invoke-MitreScan.ps1
const mitreSrc = join(SI, '.github', 'skills', 'mitre-coverage-report');
for (const f of ['Invoke-MitreScan.ps1']) {
  const fp = join(mitreSrc, f);
  if (!existsSync(fp)) continue;
  const text = readFileSync(fp, 'utf8');
  writeFileSync(join(scriptsOut, f), text);
  scriptFiles.push({ name: f, sizeBytes: text.length });
}

// sentinel-ingestion-report: Invoke-IngestionScan.ps1 + SKILL-drilldown.md
const ingSrc = join(SI, '.github', 'skills', 'sentinel-ingestion-report');
for (const f of ['Invoke-IngestionScan.ps1', 'SKILL-drilldown.md']) {
  const fp = join(ingSrc, f);
  if (!existsSync(fp)) continue;
  const text = readFileSync(fp, 'utf8');
  const outName = f === 'SKILL-drilldown.md' ? 'sentinel-ingestion-drilldown.md' : f;
  writeFileSync(join(scriptsOut, outName), text);
  scriptFiles.push({ name: outName, sizeBytes: text.length });
}

if (scriptFiles.length > 0) {
  const scriptsMeta = {
    source: 'github.com/SCStelz/security-investigator/.github/skills/{detection-authoring,mitre-coverage-report,sentinel-ingestion-report}',
    license: 'MIT',
    count: scriptFiles.length,
    scripts: scriptFiles,
  };
  writeFileSync(join(OUT, 'scripts-index.json'), JSON.stringify(scriptsMeta));
}


// ─── INDEX (after all sections so we can include scripts count) ───
const index = {
  source: 'github.com/SCStelz/security-investigator',
  license: 'MIT',
  replicatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    skills: skills.length,
    queries: queries.length,
    automations: automations.length,
    docs: docs.length,
    referenceData: refFiles.length,
    routingPromptBytes: routingBytes,
    scripts: scriptFiles.length,
  },
  skills, queries, automations,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log(`✔ Built:`);
console.log(`    ${skills.length} skills   (in public/data/si/skills/)`);
console.log(`    ${queries.length} queries  (in public/data/si/queries/)`);
console.log(`    ${automations.length} automations (in public/data/si/automations/)`);
console.log(`    ${docs.length} docs       (in public/data/si/docs/)`);
console.log(`    ${refFiles.length} ref files  (in public/data/si/ref/)`);
console.log(`    1 routing prompt (${routingBytes}b)  (routing-prompt.md)`);
console.log(`    ${scriptFiles.length} scripts   (in public/data/si/scripts/)`);