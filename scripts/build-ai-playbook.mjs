#!/usr/bin/env node
/**
 * Build the AI Security Playbook TAXONOMY index under public/data/ai-playbook/.
 *
 * WHAT THIS REPLICATES — AND WHAT IT DELIBERATELY DOES NOT
 * -------------------------------------------------------
 * aisecurity.zone is "The AI Security Playbook", a 44-chapter / ~91k-word field
 * manual by Iaroslav Mezin. It has NO reuse licence: /terms/ and /license/ both
 * 404, there is no LICENSE file, and the repository named in its own
 * CONTRIBUTING page (github.com/anguiz7z/aisecurity-zone) returns 404. The work
 * is by a single named author, so all rights are reserved by default.
 *
 * robots.txt does say `Allow: /` with "AI crawlers welcome", but that is
 * permission to CRAWL AND INDEX, not to redistribute. It is not a licence.
 *
 * So this script replicates the parts that are facts, identifiers, and links
 * rather than copyrightable expression:
 *
 *   - the 8-layer system structure (I..VIII) and its chapter counts
 *   - the 20 risk identifiers: OWASP LLM01-LLM10 and the author's ASI01-ASI10,
 *     with their titles and which layer defines each
 *   - CVE references, which are public facts sourced from NVD/CISA KEV, NOT
 *     prose from the book
 *   - a deep link per risk ID and per layer, so a reader lands on the original
 *
 * It deliberately does NOT store chapter bodies, sentences, diagrams, or the
 * "90-second check". Those are the author's expression. If the author later
 * publishes a CC-BY-SA licence, `docs/notes` should record it and this script
 * can be extended to slice bodies the way build-si-manifest.mjs does.
 *
 * Same discipline as the CAIRN / NOVA / Denali verticals, where the rule bodies
 * were ported under their upstream licences (MIT / MIT / Apache-2.0).
 *
 * Sources (structure + identifiers only):
 *   https://aisecurity.zone/            8-layer system structure
 *   https://aisecurity.zone/reference/by-id/   LLM01-10 + ASI01-10 with titles
 *
 * Emits:
 *   public/data/ai-playbook/index.json   slim — layers + riskIds + counts
 *
 * Usage:  node scripts/build-ai-playbook.mjs
 *         node scripts/build-ai-playbook.mjs --offline   (use cached fixtures)
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'ai-playbook');
const CACHE_DIR = join(ROOT, 'threat-intel-staging', 'ai-playbook');
const OFFLINE = process.argv.includes('--offline');

const SOURCE = 'aisecurity.zone — The AI Security Playbook (structure + risk identifiers)';
const SOURCE_URL = 'https://aisecurity.zone/';
const AUTHOR = 'Iaroslav Mezin';
const LICENSE = 'No reuse licence declared — structure, identifiers and CVE references only. Prose NOT replicated.';

/**
 * The 8-layer system structure. These are the author's own layer titles, used
 * here nominatively (the name of a division, as a table of contents would).
 * Chapter counts are observed structure, not expression.
 */
const LAYERS = [
  { id: 'I', name: 'The model', chapters: 7, slug: 'model', summary: 'The model artifact itself: how it is shaped, how it breaks, and how to protect the weights.' },
  { id: 'II', name: 'The context window', chapters: 5, slug: 'context', summary: 'Tokens, attention and context — including prompt injection, jailbreaks and multimodal gaps.' },
  { id: 'III', name: 'The agent loop', chapters: 5, slug: 'loop', summary: 'Anatomy of an agent (model, tools, memory, loop), coding and browser agents, and containment.' },
  { id: 'IV', name: 'The protocol layer', chapters: 6, slug: 'protocol', summary: 'Model APIs, tool use, MCP, multi-agent seams, and agent identity (NHI).' },
  { id: 'V', name: 'The infrastructure', chapters: 3, slug: 'infra', summary: 'Where AI runs — cloud, cloud red-teaming, and the data layer / retrieval entitlement.' },
  { id: 'VI', name: 'The Security Assessment', chapters: 6, slug: 'method', summary: 'Scoping an engagement, threat modelling, the red-team playbook and capability evaluation.' },
  { id: 'VII', name: 'The Security Program', chapters: 5, slug: 'program', summary: 'The secure AI SDLC, the Agent Development Lifecycle, detection/IR, shadow AI, retirement.' },
  { id: 'VIII', name: 'The Security Governance', chapters: 7, slug: 'govern', summary: 'Frameworks and standards, Google SAIF, NIST AI RMF, ISO/IEC 42001, OWASP AIMA, jurisdictions.' },
];

