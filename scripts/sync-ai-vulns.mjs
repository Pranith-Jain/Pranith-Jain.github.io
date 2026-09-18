#!/usr/bin/env node
/**
 * Sync Tier-1 realtime AI vulnerability/advisory/research sources into staging.
 *
 * Companion to scripts/sync-ai-security.mjs (escape parity + matrix +
 * incidentDB). Each collector is isolated — one flaky upstream never aborts
 * the others. All sources are keyless.
 *
 * Collectors:
 *   vulns.json —
 *     - ENISA EUVD search API (AI anchor terms) + exploited list
 *     - EUVD consolidated KEV dump (CISA + EU KEV, daily)
 *     - NVD 2.0 keyword search (AI terms, 7s pacing for keyless rate)
 *     - OSV.dev query over an AI package watchlist (PyPI + npm)
 *     - FIRST EPSS batch enrichment for collected CVE IDs (cap 100)
 *   advisories.json —
 *     - CVEProject cvelistV5 commit Atom (AI-keyword filtered CVE firehose)
 *     - Tool release/commit Atoms (garak, PyRIT, promptfoo, litellm, vllm,
 *       ollama, langchain, mcp python-sdk, mitre-atlas, OWASP GenAI trio)
 *     - ExploitDB RSS (AI-keyword filtered PoCs)
 *   research.json —
 *     - hacktron.ai/rss.xml (kept whole, capped — AI-security research shop)
 *     - Unit42, CSA, BleepingComputer RSS (AI-keyword filtered)
 *
 * Staging: threat-intel-staging/ai-security/{vulns,advisories,research}.json
 *
 * Run:  node scripts/sync-ai-security.mjs && node scripts/sync-ai-vulns.mjs
 * Then: node scripts/build-ai-security.mjs
 */
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'threat-intel-staging', 'ai-security');

const UA = 'pranithjain-ai-security-sync/1.0 (+https://pranithjain.qzz.io)';

/** Lowercase match terms for AI-relevance filtering. */
const AI_TERMS = [
  'llm', 'gpt', 'Muse', 'gemini', 'copilot', 'agent', 'mcp', 'a2a', 'rag',
  'prompt', 'jailbreak', 'transformer', 'diffusion', 'embedding', 'chatbot',
  'langchain', 'litellm', 'vllm', 'ollama', 'whisper', 'huggingface',
  'pytorch', 'tensorflow', 'keras', 'onnx', 'mlflow', 'kubeflow', 'nvidia',
  'triton', 'tensorrt', 'safetensors', 'pickle', 'jupyter', 'gradio',
  'libheif', 'heif', 'avif', 'libde265', 'garak', 'pyrit', 'promptfoo',
  'bedrock', 'vertex', 'mistral', 'llama', 'qwen', 'deepseek', 'grok',
  'cohere', 'anthropic', 'openai', 'midjourney', 'elevenlabs', 'heygen',
  'synthesia', 'pinecone', 'weaviate', 'milvus', 'chromadb', 'inference',
  'deepfake', 'voice clone', 'text-to-speech', 'image generator',
];

const EUVD_ANCHORS = ['litellm', 'vllm', 'langchain', 'mcp', 'ollama', 'llm', 'transformer', 'diffusion'];
const NVD_TERMS = ['litellm', 'vllm', 'langchain', 'mcp'];

/** [ecosystem, package] watchlist for OSV.dev. */
const OSV_WATCHLIST = [
  ['PyPI', 'litellm'], ['PyPI', 'vllm'], ['PyPI', 'transformers'],
  ['PyPI', 'langchain'], ['PyPI', 'langchain-core'], ['PyPI', 'mcp'],
  ['PyPI', 'ollama'], ['PyPI', 'huggingface_hub'], ['PyPI', 'torch'],
  ['PyPI', 'tensorflow'], ['PyPI', 'keras'], ['PyPI', 'mlflow'],
  ['PyPI', 'onnx'], ['PyPI', 'safetensors'], ['PyPI', 'gradio'],
  ['PyPI', 'diffusers'], ['PyPI', 'sentence-transformers'], ['PyPI', 'chromadb'],
  ['PyPI', 'openai'], ['PyPI', 'anthropic'],
  ['npm', 'sharp'],
];

