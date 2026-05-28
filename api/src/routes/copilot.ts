import type { Context } from 'hono';
import type { Env } from '../env';
import { LIVE_IOCS_CACHE_KEY } from './live-iocs';
import { RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { ACTOR_TIMELINE_CACHE_KEY } from './actor-timeline';
import { CVE_RECENT_CACHE_KEY } from './cve-recent';
import { WRITEUPS_CACHE_KEY } from './writeups';
import { MALWARE_SAMPLES_CACHE_KEY } from './malware-samples';
import { DETECTIONS_CACHE_KEY } from './detections';
import { CYBERCRIME_CACHE_KEY } from './cybercrime';
import { IOC_CORRELATION_CACHE_KEY } from './ioc-correlation';
import { NEGOTIATIONS_CACHE_KEY } from './negotiations';
import { detectType as detectIndicatorType, type IndicatorType } from '../lib/indicator';
import type { Indicator, ProviderEnv, ProviderResult, ProviderAdapter } from '../providers/types';
import { lookupCve } from '../lib/cve-lookup';
import { virustotal as vtProvider } from '../providers/virustotal';
import { abuseipdb as abuseProvider } from '../providers/abuseipdb';
import { otx as otxProvider } from '../providers/otx';
import { greynoise as gnProvider } from '../providers/greynoise';
import { urlscan as urlscanProvider } from '../providers/urlscan';
import { malwarebazaar as mbProvider } from '../providers/malwarebazaar';

interface Source {
  name: string;
  items: number;
  data: unknown;
}

interface CopilotResponse {
  query: string;
  query_type: string;
  narrative: string;
  sources: Source[];
  model_used: string;
  processed_at: string;
}

type QueryType = 'cve' | 'ip' | 'domain' | 'hash' | 'actor' | 'ransomware' | 'generic';

const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const DOMAIN_RE = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const HASH_RE = /^[a-fA-F0-9]{32,64}$/;

function detectType(query: string): QueryType {
  if (CVE_RE.test(query.trim())) return 'cve';
  if (IP_RE.test(query.trim())) return 'ip';
  if (DOMAIN_RE.test(query.trim())) return 'domain';
  if (HASH_RE.test(query.trim())) return 'hash';
  const lower = query.toLowerCase();
  if (['lockbit', 'ransom', 'ransomware', 'hive', 'clop', 'blackcat', 'alphv', 'royal', 'play', 'akira', 'bashe', 'bianlian', 'cuba', 'dragonforce', '8base'].some((k) => lower.includes(k))) return 'ransomware';
  if (['apt', 'group', 'actor', 'threat', 'scattered', 'lazarus', 'kimsu', 'fancy', 'cozy', 'knotweed', 'midnight', 'volt', 'typhoon', 'panda', 'dragon'].some((k) => lower.includes(k))) return 'actor';
  return 'generic';
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(key));
    if (cached) return (await cached.json()) as T;
  } catch { /* miss */ }
  return null;
}

// Internal cache keys not exported from their modules
const C2_CACHE_KEY = 'https://c2-cache.internal/v8';
const MALPEDIA_CACHE_KEY = 'https://malpedia-cache.internal/v2';
const BREACH_CACHE_KEY = 'https://breach-cache.internal/v6-hibp-only';

const matchText = (query: string, text: string | undefined): boolean =>
  text?.toLowerCase().includes(query.toLowerCase()) ?? false;

const matchCve = (query: string, id: string) => id.toUpperCase() === query.trim().toUpperCase();

function buildSourceAdder(query: string) {
  return async <T>(name: string, key: string, extract: (data: T) => unknown[], filter?: (item: unknown) => boolean): Promise<Source | null> => {
    const data = await readCache<T>(key);
    if (!data) return null;
    const items = extract(data).filter(filter ?? (() => true));
    if (items.length === 0) return null;
    return { name, items: items.length, data: items.slice(0, 30) };
  };
}