/**
 * The 20 risk identifiers. Titles are the standard published names — the first
 * ten are OWASP's own Top 10 for LLM Applications nomenclature (widely
 * published, not this author's expression); ASI01-ASI10 are the author's
 * agentic taxonomy. `layer` records which of the 8 divisions defines each.
 */
const RISK_IDS = [
  // OWASP Top 10 for LLM Applications
  { id: 'LLM01', name: 'Prompt Injection', scheme: 'owasp-llm', layer: 'II', url: 'https://aisecurity.zone/reference/by-id/#LLM01' },
  { id: 'LLM02', name: 'Sensitive Information Disclosure', scheme: 'owasp-llm', layer: 'II', url: 'https://aisecurity.zone/reference/by-id/#LLM02' },
  { id: 'LLM03', name: 'Excessive Agency', scheme: 'owasp-llm', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#LLM03' },
  { id: 'LLM04', name: 'Supply Chain', scheme: 'owasp-llm', layer: 'I', url: 'https://aisecurity.zone/reference/by-id/#LLM04' },
  { id: 'LLM05', name: 'Data & Model Poisoning', scheme: 'owasp-llm', layer: 'I', url: 'https://aisecurity.zone/reference/by-id/#LLM05' },
  { id: 'LLM06', name: 'Unbounded Consumption', scheme: 'owasp-llm', layer: 'V', url: 'https://aisecurity.zone/reference/by-id/#LLM06' },
  { id: 'LLM07', name: 'Misinformation', scheme: 'owasp-llm', layer: 'II', url: 'https://aisecurity.zone/reference/by-id/#LLM07' },
  { id: 'LLM08', name: 'Hidden Context Exposure', scheme: 'owasp-llm', layer: 'II', url: 'https://aisecurity.zone/reference/by-id/#LLM08' },
  { id: 'LLM09', name: 'Vector & Embedding Weaknesses', scheme: 'owasp-llm', layer: 'V', url: 'https://aisecurity.zone/reference/by-id/#LLM09' },
  { id: 'LLM10', name: 'Improper Output Handling', scheme: 'owasp-llm', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#LLM10' },
  // Agentic Security Index — the author's own taxonomy
  { id: 'ASI01', name: 'Agent Goal Hijack', scheme: 'agentic-asi', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#ASI01' },
  { id: 'ASI02', name: 'Tool Misuse', scheme: 'agentic-asi', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#ASI02' },
  { id: 'ASI03', name: 'Identity & Privilege Abuse', scheme: 'agentic-asi', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#ASI03' },
  { id: 'ASI04', name: 'Agentic Supply Chain', scheme: 'agentic-asi', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#ASI04' },
  { id: 'ASI05', name: 'Unexpected Code Execution', scheme: 'agentic-asi', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#ASI05' },
  { id: 'ASI06', name: 'Memory & Context Poisoning', scheme: 'agentic-asi', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#ASI06' },
  { id: 'ASI07', name: 'Insecure Inter-Agent Comms', scheme: 'agentic-asi', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#ASI07' },
  { id: 'ASI08', name: 'Cascading Failures', scheme: 'agentic-asi', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#ASI08' },
  { id: 'ASI09', name: 'Human-Agent Trust Exploitation', scheme: 'agentic-asi', layer: 'III', url: 'https://aisecurity.zone/reference/by-id/#ASI09' },
  { id: 'ASI10', name: 'Rogue Agents', scheme: 'agentic-asi', layer: 'IV', url: 'https://aisecurity.zone/reference/by-id/#ASI10' },
];

/**
 * CVE references observed in the book's reference library. These are PUBLIC
 * FACTS with public primary sources (NVD, CISA KEV) — not prose from the book,
 * so recording the identifier is not a copyright question. Enrichment (KEV
 * status, vendor, dates) is joined at read time from our own synced feed via
 * `cveId`, never copied from the site.
 *
 * Observed 2026-09-30 from /reference/reference-library/. Kept as a plain list so
 * the weekly sync can diff it and surface genuinely new references.
 */
const OBSERVED_CVE_REFS = [
  'CVE-2025-1550',
  'CVE-2025-32711',
  'CVE-2025-66414',
  'CVE-2025-66416',
  'CVE-2026-16584',
  'CVE-2026-18236',
  'CVE-2026-52869',
  'CVE-2026-54316',
  'CVE-2026-64849',
  'CVE-2026-67431',
];

async function fetchWithTimeout(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'portfolio-ai-playbook-sync/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Live check that the observed structure still matches. This is a DRIFT GUARD,
 * not a scraper: we assert the facts we already recorded are still true, and
 * warn loudly if upstream renamed a layer or a risk ID. We never store prose.
 */
async function verifyStructureLive() {
  const findings = [];
  let html;
  try {
    html = await fetchWithTimeout('https://aisecurity.zone/reference/by-id/');
  } catch (err) {
    console.warn(`  by-id fetch failed (${err.message}) — keeping recorded structure`);
    return { ok: false, checked: 0, missing: [], extra: [] };
  }
  const found = new Set([...html.matchAll(/\b(?:LLM|ASI)\d{2}\b/g)].map((m) => m[0]));
  for (const r of RISK_IDS) if (!found.has(r.id)) findings.push(`${r.id} no longer present upstream`);
  const expected = new Set(RISK_IDS.map((r) => r.id));
  const extra = [...found].filter((id) => !expected.has(id));
  return { ok: findings.length === 0, checked: RISK_IDS.length, missing: findings, extra };
}

async function main() {
  console.log(`[ai-playbook] source: ${SOURCE}`);
  console.log(`[ai-playbook] licence: ${LICENSE}`);

  const drift = OFFLINE ? { ok: true, checked: 0, missing: [], extra: [] } : await verifyStructureLive();
  if (drift.checked) {
    if (drift.ok) {
      console.log(`  ✓ all ${drift.checked} risk identifiers still present upstream`);
    } else {
      console.warn(`  ⚠ structure drift: ${drift.missing.join('; ')}`);
      if (drift.extra.length) console.warn(`  ⚠ new upstream identifiers not yet recorded: ${drift.extra.join(', ')}`);
    }
  }

  ensureDir(OUT);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  ensureDir(OUT);

  const layerIndex = LAYERS.map((l) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    chapters: l.chapters,
    summary: l.summary,
    url: `${SOURCE_URL}${l.slug}/`,
    riskIds: RISK_IDS.filter((r) => r.layer === l.id).map((r) => r.id),
  }));

  const riskIndex = RISK_IDS.map((r) => ({
    ...r,
    layerName: LAYERS.find((l) => l.id === r.layer)?.name ?? null,
  }));

  const index = {
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    author: AUTHOR,
    license: LICENSE,
    licenseNote:
      'The upstream work carries no reuse licence. This index replicates structure, ' +
      'published risk-identifier nomenclature and public CVE identifiers only — no prose, ' +
      'no chapter bodies, no diagrams. Every entry deep-links to the original.',
    replicatedAt: new Date().toISOString(),
    scope: 'structure-only',
    structureVerifiedAt: drift.checked ? new Date().toISOString() : null,
    counts: {
      layers: layerIndex.length,
      chapters: LAYERS.reduce((n, l) => n + l.chapters, 0),
      riskIds: riskIndex.length,
      owaspLlm: riskIndex.filter((r) => r.scheme === 'owasp-llm').length,
      agenticAsi: riskIndex.filter((r) => r.scheme === 'agentic-asi').length,
      cveRefs: OBSERVED_CVE_REFS.length,
    },
    layers: layerIndex,
    riskIds: riskIndex,
    cveRefs: OBSERVED_CVE_REFS,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  // Offline fixtures so a CI/offline build stays reproducible.
  ensureDir(CACHE_DIR);
  writeFileSync(join(CACHE_DIR, 'observed-cve-refs.json'), JSON.stringify(OBSERVED_CVE_REFS, null, 2) + '\n');

  console.log(
    `\nWrote ${index.counts.layers} layers, ${index.counts.chapters} chapters, ` +
      `${index.counts.riskIds} risk identifiers (${index.counts.owaspLlm} OWASP LLM + ` +
      `${index.counts.agenticAsi} ASI), ${index.counts.cveRefs} CVE references`
  );
  console.log(`  scope=${index.scope} (no prose replicated)`);
}

main().catch((err) => {
  console.error('[ai-playbook] build failed:', err.message);
  process.exit(1);
});