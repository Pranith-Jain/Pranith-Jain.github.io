#!/usr/bin/env node
/**
 * Build the CAIRN manifest under public/data/cairn/.
 *
 * Replicates the portable core of Cisco-Talos/Cognitive-Artifact-Intelligence-
 * Research-Network (MIT): the 26 tiered YARA cognitive-artifact rules, the 27
 * named VT acquisition filters, the A0–A11 archetype taxonomy, and the 10
 * published family reports.
 *
 * Sources (MIT, Copyright (c) 2026 Cisco Systems, Inc.):
 *   https://github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network
 *
 * Emits:
 *   public/data/cairn/index.json            (slim — counts + slim rule/family lists)
 *   public/data/cairn/rules/<RuleName>.json (1 per rule, full body for edge scanning)
 *   public/data/cairn/filters.json          (acquisition channels)
 *   public/data/cairn/archetypes.json       (A0–A11 taxonomy)
 *   public/data/cairn/families/<slug>.json  (1 per family, full markdown body)
 *
 * Usage:
 *   node scripts/build-cairn-manifest.mjs [--source <dir>]
 * `--source` points at a local checkout (offline mode); otherwise files are
 * fetched from raw.githubusercontent.com.
 *
 * Safe to run repeatedly — wipes public/data/cairn/ on each run.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'cairn');

const SOURCE = 'github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network';
const SOURCE_URL = 'https://github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network';
const RAW_BASE = 'https://raw.githubusercontent.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network/main';
const LICENSE = 'MIT';

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
const LOCAL_SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

const FAMILY_SLUGS = [
  'PROMPTLOCK',
  'HONESTCUE',
  'PROMPTFLUX',
  'FRUITSHELL',
  'GUARDBREAKER',
  'CLOSEDQUORUM',
  'TEAMPCP',
  'LAMEHUG',
  'PROMPTSTEAL',
  'QUIETVAULT',
];

const ARCHETYPES = [
  { id: 'A0', name: 'No AI Content', description: 'Family discovered by CAIRN that carries no AI or LLM component; retained for campaign-level attribution with an AI-bearing family.', families: [] },
  { id: 'A1', name: 'LLM-Directed Payload Generation', description: 'Malware sends a hard-coded prompt to a hosted LLM at runtime to generate executable code, scripts, or encryption logic.', families: ['PROMPTLOCK', 'HONESTCUE', 'PROMPTFLUX'] },
  { id: 'A2', name: 'LLM API Routing / Proxying Backdoor', description: 'A service silently routes LLM API traffic through the victim, exfiltrating keys and billing inference to the host.', families: [] },
  { id: 'A3', name: 'AI-Analysis Evasion', description: 'Malware embeds natural-language instructions addressed to AI analysis systems to suppress classification or redirect analyst attention.', families: ['FRUITSHELL', 'GUARDBREAKER'] },
  { id: 'A4', name: 'LLM-Tasked C2', description: 'An implant uses a hosted LLM as a live tasking channel, receiving operator instructions or autonomous attack orchestration via model responses.', families: ['CLOSEDQUORUM'] },
  { id: 'A5', name: 'LLM Infrastructure Supply Chain', description: "The actor backdoors a component of the victim's LLM infrastructure layer (proxy, SDK, gateway) to harvest all provider API keys.", families: ['TEAMPCP'] },
  { id: 'A6', name: 'AI Credential Harvester', description: 'Malware specifically targets LLM API keys, HuggingFace tokens, or AI service credentials belonging to the victim.', families: ['PROMPTSTEAL', 'QUIETVAULT', 'LAMEHUG'] },
  { id: 'A7', name: 'LLM-Augmented Offensive Tool', description: 'A conventional offensive tool augments its workflow with an LLM API call for content generation, OSINT, or recon tasking.', families: ['LAMEHUG'] },
  { id: 'A8', name: 'Malicious AI SDK / Package', description: 'A fake or backdoored package on npm/PyPI presents itself as an AI service SDK; activates on install.', families: ['QUIETVAULT'] },
  { id: 'A9', name: 'LLM-Assisted Worm', description: 'Combines classical network worm propagation with LLM-directed tasking and asynchronous C2 exfiltration.', families: [] },
  { id: 'A10', name: 'AI-Domain Decoy Traffic', description: 'Malware issues unauthenticated requests to AI provider endpoints as decoy traffic to misdirect sandbox analysis.', families: [] },
  { id: 'A11', name: 'Agentic AI Abuse Tool', description: "The LLM-driven autonomous agent loop is the product's core capability, and the product exists for an abusive purpose.", families: [] },
];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function loadText(relPath) {
  if (LOCAL_SOURCE) {
    return readFileSync(join(LOCAL_SOURCE, relPath), 'utf8');
  }
  const resp = await fetch(`${RAW_BASE}/${relPath}`);
  if (!resp.ok) throw new Error(`fetch ${relPath}: ${resp.status} ${resp.statusText}`);
  return await resp.text();
}

/**
 * Redact credential-shaped strings vendored from upstream research.
 *
 * Upstream family reports quote attacker/developer credentials verbatim
 * (e.g. CLOSEDQUORUM's `gohno-final.exe` build flags carried live
 * provider keys). Replicating them verbatim trips secret scanners and
 * redistributes potentially-live credentials, so builds redact to
 * prefix…suffix form (analyst-correlatable, scanner-safe). The
 * surrounding prose (which keys, where found, presumed-revoked status)
 * is preserved untouched.
 */
