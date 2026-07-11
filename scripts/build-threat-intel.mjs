#!/usr/bin/env node
/**
 * Build the Threat Intel manifest under public/data/threat-intel/.
 *
 * Reads from ./threat-intel-staging/ (created by
 * `node scripts/sync-threat-intel.mjs`) and emits:
 *   public/data/threat-intel/index.json          (slim — no bodies)
 *   public/data/threat-intel/cves/<CVE-ID>.json  (one per CVE)
 *   public/data/threat-intel/cves/kev.json       (CISA KEV snapshot)
 *   public/data/threat-intel/iocs/<slug>.json    (one per IOC family)
 *   public/data/threat-intel/sectors/<name>.json (one per sector brief)
 *
 * Scoring lives in worker/lib/threat-intel-manifest.ts (TypeScript) so
 * runtime reads + build reads share the same formula. We duplicate the
 * tiny score function in JS for build-time use; keep them in sync — the
 * runtime is the source of truth.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging');
const OUT = join(ROOT, 'public', 'data', 'threat-intel');

const SECTORS = ['financial', 'healthcare', 'government'];

// Same formula as worker/lib/threat-intel-manifest.ts (build-time copy).
// When argusHype (0-100) is provided, the weights shift from:
//   0.55*cvss + 0.35*kev + 0.10*recency  →  1.00 max
// to:
//   0.40*cvss + 0.35*kev + 0.10*recency + 0.15*(argusHype/100)  →  1.00 max
function computePriorityScore(cvssV3Score, inKev, publishedAt, argusHype = null, nowMs = Date.now()) {
  const cvssNorm = cvssV3Score == null ? 0 : Math.max(0, Math.min(1, cvssV3Score / 10));
  const kevBoost = inKev ? 0.35 : 0;
  const pub = Date.parse(publishedAt);
  let recency = 0;
  if (!isNaN(pub)) {
    const ageDays = (nowMs - pub) / 86_400_000;
    recency = Math.max(0, 1 - ageDays / 365);
  }
  const cvssWeight = argusHype != null ? 0.4 : 0.55;
  const argusBoost = argusHype != null ? 0.15 * Math.max(0, Math.min(1, argusHype / 100)) : 0;
  return Math.round(100 * (cvssWeight * cvssNorm + kevBoost + 0.1 * recency + argusBoost));
}

function severityFromScore(score) {
  if (score == null) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function safeFilename(slug) {
  return String(slug).replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function shortDesc(desc) {
  if (!desc) return '';
  return desc.length > 240 ? desc.slice(0, 237) + '…' : desc;
}

// ─── IOC extraction helpers (Tier 2) ──────────────────────────────────────

const RE_IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const RE_IPV6 = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;
const RE_DOMAIN = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;
const RE_ONION = /\b[a-z2-7]{16,56}\.onion\b/gi;
const RE_EMAIL = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const RE_MD5 = /\b[a-fA-F0-9]{32}\b/g;
const RE_SHA1 = /\b[a-fA-F0-9]{40}\b/g;
const RE_SHA256 = /\b[a-fA-F0-9]{64}\b/g;
const RE_CVE = /\bCVE-\d{4}-\d{4,}\b/gi;
const RE_URL = /https?:\/\/[^\s)>\]"']+/g;
const RE_DATE = /\b(\d{4}[-/.]\d{2}[-/.]\d{2})\b/g;

// RFC 5737 / documentation / example IPs to exclude
const DOC_IPS = new Set([
  '192.0.2.0', '192.0.2.1', '192.0.2.10', '192.0.2.42', '192.0.2.100', '192.0.2.200',
  '198.51.100.0', '198.51.100.1', '198.51.100.42', '198.51.100.100', '198.51.100.200',
  '203.0.113.0', '203.0.113.1', '203.0.113.42', '203.0.113.100', '203.0.113.200',
  '0.0.0.0', '255.255.255.255', '127.0.0.1',
]);

// Common false-positive domains
const FP_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'localhost.localdomain',
  'schema.org', 'www.w3.org', 'schemas.openxmlformats.org',
  'schemas.microsoft.com', 'purl.org', 'xmlns.com',
]);

// Code file extensions that look like TLDs but aren't domains
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala',
  'c', 'cpp', 'h', 'hpp', 'cs', 'swift',
  'sh', 'bash', 'zsh', 'fish',
  'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'txt',
  'md', 'rst', 'adoc',
  'sql', 'graphql', 'gql',
  'css', 'scss', 'less', 'sass',
  'html', 'htm', 'vue', 'svelte',
  'wasm', 'so', 'dll', 'dylib',
  'lock', 'sum', 'mod',
]);

function isValidIocIp(ip) {
  if (DOC_IPS.has(ip)) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  // Exclude private / loopback / link-local
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

function isValidDomain(d) {
  const lower = d.toLowerCase();
  if (FP_DOMAINS.has(lower)) return false;
  // Exclude common false positives
  if (lower.endsWith('.local') || lower.endsWith('.internal') || lower.endsWith('.example')) return false;
  // Exclude code file extensions (file.ts, index.js, etc.)
  const parts = lower.split('.');
  if (parts.length >= 2) {
    const tld = parts[parts.length - 1];
    if (CODE_EXTENSIONS.has(tld)) return false;
  }
  return true;
}

function extractIndicators(text) {
  const indicators = [];
  const seen = new Set();

  function add(type, value) {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    indicators.push({ type, value, firstSeen: null, confidence: 'medium' });
  }

  // SHA-256 (check first — most specific)
  for (const m of text.matchAll(RE_SHA256)) add('sha256', m[0].toLowerCase());
  // SHA-1
  for (const m of text.matchAll(RE_SHA1)) {
    if (!seen.has(`sha256:${m[0].toLowerCase()}`)) add('sha1', m[0].toLowerCase());
  }
  // MD5 (skip if already seen as sha256 prefix)
  for (const m of text.matchAll(RE_MD5)) {
    if (!seen.has(`sha256:${m[0].toLowerCase()}`) && !seen.has(`sha1:${m[0].toLowerCase()}`)) {
      add('md5', m[0].toLowerCase());
    }
  }
  // IPv4
  for (const m of text.matchAll(RE_IPV4)) {
    if (isValidIocIp(m[0])) add('ipv4', m[0]);
  }
  // IPv6
  for (const m of text.matchAll(RE_IPV6)) add('ipv6', m[0]);
  // .onion URLs
  for (const m of text.matchAll(RE_ONION)) add('onion', m[0].toLowerCase());
  // Domains (filter false positives)
  for (const m of text.matchAll(RE_DOMAIN)) {
    if (isValidDomain(m[0])) add('domain', m[0].toLowerCase());
  }
  // Email addresses
  for (const m of text.matchAll(RE_EMAIL)) add('email', m[0].toLowerCase());
  // CVEs
  for (const m of text.matchAll(RE_CVE)) add('cve', m[0].toUpperCase());

  return indicators;
}

function extractReferences(text) {
  const refs = [];
  const seen = new Set();
  for (const m of text.matchAll(RE_URL)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    refs.push(url);
  }
  return refs.slice(0, 20);
}

function extractFirstSeen(text) {
  const dates = [];
  for (const m of text.matchAll(RE_DATE)) {
    const d = Date.parse(m[1].replace(/\//g, '-'));
    if (!isNaN(d)) dates.push(new Date(d).toISOString());
  }
  return dates.length > 0 ? dates.sort()[0] : null;
}

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-threat-intel.mjs first.');
  process.exit(1);
}

// Wipe and rebuild the manifest tree.
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
ensureDir(join(OUT, 'cves'));
ensureDir(join(OUT, 'iocs'));
ensureDir(join(OUT, 'sectors'));

// ─── CISA KEV ──────────────────────────────────────────────────────────
const kevJson = readJsonIfExists(join(STAGING, 'kev.json'));
const kevList = kevJson?.vulnerabilities ?? [];
const kevByCve = new Map();
for (const v of kevList) {
  kevByCve.set(v.cveID, {
    cveId: v.cveID,
    vendor: v.vendorProject ?? 'Unknown',
    product: v.product ?? 'Unknown',
    name: v.shortDescription ?? v.vulnerabilityName ?? '',
    dateAdded: v.dateAdded ?? null,
    shortDescription: v.shortDescription ?? '',
    requiredAction: v.requiredAction ?? '',
    dueDate: v.dueDate ?? null,
  });
}
writeFileSync(join(OUT, 'cves', 'kev.json'), JSON.stringify(kevList.map((v) => kevByCve.get(v.cveID))));

// ─── Argus trending feed ──────────────────────────────────────────────
const argusRaw = readJsonIfExists(join(STAGING, 'argus-trending.json'));
const argusByCve = new Map();
if (argusRaw && Array.isArray(argusRaw.cves)) {
  for (const cve of argusRaw.cves) {
    argusByCve.set(cve.cve_id.toUpperCase(), {
      hype: cve.hype ?? 0,
      rising: cve.rising ?? 0,
      reposCount: cve.repos?.count ?? 0,
      reposStars: cve.repos?.stars ?? 0,
    });
  }
  console.log(`    ${argusByCve.size} Argus-trending CVEs loaded`);
} else {
  console.log('    no Argus trending data — continuing without it');
}

// ─── NVD recent ───────────────────────────────────────────────────────
const nvdJson = readJsonIfExists(join(STAGING, 'nvd-recent.json'));
const nvdItems = nvdJson?.vulnerabilities ?? [];
const cveIndex = [];
const cvesWritten = 0;
for (const v of nvdItems) {
  const id = v.cve?.id;
  if (!id) continue;
  const metrics = v.cve?.metrics?.cvssMetricV31?.[0]?.cvssData ?? v.cve?.metrics?.cvssMetricV30?.[0]?.cvssData ?? null;
  const cvssScore = metrics?.baseScore ?? null;
  const cvssVector = metrics?.vectorString ?? null;
  const cvssSeverity = (metrics?.baseSeverity ?? severityFromScore(cvssScore)).toLowerCase();
  const descriptions = v.cve?.descriptions ?? [];
  const en = descriptions.find((d) => d.lang === 'en') ?? descriptions[0];
  const description = shortDesc(en?.value ?? '');
  const refs = (v.cve?.references ?? []).slice(0, 20).map((r) => ({
    url: r.url, source: r.source ?? '', tags: r.tags ?? [],
  }));
  const cwes = (v.cve?.weaknesses ?? []).flatMap((w) => w.description ?? []).map((d) => d.value).filter(Boolean);
  // Tier 2: Extract vendor/product from KEV cross-reference
  const kevEntry = kevByCve.get(id);
  const vendor = v.cve?.vendor || kevEntry?.vendor || null;
  const product = kevEntry?.product || null;
  const inKev = kevByCve.has(id);
  const inKevSince = inKev ? kevByCve.get(id).dateAdded : null;
  const publishedAt = v.cve?.published ?? '';
  const lastModifiedAt = v.cve?.lastModified ?? '';
  const argusData = argusByCve.get(id.toUpperCase());
  const argusHype = argusData?.hype ?? null;
  const argusRising = argusData?.rising ?? null;
  const priorityScore = computePriorityScore(cvssScore, inKev, publishedAt || lastModifiedAt, argusHype);
  const indexEntry = {
    cveId: id, publishedAt, lastModifiedAt,
    cvssV3Score: cvssScore, cvssV3Severity: cvssSeverity,
    vendor, product, inKev, inKevSince, priorityScore, description,
    sizeBytes: description.length,
    argusHypeScore: argusHype,
    argusRising,
  };
  cveIndex.push(indexEntry);
  const body = {
    ...indexEntry,
    cvssVector, cweIds: cwes, references: refs,
    bsiDescription: null, // populated only when BSI CERT-Bund feed ships
    llmSummary: null,
    llmRecommendedAction: null,
  };
  writeFileSync(join(OUT, 'cves', `${safeFilename(id)}.json`), JSON.stringify(body));
}

// Sort cveIndex by priorityScore desc, then publishedAt desc.
cveIndex.sort((a, b) => b.priorityScore - a.priorityScore || (b.publishedAt > a.publishedAt ? 1 : -1));

// ─── Daily-Hunt IOC families ───────────────────────────────────────────
const dhRoot = join(STAGING, 'daily-hunt');
const iocIndex = [];
function walkDHTopLevel(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    const fp = join(dir, n);
    if (!statSync(fp).isFile()) return false;
    // Daily-Hunt stores each IOC family as a top-level file (with optional
    // space in the filename). Exclude hidden + README + LICENSE.
    if (n.startsWith('.')) return false;
    if (n === 'README.md' || n === 'LICENSE') return false;
    return true;
  });
}
const dhFiles = walkDHTopLevel(dhRoot);
for (const name of dhFiles) {
  const fp = join(dhRoot, name);
  const text = readFileSync(fp, 'utf8');
  // Heuristic category mapping from filename keywords.
  const lower = name.toLowerCase();
  let category = 'other';
  if (lower.includes('ransomware')) category = 'ransomware';
  else if (lower.includes('stealer') || lower.includes('infostealer')) category = 'stealer';
  else if (lower.includes('phish') || lower.includes('kit')) category = 'phishing';
  else if (lower.includes('c2')) category = 'c2';
  else if (lower.includes('apt') || lower.includes('kimsuky') || lower.includes('lazarus')) category = 'apt';
  else if (lower.includes('backdoor') || lower.includes('trojan') || lower.includes('worm')) category = 'malware';

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
  if (!slug) continue;
  const aliases = [];
  const mitreTechniques = [];
  // Cheap regex extraction — the upstream files have variable formats.
  for (const m of text.matchAll(/T1\d{3}(?:\.\d{3})?/g)) mitreTechniques.push(m[0]);
  const description = shortDesc(text.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '');
  // Tier 2: Extract structured IOCs from Daily-Hunt markdown
  const indicators = extractIndicators(text);
  const references = extractReferences(text);
  const firstSeen = extractFirstSeen(text);

  const iocEntry = {
    slug, family: name.replace(/\.[a-z]+$/i, ''), category, aliases,
    firstSeen, mitreTechniques: Array.from(new Set(mitreTechniques)).slice(0, 12),
    indicatorCount: indicators.length || (text.match(/^\s*(?:[a-f0-9]{32,64}|\d{1,3}(?:\.\d{1,3}){3}|[A-Z0-9-]{8,})\s*$/gim) || []).length,
    description, sizeBytes: text.length,
  };
  iocIndex.push(iocEntry);
  const body = {
    ...iocEntry,
    indicators,
    context: text.slice(0, 4096),
    references,
    llmSummary: null,
  };
  writeFileSync(join(OUT, 'iocs', `${safeFilename(slug)}.json`), JSON.stringify(body));
}
iocIndex.sort((a, b) => a.family.localeCompare(b.family));

// ─── Sector briefs (skeleton) ──────────────────────────────────────────
// Briefs are static stubs built from the current KEV window. The intent
// was to enrich them via a Workers AI LLM call at sync time (see
// scripts/render-threat-intel-briefs.mjs, not yet implemented). Stubs
// prevent REST + MCP routes from 404ing.
for (const sector of SECTORS) {
  const top = cveIndex.filter((c) => c.inKev).slice(0, 8);
  const body = {
    sector,
    title: `${sector[0].toUpperCase()}${sector.slice(1)} sector brief`,
    generatedAt: new Date().toISOString().slice(0, 10),
    topCount: top.length,
    preview: top.length ? `${top[0].cveId} (${top[0].cvssV3Severity ?? 'unknown'}) leads with priority ${top[0].priorityScore}.` : 'No KEV-flagged CVEs in the current window.',
    sizeBytes: 0,
    executiveSummary: 'Brief generation runs as a separate step (see scripts/render-threat-intel-briefs.mjs).',
    topThreats: top.map((c) => ({
      cveId: c.cveId,
      title: c.description.slice(0, 120),
      relevance: 'broadly-critical',
      risk: `CVSS ${c.cvssV3Score ?? 'unknown'}; ${c.inKev ? 'actively exploited' : 'not in KEV'}.`,
      recommendedAction: 'Patch within the CISA KEV due date; verify compensating controls.',
    })),
  };
  body.sizeBytes = JSON.stringify(body).length;
  writeFileSync(join(OUT, 'sectors', `${sector}.json`), JSON.stringify(body));
}

// ─── Index ─────────────────────────────────────────────────────────────
const index = {
  source: 'synthetic (OpenThreat + cyber_threat_intel + Daily-Hunt references)',
  license: 'MIT',
  replicatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    cves: cveIndex.length,
    iocs: iocIndex.length,
    sectors: SECTORS.length,
    kevTotal: kevList.length,
  },
  lastSyncedAt: new Date().toISOString(),
  cveIndex,
  iocIndex,
  sectors: SECTORS.map((s) => {
    const body = JSON.parse(readFileSync(join(OUT, 'sectors', `${s}.json`), 'utf8'));
    return {
      sector: s,
      title: body.title,
      generatedAt: body.generatedAt,
      topCount: body.topCount,
      preview: body.preview,
      sizeBytes: body.sizeBytes,
    };
  }),
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('✔ Built:');
console.log(`    ${cveIndex.length} CVEs       (public/data/threat-intel/cves/)`);
console.log(`    ${kevList.length} KEV       (public/data/threat-intel/cves/kev.json)`);
console.log(`    ${iocIndex.length} IOC families (public/data/threat-intel/iocs/)`);
console.log(`    ${SECTORS.length} sector briefs (public/data/threat-intel/sectors/)`);
console.log(`    1 slim index              (public/data/threat-intel/index.json)`);