async function gatherSources(query: string, type: QueryType) {
  const add = buildSourceAdder(query);
  const q = query.trim();
  const ql = q.toLowerCase();

  // Build all cache read promises per query type — fully parallel
  let promises: Promise<Source | null>[];

  // Live CVE lookup — fetches NVD / EPSS / KEV / PoC in parallel
  let cveLiveSource: Source | null = null;
  if (type === 'cve') {
    async function doCveLookup(): Promise<Source | null> {
      const result = await lookupCve(q.toUpperCase());
      if (!result.ok) return null;
      return { name: 'CVE Search (live)', items: 1, data: { ...result.data } };
    }
    const cvePromise = doCveLookup();

    const cachePromises = [
      add('Recent CVEs', CVE_RECENT_CACHE_KEY,
        (d: { cves: unknown[] }) => d.cves,
        (c: any) => matchCve(q, c.id)),
      add('Breach Disclosures', BREACH_CACHE_KEY,
        (d: { breaches: unknown[] }) => d.breaches,
        (b: any) => b.description?.toLowerCase().includes(ql) ?? false),
      add('Actor Timeline', ACTOR_TIMELINE_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => (g.description ?? '').toLowerCase().includes(ql)),
      add('Writeups', WRITEUPS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (w: any) => matchText(ql, w.title) || matchText(ql, w.description) || w.tags?.some((t: string) => matchText(ql, t))),
      add('Detections', DETECTIONS_CACHE_KEY,
        (d: { detections: unknown[] }) => d.detections,
        (d: any) => matchText(ql, d.rule_name) || matchText(ql, d.rule_id)),
      add('Cybercrime', CYBERCRIME_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (c: any) => matchText(ql, c.title) || matchText(ql, c.description)),
      add('IOC Correlation', IOC_CORRELATION_CACHE_KEY,
        (d: { hashes: unknown[]; ips: unknown[]; domains: unknown[] }) => [...(d.hashes ?? []), ...(d.ips ?? []), ...(d.domains ?? [])],
        (e: any) => matchText(ql, e.value)),
    ];
    promises = cachePromises;
    cveLiveSource = await cvePromise;
  } else if (type === 'ip') {
    promises = [
      add('Live IOCs', LIVE_IOCS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (i: any) => i.value === q),
      add('C2 Tracker', C2_CACHE_KEY,
        (d: { entries: unknown[] }) => d.entries,
        (e: any) => e.ip === q),
      add('IOC Correlation', IOC_CORRELATION_CACHE_KEY,
        (d: { ips: unknown[] }) => d.ips,
        (e: any) => e.value === q),
      add('Ransomware Recent', RANSOMWARE_RECENT_CACHE_KEY,
        (d: { victims: unknown[] }) => d.victims,
        (v: any) => v.victim?.includes(q)),
      add('Actor Timeline', ACTOR_TIMELINE_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => matchText(ql, g.description)),
      add('Writeups', WRITEUPS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (w: any) => matchText(ql, w.title) || matchText(ql, w.description)),
      add('Detections', DETECTIONS_CACHE_KEY,
        (d: { detections: unknown[] }) => d.detections,
        (d: any) => (d.indicators ?? []).some((i: any) => i.value === q)),
    ];
  } else if (type === 'domain') {
    promises = [
      add('Live IOCs', LIVE_IOCS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (i: any) => i.value === q),
      add('IOC Correlation', IOC_CORRELATION_CACHE_KEY,
        (d: { domains: unknown[] }) => d.domains,
        (e: any) => e.value === q),
      add('Breach Disclosures', BREACH_CACHE_KEY,
        (d: { breaches: unknown[] }) => d.breaches,
        (b: any) => b.domain?.toLowerCase() === q.toLowerCase() || (b.description ?? '').toLowerCase().includes(ql)),
      add('Writeups', WRITEUPS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (w: any) => matchText(ql, w.title) || matchText(ql, w.description)),
      add('Actor Timeline', ACTOR_TIMELINE_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => matchText(ql, g.description)),
      add('Detections', DETECTIONS_CACHE_KEY,
        (d: { detections: unknown[] }) => d.detections,
        (d: any) => (d.indicators ?? []).some((i: any) => i.value === q)),
    ];
  } else if (type === 'hash') {
    promises = [
      add('Live IOCs', LIVE_IOCS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (i: any) => i.value === q),
      add('Malware Samples', MALWARE_SAMPLES_CACHE_KEY,
        (d: { samples: Array<{ sha256: string; signature?: string }> }) => d.samples,
        (s: any) => s.sha256 === q),
      add('IOC Correlation', IOC_CORRELATION_CACHE_KEY,
        (d: { hashes: unknown[] }) => d.hashes,
        (e: any) => e.value === q),
      add('Writeups', WRITEUPS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (w: any) => matchText(ql, w.title) || matchText(ql, w.description)),
      add('Actor Timeline', ACTOR_TIMELINE_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => matchText(ql, g.description)),
    ];
  } else {
    // actor, ransomware, generic — gather everything
    promises = [
      add('Ransomware Recent', RANSOMWARE_RECENT_CACHE_KEY,
        (d: { victims: unknown[] }) => d.victims,
        (v: any) => matchText(ql, v.group)),
      add('Actor Timeline', ACTOR_TIMELINE_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => matchText(ql, g.display_name) || matchText(ql, g.slug)),
      add('Recent CVEs', CVE_RECENT_CACHE_KEY,
        (d: { cves: unknown[] }) => Array.isArray(d.cves) ? d.cves.slice(0, 50) : [],
        (c: any) => matchText(ql, c.description) || matchText(ql, c.id)),
      add('Live IOCs', LIVE_IOCS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (i: any) => matchText(ql, i.value) || matchText(ql, i.source)),
      add('Writeups', WRITEUPS_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (w: any) => matchText(ql, w.title) || matchText(ql, w.description)),
      add('Breach Disclosures', BREACH_CACHE_KEY,
        (d: { breaches: unknown[] }) => d.breaches,
        (b: any) => (b.description ?? '').toLowerCase().includes(ql)),
      add('Detections', DETECTIONS_CACHE_KEY,
        (d: { detections: unknown[] }) => d.detections,
        (d: any) => matchText(ql, d.rule_name) || matchText(ql, d.rule_id)),
      add('Cybercrime', CYBERCRIME_CACHE_KEY,
        (d: { items: unknown[] }) => d.items,
        (c: any) => matchText(ql, c.title) || matchText(ql, c.description)),
      add('Negotiations', NEGOTIATIONS_CACHE_KEY,
        (d: { groups: unknown[] }) => d.groups,
        (g: any) => matchText(ql, g.group)),
      add('Malpedia', MALPEDIA_CACHE_KEY,
        (d: { families: unknown[] }) => d.families,
        (f: any) => matchText(ql, f.name) || matchText(ql, f.common_name)),
    ];
  }

  // Execute ALL cache reads in parallel
  const results = await Promise.allSettled(promises);
  const sources: Source[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) sources.push(r.value);
  }
  if (cveLiveSource) sources.push(cveLiveSource);
  return sources;
}