/** [ecosystem, package] subset for the GitHub Advisory affects lookup. */
const GHSA_AFFECTS = [
  ['pip', 'litellm'], ['pip', 'vllm'], ['pip', 'transformers'],
  ['pip', 'langchain'], ['pip', 'mcp'], ['pip', 'ollama'],
  ['pip', 'huggingface_hub'], ['pip', 'torch'], ['npm', 'sharp'],
];

/** [source label, atom url, keep] tool + framework feeds. */
const TOOL_ATOMS = [
  ['garak', 'https://github.com/NVIDIA/garak/releases.atom', 5],
  ['pyrit', 'https://github.com/Azure/PyRIT/commits/main.atom', 5],
  ['promptfoo', 'https://github.com/promptfoo/promptfoo/releases.atom', 5],
  ['litellm', 'https://github.com/BerriAI/litellm/releases.atom', 5],
  ['vllm', 'https://github.com/vllm-project/vllm/releases.atom', 5],
  ['ollama', 'https://github.com/ollama/ollama/releases.atom', 5],
  ['langchain', 'https://github.com/langchain-ai/langchain/releases.atom', 5],
  ['mcp-sdk', 'https://github.com/modelcontextprotocol/python-sdk/commits/main.atom', 5],
  ['mitre-atlas', 'https://github.com/mitre-atlas/atlas-data/commits/main.atom', 5],
  ['owasp-llm-top10', 'https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/commits/main.atom', 8],
  ['owasp-threat-intel', 'https://github.com/GenAI-Security-Project/GenAI-Threat-Intelligence-Initiative/commits/main.atom', 8],
  ['owasp-acs', 'https://github.com/GenAI-Security-Project/agent-control-standard/commits/main.atom', 8],
];

const RESEARCH_FEEDS = [
  { source: 'hacktron', url: 'https://hacktron.ai/rss.xml', filter: false, cap: 50 },
  { source: 'unit42', url: 'https://unit42.paloaltonetworks.com/feed/', filter: true, cap: 40 },
  { source: 'csa', url: 'https://cloudsecurityalliance.org/blog/feed', filter: true, cap: 40 },
  { source: 'bleepingcomputer', url: 'https://www.bleepingcomputer.com/feed/', filter: true, cap: 40 },
];

function ensureStaging() {
  mkdirSync(STAGING, { recursive: true });
}