export function redactLeakedCredentials(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/AIza[0-9A-Za-z_-]{35}/g, (m) => `${m.slice(0, 8)}...${m.slice(-4)}`)
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, (m) => `${m.slice(0, 6)}...${m.slice(-4)}`);
}

// ─── YARA parsing (mirrors cairn/rules.py grammar subset) ────────────────
function ruleBlocks(text) {
  const blocks = [];
  const headerRe = /\brule\s+([^\s{]+)\s*\{/gi;
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const name = m[1];
    let depth = 1;
    let i = headerRe.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    blocks.push([name, text.slice(headerRe.lastIndex, i - 1)]);
  }
  return blocks;
}

function section(body, startMarker, endMarker) {
  const low = body.toLowerCase();
  const s = low.indexOf(startMarker);
  if (s < 0) throw new Error(`missing ${startMarker}`);
  const from = s + startMarker.length;
  if (!endMarker) return body.slice(from);
  const e = low.indexOf(endMarker, from);
  if (e < 0) throw new Error(`missing ${endMarker}`);
  return body.slice(from, e);
}

function decodeYaraString(v) {
  return v.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseMeta(metaBody) {
  const meta = {};
  for (const line of metaBody.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim().replace(/,$/, '');
    if (value.startsWith('"') && value.endsWith('"')) {
      meta[key] = decodeYaraString(value.slice(1, -1));
      continue;
    }
    const asInt = parseInt(value, 10);
    meta[key] = Number.isNaN(asInt) ? value : asInt;
  }
  return meta;
}

function parseStrings(stringsBody) {
  const out = [];
  const re = /^\s*(\$\w+)\s*=\s*"((?:\\.|[^"])*)"(.*)$/;
  for (const line of stringsBody.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    out.push({
      id: m[1],
      pattern: decodeYaraString(m[2]),
      nocase: /nocase/i.test(m[3]),
    });
  }
  return out;
}