const PROVIDER_TIMEOUT = 8000;

function queryTypeToIndicatorType(qt: QueryType): IndicatorType | null {
  if (qt === 'ip') return 'ipv4';
  if (qt === 'domain') return 'domain';
  if (qt === 'hash') return 'hash';
  return null;
}

function buildProviderEnv(env: Env): ProviderEnv {
  return {
    VT_API_KEY: env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: env.ABUSECH_AUTH_KEY,
  };
}

type ProviderEntry = { id: string; adapter: ProviderAdapter };

const ENRICHMENT_PROVIDERS: Record<string, ProviderEntry[]> = {
  ipv4: [
    { id: 'virustotal', adapter: vtProvider },
    { id: 'abuseipdb', adapter: abuseProvider },
    { id: 'otx', adapter: otxProvider },
    { id: 'greynoise', adapter: gnProvider },
  ],
  domain: [
    { id: 'virustotal', adapter: vtProvider },
    { id: 'otx', adapter: otxProvider },
    { id: 'urlscan', adapter: urlscanProvider },
  ],
  hash: [
    { id: 'virustotal', adapter: vtProvider },
    { id: 'malwarebazaar', adapter: mbProvider },
    { id: 'otx', adapter: otxProvider },
  ],
};

async function gatherLiveEnrichment(query: string, queryType: QueryType, env: Env): Promise<Source[]> {
  const pEnv = buildProviderEnv(env);

  // For IP/domain/hash — run provider adapters
  const indType = queryTypeToIndicatorType(queryType);
  if (indType) {
    const indicator: Indicator = { type: indType, value: query.trim() };
    const entries = ENRICHMENT_PROVIDERS[indType];
    if (!entries) return [];

    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        const signal = AbortSignal.timeout(PROVIDER_TIMEOUT);
        return entry.adapter(indicator, pEnv, signal);
      })
    );

    const enriched: ProviderResult[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') enriched.push(r.value);
    }
    if (enriched.length === 0) return [];

    const dataItems = enriched.map((r) => ({
      source: r.source,
      status: r.status,
      score: r.score,
      verdict: r.verdict,
      tags: r.tags,
      summary: r.raw_summary,
      error: r.error,
    }));
    const categories = dataItems.map((d) => `${d.source}: ${d.verdict} (score=${d.score})`).join(', ');
    return [{
      name: 'Live Enrichment',
      items: dataItems.length,
      data: { providers: dataItems, summary: categories },
    }];
  }

  // For actor/ransomware — check Malpedia live + Wikipedia for background context
  if (queryType === 'actor' || queryType === 'ransomware' || queryType === 'generic') {
    const liveSources: Source[] = [];
    const q = query.trim();

    // Malpedia live lookup
    try {
      const mpRes = await fetch(`https://malpedia.caad.fkie.fraunhofer.de/api/get/family/${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (mpRes?.ok) {
        const mpData = (await mpRes.json()) as Record<string, unknown>;
        liveSources.push({
          name: 'Malpedia (live)',
          items: 1,
          data: mpData,
        });
      }
    } catch { /* malpedia optional */ }

    // Wikipedia summary for well-known threat actors / ransomware
    // Tries direct page first, falls back to search API for redirects
    try {
      const wikiTitle = q.replace(/\s+/g, '_');
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
        { headers: { 'User-Agent': 'pranithjain-copilot/1.0' }, signal: AbortSignal.timeout(4000) },
      ).catch(() => null);
      if (wikiRes?.ok) {
        const wikiData = (await wikiRes.json()) as { extract?: string; pageid?: number; title?: string; content_urls?: { desktop?: { page?: string } } };
        if (wikiData.extract) {
          liveSources.push({
            name: 'Wikipedia',
            items: 1,
            data: {
              title: wikiData.title,
              extract: wikiData.extract,
              url: wikiData.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`,
            },
          });
        }
      }
    } catch { /* wikipedia direct page miss */ }
    // Fallback: search Wikipedia for related pages
    if (liveSources.length === 0) {
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q + ' cyber')}&format=json&srlimit=3&origin=*`;
        const srRes = await fetch(searchUrl, { headers: { 'User-Agent': 'pranithjain-copilot/1.0' }, signal: AbortSignal.timeout(4000) }).catch(() => null);
        if (srRes?.ok) {
          const srData = (await srRes.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
          const results = srData?.query?.search ?? [];
          if (results.length > 0) {
            liveSources.push({
              name: 'Wikipedia',
              items: results.length,
              data: results.slice(0, 3).map((r) => ({
                title: r.title,
                snippet: r.snippet.replace(/<[^>]+>/g, ''),
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s+/g, '_'))}`,
              })),
            });
          }
        }
      } catch { /* wikipedia search failed */ }
    }

    return liveSources;
  }

  return [];
}