async function fetchText(url, accept = '*/*', extraHeaders = {}) {
  const headers = { 'user-agent': UA, accept, ...extraHeaders };
  if (process.env.NVD_API_KEY && url.includes('services.nvd.nist.gov')) {
    headers.apiKey = process.env.NVD_API_KEY;
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fetch failed: ${url} → ${res.status} ${res.statusText}`);
  return await res.text();
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`POST failed: ${url} → ${res.status} ${res.statusText}`);
  return await res.json();
}

function kwMatch(text) {
  const t = String(text ?? '').toLowerCase();
  return AI_TERMS.some((k) => t.includes(k));
}

function splitIds(s) {
  return String(s ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

function cveIdsOf(text) {
  return [...String(text ?? '').matchAll(/CVE-\d{4}-\d{4,7}/g)].map((m) => m[0]);
}

function stripTags(s) {
  return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseAtomEntries(xml) {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/) ?? [])[1] ?? '';
    const link = (body.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] ?? '';
    const updated = (body.match(/<(updated|published)[^>]*>([^<]+)<\//) ?? [])[2] ?? null;
    const id = (body.match(/<id[^>]*>([^<]+)<\//) ?? [])[1] ?? link;
    if (!title && !link) continue;
    out.push({ id: stripTags(id), title: stripTags(title), link, updated });
  }
  return out;
}

function parseRssItems(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const pick = (tag) => {
      const mm = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!mm) return '';
      return mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };
    out.push({
      guid: pick('guid') || pick('link'),
      title: stripTags(pick('title')),
      link: pick('link'),
      pubDate: pick('pubDate') || null,
      description: stripTags(pick('description')).slice(0, 500),
    });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncVulns() {
  console.log(' [1/3] vulns (EUVD + KEV + NVD + OSV + EPSS)…');
  const byId = new Map(); // id -> record
  const upsert = (id, patch) => {
    if (!id) return;
    const prev = byId.get(id) ?? { id, sources: [], aliases: [], packages: [] };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'sources' || k === 'aliases' || k === 'packages') {
        prev[k] = [...new Set([...(prev[k] ?? []), ...(v ?? [])])];
      } else if (v !== undefined && v !== null && v !== '' && (prev[k] === undefined || prev[k] === null || prev[k] === '')) {
        prev[k] = v;
      }
    }
    byId.set(id, prev);
  };

  // EUVD anchor-term search (aliases/references are newline-separated strings).
  let euvdHits = 0;
  for (const term of EUVD_ANCHORS) {
    try {
      const items = JSON.parse(await fetchText(
        `https://euvdservices.enisa.europa.eu/api/search?text=${encodeURIComponent(term)}&size=100`,
        'application/json'
      )).items ?? [];
      for (const it of items) {
        euvdHits++;
        const aliases = splitIds(it.aliases);
        upsert(aliases.find((a) => a.startsWith('CVE-')) ?? it.id, {
          sources: ['euvd'],
          title: (it.description ?? it.id).slice(0, 240),
          description: it.description ?? '',
          severity: it.baseScore != null ? `${it.baseScore}${it.baseScoreVersion ? ` (${it.baseScoreVersion})` : ''}` : null,
          cvssBase: typeof it.baseScore === 'number' ? it.baseScore : null,
          epss: typeof it.epss === 'number' ? it.epss : undefined,
          published: it.datePublished ?? null,
          link: `https://euvd.enisa.europa.eu/vulnerability/${it.id}`,
          aliases,
          references: splitIds(it.references).slice(0, 8),
          vendor: it.enisaIdVendor?.[0]?.name ?? it.enisaIdProduct?.[0]?.product?.vendor?.name ?? null,
          product: it.enisaIdProduct?.[0]?.product?.name ?? null,
          euvdId: it.id,
        });
      }
    } catch (e) {
      console.error(`   ⚠ EUVD search '${term}': ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`   EUVD anchors: ${euvdHits} raw hits → ${byId.size} ids`);

  // EUVD exploited + consolidated KEV dump (CVE-ID overlap join).
  try {
    const exploited = JSON.parse(await fetchText('https://euvdservices.enisa.europa.eu/api/exploitedvulnerabilities', 'application/json'));
    for (const it of exploited) {
      const cve = splitIds(it.aliases).find((a) => a.startsWith('CVE-'));
      if (cve && byId.has(cve)) upsert(cve, { sources: ['euvd-exploited'], kev: true, kevSources: ['eu_kev'] });
    }
    console.log(`   EUVD exploited: ${exploited.length} records cross-checked`);
  } catch (e) {
    console.error(`   ⚠ EUVD exploited: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const kev = JSON.parse(await fetchText('https://euvdservices.enisa.europa.eu/api/kev/dump', 'application/json'));
    let matched = 0;
    for (const k of kev) {
      if (k.cveId && byId.has(k.cveId)) {
        upsert(k.cveId, { sources: ['kev'], kev: true, kevSources: k.sources ?? [], kevDateAdded: k.dateAdded ?? null });
        matched++;
      }
    }
    console.log(`   KEV dump: ${kev.length} entries, ${matched} overlap AI set`);
  } catch (e) {
    console.error(`   ⚠ KEV dump: ${e instanceof Error ? e.message : e}`);
  }

  // NVD keyword search (paced for keyless rate: 5 req / 30s; NVD_API_KEY
  // env, when present, raises the quota — header is attached in fetchText).
  if (process.env.NVD_API_KEY) console.log('   NVD: using API key from env');
  for (const term of NVD_TERMS) {
    try {
      const doc = JSON.parse(await fetchText(
        `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(term)}&resultsPerPage=20`,
        'application/json'
      ));
      for (const v of doc.vulnerabilities ?? []) {
        const c = v.cve;
        const cvss = c.metrics?.cvssMetricV31?.[0]?.cvssData ?? c.metrics?.cvssMetricV40?.[0]?.cvssData ?? null;
        upsert(c.id, {
          sources: ['nvd'],
          title: c.descriptions?.find((d) => d.lang === 'en')?.value?.slice(0, 240) ?? c.id,
          description: c.descriptions?.find((d) => d.lang === 'en')?.value ?? '',
          severity: cvss ? `${cvss.baseScore} (${cvss.baseSeverity})` : null,
          cvssBase: cvss?.baseScore ?? null,
          published: c.published ?? null,
          link: `https://nvd.nist.gov/vuln/detail/${c.id}`,
        });
      }
      console.log(`   NVD '${term}': ${doc.totalResults} total, kept 20`);
    } catch (e) {
      console.error(`   ⚠ NVD '${term}': ${e instanceof Error ? e.message : e}`);
    }
    await sleep(7000);
  }

  // OSV watchlist.
  let osvVulns = 0;
  for (const [ecosystem, name] of OSV_WATCHLIST) {
    try {
      const doc = await postJson('https://api.osv.dev/v1/query', { package: { name, ecosystem } });
      for (const v of doc.vulns ?? []) {
        osvVulns++;
        const sev = (v.severity ?? []).find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4')?.score ?? null;
        upsert(v.id, {
          sources: ['osv'],
          title: (v.summary ?? v.details ?? v.id).slice(0, 240),
          description: v.details ?? v.summary ?? '',
          severity: sev,
          cvssBase: sev ? Number(String(sev).split('/')[0]) || null : undefined,
          published: v.published ?? null,
          link: `https://osv.dev/vulnerability/${v.id}`,
          aliases: v.aliases ?? [],
          packages: [`${ecosystem}:${name}`],
        });
      }
    } catch (e) {
      console.error(`   ⚠ OSV ${ecosystem}:${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`   OSV watchlist: ${osvVulns} raw vuln refs → ${byId.size} ids`);

  // EPSS batch enrichment (cap 100 CVE IDs).
  const cves = [...byId.keys()].filter((id) => id.startsWith('CVE-')).slice(0, 100);
  if (cves.length) {
    try {
      const doc = JSON.parse(await fetchText(`https://api.first.org/data/v1/epss?cve=${cves.join(',')}`, 'application/json'));
      for (const row of doc.data ?? []) {
        if (byId.has(row.cve)) {
          const rec = byId.get(row.cve);
          if (rec.epss === undefined) rec.epss = Number(row.epss);
          if (rec.epssPercentile === undefined) rec.epssPercentile = Number(row.percentile);
        }
      }
      console.log(`   EPSS: enriched ${(doc.data ?? []).length} CVEs`);
    } catch (e) {
      console.error(`   ⚠ EPSS: ${e instanceof Error ? e.message : e}`);
    }
  }

  const vulns = [...byId.values()];
  const doc = { fetchedAt: new Date().toISOString(), count: vulns.length, vulns };
  writeFileSync(join(STAGING, 'vulns.json'), JSON.stringify(doc));
  console.log(`   → vulns.json (${vulns.length} vulns)`);
  return vulns.length;
}

async function syncAdvisories() {
  console.log(' [2/3] advisories (cvelistV5 + tool atoms + ExploitDB)…');
  const items = [];
  const seen = new Set();
  const push = (it) => {
    const key = it.link || it.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };

  // cvelistV5 firehose: keep commits touching a known AI CVE id or AI keywords.
  // The CVE set comes from this run's vulns.json (syncVulns runs first).
  let aiCves = new Set();
  try {
    const staged = JSON.parse(readFileSync(join(STAGING, 'vulns.json'), 'utf8'));
    aiCves = new Set((staged.vulns ?? []).map((v) => v.id).filter((id) => id.startsWith('CVE-')));
  } catch {
    /* vulns collector failed — fall back to keyword-only matching */
  }
  try {
    const entries = parseAtomEntries(await fetchText('https://github.com/CVEProject/cvelistV5/commits/main.atom', 'application/atom+xml'));
    let kept = 0;
    for (const e of entries) {
      const ids = cveIdsOf(`${e.title} ${e.link}`);
      if (ids.some((id) => aiCves.has(id)) || kwMatch(`${e.title} ${e.link}`)) {
        push({ id: e.id, title: e.title, link: e.link, updated: e.updated, source: 'cvelistV5', kind: 'cve', cves: ids });
        kept++;
      }
    }
    console.log(`   cvelistV5: ${entries.length} commits, ${kept} AI-matched (${aiCves.size} known AI CVEs)`);
  } catch (e) {
    console.error(`   ⚠ cvelistV5: ${e instanceof Error ? e.message : e}`);
  }

  // GitHub Advisory affects lookup — per-package GHSA feed (keyless 60/hr;
  // 9 requests ≈ well inside). This is the guaranteed-fresh advisory ticker:
  // results are already scoped to AI packages, no keyword gamble.
  for (const [ecosystem, pkg] of GHSA_AFFECTS) {
    try {
      const list = JSON.parse(await fetchText(
        `https://api.github.com/advisories?affects=${encodeURIComponent(pkg)}&ecosystem=${ecosystem}&per_page=10`,
        'application/vnd.github+json'
      ));
      for (const a of list) {
        push({
          id: a.ghsa_id ?? a.url,
          title: a.summary ?? a.ghsa_id,
          link: a.html_url ?? '',
          updated: a.published_at ?? a.updated_at ?? null,
          source: 'ghsa',
          kind: 'advisory',
          cves: [a.cve_id].filter(Boolean),
          description: (a.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
          severity: a.severity ?? null,
          package: `${ecosystem}:${pkg}`,
        });
      }
      console.log(`   ghsa ${ecosystem}:${pkg}: ${list.length} advisories`);
    } catch (e) {
      console.error(`   ⚠ ghsa ${ecosystem}:${pkg}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Tool + framework atoms (kept whole — already scoped feeds).
  for (const [source, url, keep] of TOOL_ATOMS) {
    try {
      const entries = parseAtomEntries(await fetchText(url, 'application/atom+xml'));
      for (const e of entries.slice(0, keep)) {
        push({ id: e.id, title: e.title, link: e.link, updated: e.updated, source, kind: 'release' });
      }
      console.log(`   ${source}: ${entries.length} entries, kept ${Math.min(keep, entries.length)}`);
    } catch (e) {
      console.error(`   ⚠ ${source}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ExploitDB RSS, AI-filtered.
  try {
    const rss = parseRssItems(await fetchText('https://www.exploit-db.com/rss.xml', 'application/rss+xml'));
    let kept = 0;
    for (const it of rss) {
      if (kwMatch(`${it.title} ${it.description}`)) {
        push({ id: it.guid, title: it.title, link: it.link, updated: it.pubDate, source: 'exploitdb', kind: 'exploit', description: it.description });
        kept++;
      }
    }
    console.log(`   exploitdb: ${rss.length} items, ${kept} AI-matched`);
  } catch (e) {
    console.error(`   ⚠ exploitdb: ${e instanceof Error ? e.message : e}`);
  }

  const doc = { fetchedAt: new Date().toISOString(), count: items.length, items };
  writeFileSync(join(STAGING, 'advisories.json'), JSON.stringify(doc));
  console.log(`   → advisories.json (${items.length} items)`);
  return items.length;
}

async function syncResearch() {
  console.log(' [3/3] research (hacktron + unit42 + csa + bleeping)…');
  const items = [];
  const seen = new Set();
  for (const { source, url, filter, cap } of RESEARCH_FEEDS) {
    try {
      const rss = parseRssItems(await fetchText(url, 'application/rss+xml'));
      let kept = 0;
      for (const it of rss.slice(0, cap * 2)) {
        if (kept >= cap) break;
        if (filter && !kwMatch(`${it.title} ${it.description}`)) continue;
        const key = it.guid || it.link;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({ id: key, title: it.title || '(untitled)', link: it.link, pubDate: it.pubDate, source, description: it.description });
        kept++;
      }
      console.log(`   ${source}: ${rss.length} items, kept ${kept}`);
    } catch (e) {
      console.error(`   ⚠ ${source}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const doc = { fetchedAt: new Date().toISOString(), count: items.length, items };
  writeFileSync(join(STAGING, 'research.json'), JSON.stringify(doc));
  console.log(`   → research.json (${items.length} items)`);
  return items.length;
}

async function main() {
  console.log('AI vulns sync — staging into', STAGING);
  ensureStaging();
  for (const f of ['vulns.json', 'advisories.json', 'research.json']) {
    const p = join(STAGING, f);
    if (existsSync(p)) rmSync(p);
  }
  const results = { vulns: 0, advisories: 0, research: 0 };
  try {
    results.vulns = await syncVulns();
  } catch (e) {
    console.error(`  ⚠ vulns collector aborted: ${e instanceof Error ? e.message : e}`);
  }
  try {
    results.advisories = await syncAdvisories();
  } catch (e) {
    console.error(`  ⚠ advisories collector aborted: ${e instanceof Error ? e.message : e}`);
  }
  try {
    results.research = await syncResearch();
  } catch (e) {
    console.error(`  ⚠ research collector aborted: ${e instanceof Error ? e.message : e}`);
  }
  console.log('\n✔ Staged:', JSON.stringify(results));
  if (results.vulns === 0 && results.advisories === 0 && results.research === 0) {
    console.error('✘ all three collectors failed — nothing to build from');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✘ sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