function stripComments(text) {
  return text.replace(/\/\*.*?\*\//gs, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function tierOf(name, meta) {
  const t = String(meta.tier || '').toUpperCase();
  if (t === 'T1' || t === 'T2' || t === 'T3') return t;
  if (name.startsWith('T1-')) return 'T1';
  if (name.startsWith('T2-')) return 'T2';
  if (name.startsWith('T3-')) return 'T3';
  return 'T1';
}

function confidenceOf(v) {
  if (typeof v === 'number') return Math.max(0, Math.min(100, v));
  const n = String(v || '').trim().toLowerCase();
  if (n === 'high') return 90;
  if (n === 'medium') return 70;
  if (n === 'low') return 45;
  const asInt = parseInt(n, 10);
  return Number.isNaN(asInt) ? 70 : Math.max(0, Math.min(100, asInt));
}

function parseRules(text) {
  const rules = [];
  for (const [name, body] of ruleBlocks(text)) {
    const meta = parseMeta(section(body, 'meta:', 'strings:'));
    const strings = parseStrings(section(body, 'strings:', 'condition:'));
    const condition = stripComments(section(body, 'condition:', null)).trim().replace(/\s+/g, ' ');
    rules.push({ name, meta, strings, condition });
  }
  return rules;
}

// ─── Acquisition filters YAML (purpose-built subset parser) ──────────────
// Handles the file's uniform shape: `- name:` items with scalar fields plus
// `description: >` / `query_text: |` block scalars.
function parseFilters(yaml) {
  const filters = [];
  const lines = yaml.split('\n');
  let cur = null;
  let blockKey = null;
  let blockIndent = 0;
  let blockStyle = null;
  const flush = () => {
    if (cur) filters.push(cur);
    cur = null;
    blockKey = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (blockKey && (indent > blockIndent || !trimmed)) {
      const content = trimmed;
      if (blockStyle === '|') {
        cur[blockKey] = (cur[blockKey] ? cur[blockKey] + '\n' : '') + content;
      } else {
        cur[blockKey] = (cur[blockKey] ? cur[blockKey] + ' ' : '') + content;
      }
      continue;
    }
    blockKey = null;
    if (trimmed.startsWith('- name:')) {
      flush();
      cur = { query_text: '', description: '' };
      cur.name = trimmed.slice('- name:'.length).trim();
      continue;
    }
    if (!cur) continue;
    const m = trimmed.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (val === '>' || val === '|' || val === '>-' || val === '|-') {
      blockKey = key;
      blockIndent = indent;
      blockStyle = val[0];
      cur[blockKey] = '';
    } else if (key === 'enabled') {
      cur.enabled = val.trim() === 'true';
    } else if (key === 'default_limit' || key === 'min_detections') {
      cur[key] = parseInt(val.trim(), 10);
    } else {
      cur[key] = val.trim();
    }
  }
  flush();
  return filters.filter((f) => f.slug);
}

// ─── Family reports ─────────────────────────────────────────────────────
function familyField(body, label) {
  const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`));
  return m ? m[1].trim() : null;
}

function familySummary(body) {
  const m = body.match(/## Summary\s*\n([\s\S]*?)(?:\n## |\n---\n|$)/);
  const text = (m ? m[1] : body.slice(0, 1200)).replace(/[#*>`]/g, '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 600);
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const replicatedAt = new Date().toISOString().slice(0, 10);

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'rules'));
  ensureDir(join(OUT, 'families'));

  // 1. Rules
  const rulesText = await loadText('config/yara_rules.yar');
  const rules = parseRules(rulesText);
  if (rules.length === 0) throw new Error('no CAIRN rules parsed');

  const tierCounts = { T1: 0, T2: 0, T3: 0 };
  const slimRules = [];
  for (const r of rules) {
    const tier = tierOf(r.name, r.meta);
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    const full = {
      name: r.name,
      tier,
      confidence: confidenceOf(r.meta.confidence),
      artifactType: String(r.meta.artifact_type || 'artifact'),
      artifactClass: String(r.meta.artifact_class || r.name),
      description: String(r.meta.description || r.name),
      family: r.meta.family ? String(r.meta.family) : null,
      archetypes: r.meta.archetypes ? String(r.meta.archetypes) : null,
      reference: r.meta.reference ? String(r.meta.reference) : null,
      strings: r.strings,
      condition: r.condition,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      license: LICENSE,
    };
    writeFileSync(join(OUT, 'rules', `${r.name}.json`), JSON.stringify(full, null, 2) + '\n');
    slimRules.push({
      name: full.name,
      tier: full.tier,
      confidence: full.confidence,
      artifactClass: full.artifactClass,
      description: full.description,
      family: full.family,
      stringCount: full.strings.length,
    });
  }

  // 2. Filters
  const filtersYaml = await loadText('config/acquisition_filters.yaml');
  const filters = parseFilters(filtersYaml);
  const categories = [...new Set(filters.map((f) => f.category))].sort();
  writeFileSync(
    join(OUT, 'filters.json'),
    JSON.stringify(
      {
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        license: LICENSE,
        replicatedAt,
        total: filters.length,
        enabled: filters.filter((f) => f.enabled).length,
        categories,
        filters: filters.map((f) => ({
          name: f.name,
          slug: f.slug,
          category: f.category,
          enabled: !!f.enabled,
          defaultLimit: f.default_limit ?? 100,
          minDetections: f.min_detections ?? 5,
          description: (f.description || '').trim(),
          queryText: (f.query_text || '').trim(),
        })),
      },
      null,
      2,
    ) + '\n',
  );

  // 3. Archetypes
  writeFileSync(
    join(OUT, 'archetypes.json'),
    JSON.stringify({ source: SOURCE, sourceUrl: SOURCE_URL, license: LICENSE, replicatedAt, total: ARCHETYPES.length, archetypes: ARCHETYPES }, null, 2) + '\n',
  );

  // 4. Families
  const slimFamilies = [];
  for (const slug of FAMILY_SLUGS) {
    let body = null;
    try {
      // Redact at ingest so no emitted artifact ever carries a verbatim
      // credential, whatever the upstream report quotes.
      body = redactLeakedCredentials(await loadText(`docs/families/${slug}.md`));
    } catch {
      console.warn(`[cairn] family report missing upstream: ${slug}`);
      continue;
    }
    const titleMatch = body.match(/^#\s+(.+?)(?:\s+—\s+|\s+-\s+|\n)/);
    const full = {
      slug: slugify(slug),
      name: slug,
      title: titleMatch ? titleMatch[1].trim() : slug,
      aliases: familyField(body, 'Aliases'),
      firstSeen: familyField(body, 'First seen'),
      lastSeen: familyField(body, 'Last seen'),
      platform: familyField(body, 'Platform'),
      archetype: familyField(body, 'Archetype'),
      tlp: familyField(body, 'TLP'),
      summary: familySummary(body),
      body,
      source: SOURCE,
      sourceUrl: `${SOURCE_URL}/blob/main/docs/families/${slug}.md`,
      license: LICENSE,
    };
    writeFileSync(join(OUT, 'families', `${full.slug}.json`), JSON.stringify(full, null, 2) + '\n');
    slimFamilies.push({
      slug: full.slug,
      name: full.name,
      platform: full.platform,
      archetype: full.archetype,
      summary: full.summary,
    });
  }

  // 5. Index
  writeFileSync(
    join(OUT, 'index.json'),
    JSON.stringify(
      {
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        license: LICENSE,
        replicatedAt,
        counts: {
          rules: rules.length,
          t1: tierCounts.T1 || 0,
          t2: tierCounts.T2 || 0,
          t3: tierCounts.T3 || 0,
          filters: filters.length,
          filtersEnabled: filters.filter((f) => f.enabled).length,
          archetypes: ARCHETYPES.length,
          families: slimFamilies.length,
        },
        filterCategories: categories,
        rules: slimRules,
        families: slimFamilies,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `[cairn] rules=${rules.length} (T1=${tierCounts.T1} T2=${tierCounts.T2} T3=${tierCounts.T3}) filters=${filters.length} families=${slimFamilies.length} archetypes=${ARCHETYPES.length}`,
  );
}

const isMain = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    return resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch((e) => {
    console.error(`[cairn] build failed: ${e.message}`);
    process.exit(1);
  });
}