function buildSystemPrompt(query: string, queryType: QueryType): string {
  return `You are a senior CTI analyst. Write a concise report about "${query}".

Sections: Summary, Key Findings, Context, Recommendations.
Under 500 words. Markdown output.
CVE IDs must be full (e.g. CVE-2024-1234).

IMPORTANT — READ CAREFULLY:
- The provided data sources below MAY be empty. This does NOT mean the subject is unknown.
- You have extensive training knowledge about major threat actors (LockBit, APT groups, Scattered Spider, etc.), ransomware families, and notable CVEs.
- When sources are empty or sparse: write what you know from training. Mark it as "(general knowledge)" with a confidence label.
- NEVER say "no intelligence found" or "no data available" for a well-known subject. You know about it — use that knowledge.
- If you genuinely don't recognize the query (an obscure term), say "This query does not match any known threat actor, malware, or CVE in available sources or general knowledge."

Confidence:
- **High**: multiple sources agree, or authoritative source (Wikipedia, Malpedia).
- **Medium**: single source or plausible general knowledge.
- **Low**: weak signal, general knowledge without specifics.

When using general knowledge, add: "Note: this analysis is based on general cybersecurity knowledge as curated feeds returned no data for this query."

Actor/ransomware reports must include: known TTPs, targeting, recent activity, ransom model, related CVEs if known.
CVE reports must include: CVSS, KEV status, EPSS, PoC availability, actor links.
IP/domain/hash reports must include: live enrichment verdicts, geolocation, C2 framework, breach context.`;
}

const SCHEMA_NOTES: Record<string, string> = {
  'Live IOCs': 'Each item: { value (the IOC text), kind (ip|domain|hash|url), source (feed name), context (malware family / tags), reporter, reference_url, observed_at }',
  'Ransomware Recent': 'Each item: { victim (org name), group (ransomware gang), discovered, description, sector, country, screen_url }',
  'Actor Timeline': 'Each item: { slug, display_name, posts_in_window (last 30d posts), description, raas (bool), mitre (MITRE ATT&CK ref), mirrors_reachable }',
  'Recent CVEs': 'Each item: { id, published, description, severity (CRITICAL/HIGH/MEDIUM/LOW), score (CVSS), kev (bool, CISA KEV), actors[] }',
  'Breach Disclosures': 'Each item: { name, title, domain, breach_date, pwn_count, description, data_classes[], verified }',
  'Writeups': 'Each item: { title, url, source, published, description, tags[], author }',
  'Malware Samples': 'Each item: { sha256, sha1, md5, first_seen, file_type, file_size_bytes, signature (malware family), reporter, tags[], bazaar_url }',
  'C2 Tracker': 'Each item: { ip, framework (Cobalt Strike/Havoc/Mythic/etc), context, port }. Identifies C2 infrastructure.',
  'IOC Correlation': 'Each item: { value, source_count (number of feeds seeing this IOC), sources[] }. Higher source_count = higher confidence.',
  'Detections': 'Each item: { rule_name, rule_id, severity, match_count, group_key, indicators[] }. Sigma/YARA/Suricata rules matching this indicator.',
  'Cybercrime': 'Each item: { title, url, description, published }. Cybercrime news and research.',
  'Negotiations': 'Each item: { group, ransom_amount, discount_percent, settlement_status, victim, date }. Ransomware negotiation financial data.',
  'Malpedia': 'Each item: { name, common_name, description, aliases[] }. Malware family catalog from Malpedia.',
  'Live Enrichment': 'Live provider lookups. Each entry: { source, status (ok|error), score (0-100), verdict (clean|suspicious|malicious|unknown), tags[], summary }. Use for geolocation, abuse reports, AV detection, malware family tags.',
  'CVE Search (live)': 'Live NVD + EPSS + CISA KEV + CIRCL lookup. Contains: cve_id, published, description, cvss (version, base_score, severity, vector), epss (score, percentile, date), kev (in_kev, date_added, vulnerability_name, known_ransomware), cwe[], references[], affected_products[], actors[], actor_links[]. Use this for the most up-to-date CVE details — severity, exploit probability, KEV status, and actor attribution.',
};

function buildUserPrompt(query: string, queryType: QueryType, sources: Source[]): string {
  const intro = `Investigate: ${query}\nDetected type: ${queryType}\n\n`;
  let body = '';
  for (const src of sources) {
    body += `=== ${src.name} (${src.items} results) ===\n`;
    const note = SCHEMA_NOTES[src.name];
    if (note) body += `Schema: ${note}\n`;
    body += JSON.stringify(src.data, null, 2);
    body += '\n\n';
  }
  if (!body) body = 'No sources returned data. Use general knowledge to answer.\n';
  return intro + body;
}

async function callWorkersAi(env: Env, system: string, user: string): Promise<string> {
  const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const res = (await env.AI.run(model as any, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 2000,
    temperature: 0.3,
  } as any)) as { response?: string };
  return res.response ?? 'No response from model.';
}

async function callGroq(env: Env, system: string, user: string): Promise<string> {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json<{ error?: string }>().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Groq API error: ${res.status}`);
  }
  const data = await res.json<any>();
  return data?.choices?.[0]?.message?.content ?? 'No response.';
}

export async function copilotInvestigateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const { query } = await c.req.json<{ query: string }>();
    if (!query || query.trim().length === 0) {
      return c.json({ error: 'query is required' }, 400);
    }
    if (query.length > 500) {
      return c.json({ error: 'query too long (max 500 chars)' }, 400);
    }

    const queryType = detectType(query);
    // Parallel: cache sources + live enrichment (no more unified-search subrequest)
    const [sources, liveSources] = await Promise.all([
      gatherSources(query.trim(), queryType),
      gatherLiveEnrichment(query.trim(), queryType, c.env),
    ]);
    const allSources = [...sources, ...liveSources];

    const system = buildSystemPrompt(query.trim(), queryType);
    const user = buildUserPrompt(query.trim(), queryType, allSources);

    let narrative: string;
    let modelUsed: string;

    try {
      narrative = await callGroq(c.env, system, user);
      modelUsed = 'groq:llama-3.3-70b-versatile';
    } catch {
      narrative = await callWorkersAi(c.env, system, user);
      modelUsed = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    }

    const response: CopilotResponse = {
      query: query.trim(),
      query_type: queryType,
      narrative,
      sources: allSources.map((s) => ({ name: s.name, items: s.items, data: s.data })),
      model_used: modelUsed,
      processed_at: new Date().toISOString(),
    };

    return c.json(response, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
