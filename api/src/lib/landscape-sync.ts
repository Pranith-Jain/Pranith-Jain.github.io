/**
 * Shared sync logic for the curated "landscape" endpoints.
 *
 * Two endpoints, one module:
 *   /api/v1/owasp-ai-landscape — tree of OWASP AI/ML projects, auto-synced
 *     daily from the public `RicoKomenda/owasp-ai-security-visualizer`
 *     data.json (raw.githubusercontent.com serves it without bot
 *     challenges, unlike start.me).
 *
 *   /api/v1/curated-toolbox — start.me "Mastering Threat Intelligence
 *     Platforms" mirror, refreshed via Jina Reader (r.jina.ai) on a
 *     daily cron. Jina gives us a clean markdown rendering even
 *     though start.me is behind a Cloudflare bot challenge.
 *
 * Storage model: one KV value per endpoint at well-known keys. Each
 * value is the full payload the page renders. A `*meta` companion
 * stores last-success + error so the UI can show "synced 3h ago".
 *
 * Cold start: GET returns the bundled seed (in this same module) so a
 * single deploy gives a working page before the first cron fires.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Constants ──────────────────────────────────────────────────────────
export const OWASP_AI_LANDSCAPE_KV_KEY = 'owasp-ai-landscape:v1';
export const OWASP_AI_LANDSCAPE_META_KEY = 'owasp-ai-landscape:meta:v1';
export const CURATED_TOOLBOX_KV_KEY = 'curated-toolbox:v1';
export const CURATED_TOOLBOX_META_KEY = 'curated-toolbox:meta:v1';

const USER_AGENT = 'Mozilla/5.0 (compatible; portfolio-landscape-sync/1.0)';
const FETCH_TIMEOUT_MS = 20_000;
const CACHE_MAX_AGE_S = 300; // serve stale up to 5 min while we revalidate

/**
 * Per-colo Cache API shadow for the OWASP AI Landscape / Curated Toolbox
 * payload. KV reads cost quota; per-colo `caches.default` is free. The
 * shape of the data — large JSON, low write rate, identical across colos
 * — is the textbook case for cache-API-as-L1 + KV-as-L2.
 *
 * `writeShadow` runs on the (rare) cron-sync write-through so a freshly
 * fetched payload is available to all colos without each one re-reading
 * from KV. `readShadow` is the hot path: ~1 KV read per colo per TTL
 * window instead of per origin request.
 */
function shadowCacheReq(kind: 'owasp' | 'owasp-meta' | 'curated' | 'curated-meta', kvKey: string): Request {
  // Encode the KV key into the URL so a key bump (e.g. v1 → v2) auto-busts.
  return new Request(`https://landscape-shadow.internal/v1/${kind}/${encodeURIComponent(kvKey)}`);
}

/* ─────────────────────────── OWASP AI Landscape ─────────────────────── */

export type OwaspNodeType = 'umbrella' | 'sub-umbrella' | 'guide' | 'standard' | 'cheat sheet' | 'tool' | 'ctf';

export interface OwaspNode {
  title: string;
  description: string;
  url: string;
  type: OwaspNodeType;
  children?: OwaspNode[];
}

export interface OwaspLandscapePayload {
  name: string;
  description: string;
  source: string;
  fetchedAt: string;
  nodes: OwaspNode[];
}

interface OwaspMeta {
  source: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  counts?: { umbrellas: number; subUmbrellas: number; leaves: number };
}

const OWASP_RAW_URL = 'https://raw.githubusercontent.com/RicoKomenda/owasp-ai-security-visualizer/main/data.json';

/** Normalize: source uses `name` for internal nodes, `title` for leaves. */
function normalizeNode(raw: any): OwaspNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = (raw.title ?? raw.name ?? '').toString().trim();
  const description = (raw.description ?? '').toString().trim();
  const url = (raw.url ?? '').toString().trim();
  const type = (raw.type ?? 'guide').toString().trim() as OwaspNodeType;
  if (!title) return null;
  const node: OwaspNode = { title, description, url, type };
  if (Array.isArray(raw.children) && raw.children.length > 0) {
    const kids: OwaspNode[] = [];
    for (const c of raw.children) {
      const n = normalizeNode(c);
      if (n) kids.push(n);
    }
    node.children = kids;
  }
  return node;
}

function countNodes(nodes: OwaspNode[]): { umbrellas: number; subUmbrellas: number; leaves: number } {
  let umbrellas = 0;
  let subUmbrellas = 0;
  let leaves = 0;
  const walk = (n: OwaspNode) => {
    if (n.type === 'umbrella') umbrellas += 1;
    else if (n.type === 'sub-umbrella') subUmbrellas += 1;
    else leaves += 1;
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return { umbrellas, subUmbrellas, leaves };
}

/** Manual fallback used until the first successful cron run. */
export const OWASP_AI_LANDSCAPE_SEED: OwaspLandscapePayload = {
  name: 'OWASP AI Security Landscape',
  description: 'A comprehensive overview of OWASP resources for AI and machine learning security.',
  source: 'seed:v1',
  fetchedAt: '1970-01-01T00:00:00.000Z',
  nodes: [
    {
      title: 'OWASP Generative AI',
      description:
        'The OWASP GenAI Security Project — global community delivering peer-reviewed guidance on securing LLMs, generative AI, and agentic systems.',
      url: 'https://genai.owasp.org/',
      type: 'umbrella',
      children: [
        {
          title: 'Agentic Security Initiative',
          description: 'Focused on the unique security challenges of autonomous AI and agentic systems.',
          url: 'https://genai.owasp.org/initiatives/agentic-security-initiative/',
          type: 'sub-umbrella',
          children: [
            {
              title: 'Top 10 for Agentic Applications 2026',
              description: 'Globally peer-reviewed framework for autonomous/agentic AI systems.',
              url: 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/',
              type: 'guide',
            },
            {
              title: 'Agentic AI Threats and Mitigations',
              description: 'Threat-model-based reference of emerging agentic threats and mitigations.',
              url: 'https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/',
              type: 'guide',
            },
            {
              title: 'Securing Agentic Applications Guide 1.0',
              description:
                'Practical guidance for designing, developing, and deploying secure LLM-powered agentic applications.',
              url: 'https://genai.owasp.org/resource/securing-agentic-applications-guide-1-0/',
              type: 'guide',
            },
          ],
        },
        {
          title: 'GenAI Red Teaming Initiative',
          description: 'Standardized AI red teaming methodologies, benchmarks, and evaluation frameworks for LLMs.',
          url: 'https://genai.owasp.org/initiatives/genai-red-teaming-initiative/',
          type: 'sub-umbrella',
          children: [
            {
              title: 'GenAI Red Teaming Guide',
              description: 'How to red-team generative AI: methodology, scope, reporting.',
              url: 'https://genai.owasp.org/resource/genai-red-teaming-guide/',
              type: 'guide',
            },
          ],
        },
      ],
    },
    {
      title: 'OWASP AI Security & Privacy Guide',
      description: 'Cross-cutting guide covering AI threats, privacy, and engineering best practices.',
      url: 'https://owasp.org/www-project-ai-security-and-privacy-guide/',
      type: 'umbrella',
      children: [
        {
          title: 'AI Security & Privacy Guide',
          description: 'Engineering-level guide to securing AI systems and protecting user privacy.',
          url: 'https://owasp.org/www-project-ai-security-and-privacy-guide/',
          type: 'guide',
        },
        {
          title: 'Cheat Sheet: LLM Prompt Injection',
          description: 'Defensive cheat sheet for prompt-injection-class attacks.',
          url: 'https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html',
          type: 'cheat sheet',
        },
      ],
    },
    {
      title: 'OWASP Machine Learning Top 10',
      description: 'Classic ML (non-LLM) attack taxonomy and mitigations.',
      url: 'https://owasp.org/www-project-machine-learning-security-top-10/',
      type: 'umbrella',
      children: [
        {
          title: 'ML Top 10 (2023)',
          description: 'Ten most critical ML security risks — input manipulation, model theft, data poisoning.',
          url: 'https://owasp.org/www-project-machine-learning-security-top-10/',
          type: 'standard',
        },
      ],
    },
  ],
};

export async function syncOwaspAiLandscape(
  env: Env
): Promise<{ ok: boolean; error?: string; counts?: { umbrellas: number; subUmbrellas: number; leaves: number } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(OWASP_RAW_URL, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `upstream ${res.status}` };
    const raw = (await res.json()) as { name?: string; description?: string; children?: any[] };
    const nodes: OwaspNode[] = [];
    for (const c of raw.children ?? []) {
      const n = normalizeNode(c);
      if (n) nodes.push(n);
    }
    const counts = countNodes(nodes);
    const payload: OwaspLandscapePayload = {
      name: raw.name ?? OWASP_AI_LANDSCAPE_SEED.name,
      description: raw.description ?? OWASP_AI_LANDSCAPE_SEED.description,
      source: OWASP_RAW_URL,
      fetchedAt: new Date().toISOString(),
      nodes,
    };
    if (env.KV_CACHE) {
      await env.KV_CACHE.put(OWASP_AI_LANDSCAPE_KV_KEY, JSON.stringify(payload));
      const meta: OwaspMeta = { source: OWASP_RAW_URL, fetchedAt: payload.fetchedAt, ok: true, counts };
      await env.KV_CACHE.put(OWASP_AI_LANDSCAPE_META_KEY, JSON.stringify(meta));
      // Write-through to the per-colo cache shadow so readers in colos that
      // already have a stale L1 entry pick up the new value on the next
      // request (instead of serving stale for up to CACHE_MAX_AGE_S).
      try {
        const cache = (caches as unknown as { default: Cache }).default;
        await cache.put(
          shadowCacheReq('owasp', OWASP_AI_LANDSCAPE_KV_KEY),
          new Response(JSON.stringify(payload), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
          })
        );
        await cache.put(
          shadowCacheReq('owasp-meta', OWASP_AI_LANDSCAPE_META_KEY),
          new Response(JSON.stringify(meta), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
          })
        );
      } catch {
        /* best-effort */
      }
    }
    return { ok: true, counts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (env.KV_CACHE) {
      const meta: OwaspMeta = {
        source: OWASP_RAW_URL,
        fetchedAt: new Date().toISOString(),
        ok: false,
        error: msg,
      };
      await env.KV_CACHE.put(OWASP_AI_LANDSCAPE_META_KEY, JSON.stringify(meta));
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function getOwaspAiLandscapeHandler(c: Context<{ Bindings: Env }>) {
  const kv = c.env.KV_CACHE;
  if (!kv) {
    return c.json(OWASP_AI_LANDSCAPE_SEED, 200, { 'cache-control': 'public, max-age=60' });
  }
  // L1: per-colo Cache API. Hot path — collapses N origin requests/colo
  // to 1 KV read per TTL window.
  const cache = (caches as unknown as { default: Cache }).default;
  const shadowReq = shadowCacheReq('owasp', OWASP_AI_LANDSCAPE_KV_KEY);
  try {
    const hit = await cache.match(shadowReq);
    if (hit)
      return new Response(hit.body, {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
      });
  } catch {
    /* fall through to KV */
  }
  const raw = await kv.get(OWASP_AI_LANDSCAPE_KV_KEY, 'json');
  if (raw) {
    // Write-through to L1 so the next read in this colo skips KV for 5 min.
    try {
      await cache.put(
        shadowReq,
        new Response(JSON.stringify(raw), {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
        })
      );
    } catch {
      /* best-effort */
    }
    return c.json(raw, 200, { 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` });
  }
  let meta: OwaspMeta | null = null;
  try {
    meta = (await kv.get(OWASP_AI_LANDSCAPE_META_KEY, 'json')) as OwaspMeta | null;
  } catch {
    /* ignore */
  }
  return c.json({ ...OWASP_AI_LANDSCAPE_SEED, meta }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function getOwaspAiLandscapeMetaHandler(c: Context<{ Bindings: Env }>) {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ ok: true, source: 'seed' }, 200, { 'cache-control': 'no-store' });
  // L1: cache-api shadow. META flips only on cron sync (~1×/6h).
  const cache = (caches as unknown as { default: Cache }).default;
  const shadowReq = shadowCacheReq('owasp-meta', OWASP_AI_LANDSCAPE_META_KEY);
  try {
    const hit = await cache.match(shadowReq);
    if (hit)
      return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    /* fall through to KV */
  }
  const raw = await kv.get(OWASP_AI_LANDSCAPE_META_KEY, 'json');
  const value = raw ?? { ok: true, source: 'seed' };
  try {
    await cache.put(
      shadowReq,
      new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_MAX_AGE_S}` },
      })
    );
  } catch {
    /* best-effort */
  }
  return c.json(value, 200, { 'cache-control': 'no-store' });
}

/* ─────────────────────────── Curated Toolbox ───────────────────────── */

export interface CuratedTool {
  section: string;
  title: string;
  url: string;
  description?: string;
}

export interface CuratedToolboxPayload {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  sections: { name: string; tools: CuratedTool[] }[];
  totalTools: number;
  totalSections: number;
}

interface CuratedMeta {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  totalTools: number;
  totalSections: number;
}

const CURATED_STARTME_URL = 'https://start.me/p/gGj8gn/mastering-threat-intelligence-platforms';
/** Jina Reader renders any URL as clean markdown via real-browser egress.
 *  Only reliable way to read start.me — its Cloudflare bot challenge
 *  blocks every direct fetch. */
const CURATED_JINA_URL = `https://r.jina.ai/${CURATED_STARTME_URL}`;

/** Parse Jina-reader markdown back into sections of tools.
 *
 *  Jina renders each start.me tool link as:
 *    `[![Image N](host) Title](url "tooltip")`
 *  with the tooltip continued on the next line. We collapse multi-line
 *  bullets, then for each line find the LAST `](https?://...)` (the
 *  outbound tool URL) and the most recent `)` before it (closes the
 *  inner image link). The title is the text in between.
 *
 *  Regex was tried first; the U+200E left-to-right mark that Jina
 *  inserts between the image and the title broke `\s*` matching, and
 *  start.me’s multi-line tooltips broke line-by-line processing. The
 *  indexOf-based scan below sidesteps both. */
function parseStartmeMarkdown(md: string): {
  sections: { name: string; tools: CuratedTool[] }[];
  totalTools: number;
  totalSections: number;
} {
  const sections: { name: string; tools: CuratedTool[] }[] = [];
  let current: { name: string; tools: CuratedTool[] } | null = null;
  // Collapse multi-line bullets: any newline NOT followed by a list
  // marker / blank line / new header is part of the previous bullet.
  const flat = md.replace(/\n(?![#*\-\s])/g, ' ');
  const lines = flat.split(/\r?\n/);
  let start = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i];
    if (head && /^##\s+/.test(head)) {
      start = i;
      break;
    }
  }
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current) sections.push(current);
      current = { name: (h[1] ?? '').replace(/[*_`]+/g, '').trim(), tools: [] };
      continue;
    }
    if (!current) continue;
    if (!line.startsWith('*') && !line.startsWith('-')) continue;
    const lastHttps = line.lastIndexOf('](https://');
    const lastHttp = line.lastIndexOf('](http://');
    const lastUrlStart = lastHttps >= lastHttp ? lastHttps : lastHttp;
    if (lastUrlStart < 0) continue;
    const urlStart = lastUrlStart + 2;
    const urlEnd = line.indexOf(')', urlStart);
    if (urlEnd < 0) continue;
    const url = line.slice(urlStart, urlEnd).trim();
    if (url.includes('start.me/p/')) continue;
    const innerClose = line.lastIndexOf(')', lastUrlStart);
    let title = '';
    if (innerClose >= 0 && innerClose < lastUrlStart) {
      title = line.slice(innerClose + 1, lastUrlStart).trim();
    } else {
      const openBracket = line.indexOf('[');
      title = line.slice(openBracket + 1, lastUrlStart).trim();
    }
    title = title.replace(/[`*_\u200E\u200F]+/g, '').trim();
    if (!title || !url) continue;
    let description: string | undefined;
    const rest = line.slice(urlEnd + 1).trim();
    const cleaned = rest.replace(/^[)\s"\u2018\u2019]+/, '').replace(/[)\s"\u2018\u2019]+$/, '');
    if (cleaned && cleaned.length > 2 && !cleaned.startsWith('!')) {
      description = cleaned.replace(/\s+/g, ' ').trim().slice(0, 240);
    }
    current.tools.push({ section: current.name, title, url, description });
  }
  if (current) sections.push(current);
  const filtered = sections.filter((s) => s.tools.length > 0);
  const totalTools = filtered.reduce((n, s) => n + s.tools.length, 0);
  return { sections: filtered, totalTools, totalSections: filtered.length };
}

/** Manual fallback used until the first successful cron run. */
export const CURATED_TOOLBOX_SEED: CuratedToolboxPayload = {
  source: 'seed:v1',
  sourceUrl: CURATED_STARTME_URL,
  fetchedAt: '1970-01-01T00:00:00.000Z',
  ok: true,
  sections: [
    {
      name: 'Phishing Analysis',
      tools: [
        {
          section: 'Phishing Analysis',
          title: 'Google Safe Browsing — report_phish',
          url: 'https://safebrowsing.google.com/safebrowsing/report_phish/',
        },
        { section: 'Phishing Analysis', title: 'Phish.report', url: 'https://phish.report/analysis/' },
        {
          section: 'Phishing Analysis',
          title: 'Valimail Domain Lookalike Finder',
          url: 'https://valimail.com/domain-lookalike-finder/',
        },
        { section: 'Phishing Analysis', title: 'PhishTool', url: 'https://www.phishtool.com/' },
        { section: 'Phishing Analysis', title: 'EML Analyzer', url: 'https://eml-analyzer.herokuapp.com/' },
        { section: 'Phishing Analysis', title: 'CyberChef', url: 'https://gchq.github.io/CyberChef/' },
        { section: 'Phishing Analysis', title: 'PhishTank', url: 'https://www.phishtank.com/' },
        { section: 'Phishing Analysis', title: 'OpenPhish', url: 'https://openphish.com/' },
        { section: 'Phishing Analysis', title: 'ScamSearch', url: 'https://scamsearch.io/' },
      ],
    },
    {
      name: 'URL Reputation',
      tools: [
        { section: 'URL Reputation', title: 'VirusTotal', url: 'https://www.virustotal.com/' },
        { section: 'URL Reputation', title: 'URLScan.io', url: 'https://urlscan.io/' },
        { section: 'URL Reputation', title: 'urlscan.io Search', url: 'https://urlscan.io/search/' },
        { section: 'URL Reputation', title: 'AbuseIPDB', url: 'https://www.abuseipdb.com/' },
        { section: 'URL Reputation', title: 'ThreatCrowd', url: 'https://www.threatcrowd.org/' },
      ],
    },
    {
      name: 'File / Malware Analysis',
      tools: [
        { section: 'File / Malware Analysis', title: 'Hybrid Analysis', url: 'https://www.hybrid-analysis.com/' },
        { section: 'File / Malware Analysis', title: 'ANY.RUN', url: 'https://any.run/' },
        { section: 'File / Malware Analysis', title: 'Joe Sandbox', url: 'https://www.joesandbox.com/' },
        { section: 'File / Malware Analysis', title: 'MalShare', url: 'https://malshare.com/' },
        { section: 'File / Malware Analysis', title: 'MalwareBazaar', url: 'https://bazaar.abuse.ch/' },
        { section: 'File / Malware Analysis', title: 'Intezer Analyze', url: 'https://analyze.intezer.com/' },
        { section: 'File / Malware Analysis', title: 'CAPE Sandbox', url: 'https://capesandbox.com/' },
      ],
    },
    {
      name: 'IP Reputation',
      tools: [
        { section: 'IP Reputation', title: 'AbuseIPDB', url: 'https://www.abuseipdb.com/' },
        { section: 'IP Reputation', title: 'GreyNoise', url: 'https://viz.greynoise.io/' },
        { section: 'IP Reputation', title: 'Shodan', url: 'https://www.shodan.io/' },
        { section: 'IP Reputation', title: 'Censys', url: 'https://search.censys.io/' },
        { section: 'IP Reputation', title: 'IPinfo', url: 'https://ipinfo.io/' },
      ],
    },
    {
      name: 'Sigma / YARA / KQL / SPL',
      tools: [
        { section: 'Sigma / YARA / KQL / SPL', title: 'SigmaHQ Rules', url: 'https://github.com/SigmaHQ/sigma' },
        { section: 'Sigma / YARA / KQL / SPL', title: 'YARA Forge', url: 'https://yarahq.github.io/' },
        { section: 'Sigma / YARA / KQL / SPL', title: 'YaraRules Project', url: 'https://github.com/Yara-Rules/rules' },
        {
          section: 'Sigma / YARA / KQL / SPL',
          title: 'Elastic Detection Rules',
          url: 'https://github.com/elastic/detection-rules',
        },
        { section: 'Sigma / YARA / KQL / SPL', title: 'LOLBAS', url: 'https://lolbas-project.github.io/' },
      ],
    },
    {
      name: 'OSINT',
      tools: [
        { section: 'OSINT', title: 'OSINT Framework', url: 'https://osintframework.com/' },
        { section: 'OSINT', title: 'Maltego', url: 'https://www.maltego.com/' },
        { section: 'OSINT', title: 'SpiderFoot', url: 'https://github.com/smicallef/spiderfoot' },
        { section: 'OSINT', title: 'theHarvester', url: 'https://github.com/laramies/theHarvester' },
        { section: 'OSINT', title: 'Intel Techniques', url: 'https://inteltechniques.com/' },
      ],
    },
    {
      name: 'Ransomware',
      tools: [
        { section: 'Ransomware', title: 'Ransomware.live', url: 'https://ransomware.live/' },
        { section: 'Ransomware', title: 'Ransomlook', url: 'https://www.ransomlook.io/' },
        { section: 'Ransomware', title: 'Ransomwatch', url: 'https://ransomwatch.telemetry.ltd/' },
        { section: 'Ransomware', title: 'Ransomwhere', url: 'https://ransomwhere.com/' },
        {
          section: 'Ransomware',
          title: 'Have I Been Pwned (Ransomware tracker)',
          url: 'https://haveibeenpwned.com/Ransomware',
        },
      ],
    },
    {
      name: 'Vulnerability Intelligence',
      tools: [
        {
          section: 'Vulnerability Intelligence',
          title: 'CISA KEV',
          url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        },
        { section: 'Vulnerability Intelligence', title: 'NVD', url: 'https://nvd.nist.gov/' },
        { section: 'Vulnerability Intelligence', title: 'Vulners', url: 'https://vulners.com/' },
        { section: 'Vulnerability Intelligence', title: 'VulnCheck', url: 'https://vulncheck.com/' },
        { section: 'Vulnerability Intelligence', title: 'Exploit-DB', url: 'https://www.exploit-db.com/' },
      ],
    },
  ],
  totalTools: 41,
  totalSections: 8,
};

export async function syncCuratedToolbox(
  env: Env
): Promise<{ ok: boolean; error?: string; totalTools?: number; totalSections?: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CURATED_JINA_URL, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/plain' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `jina ${res.status}` };
    const md = await res.text();
    if (md.length < 500) {
      return { ok: false, error: 'jina response too short (likely blocked)' };
    }
    const parsed = parseStartmeMarkdown(md);
    if (parsed.totalTools === 0) {
      return { ok: false, error: 'parsed 0 tools (markdown shape changed?)' };
    }
    const payload: CuratedToolboxPayload = {
      source: 'jina',
      sourceUrl: CURATED_STARTME_URL,
      fetchedAt: new Date().toISOString(),
      ok: true,
      sections: parsed.sections,
      totalTools: parsed.totalTools,
      totalSections: parsed.totalSections,
    };
    if (env.KV_CACHE) {
      await env.KV_CACHE.put(CURATED_TOOLBOX_KV_KEY, JSON.stringify(payload));
      const meta: CuratedMeta = {
        source: 'jina',
        sourceUrl: CURATED_STARTME_URL,
        fetchedAt: payload.fetchedAt,
        ok: true,
        totalTools: payload.totalTools,
        totalSections: payload.totalSections,
      };
      await env.KV_CACHE.put(CURATED_TOOLBOX_META_KEY, JSON.stringify(meta));
      // Write-through to per-colo cache shadow (see OWASP handler above).
      try {
        const cache = (caches as unknown as { default: Cache }).default;
        await cache.put(
          shadowCacheReq('curated', CURATED_TOOLBOX_KV_KEY),
          new Response(JSON.stringify(payload), {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
          })
        );
        await cache.put(
          shadowCacheReq('curated-meta', CURATED_TOOLBOX_META_KEY),
          new Response(JSON.stringify(meta), {
            headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' },
          })
        );
      } catch {
        /* best-effort */
      }
    }
    return { ok: true, totalTools: payload.totalTools, totalSections: payload.totalSections };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (env.KV_CACHE) {
      const meta: CuratedMeta = {
        source: 'jina',
        sourceUrl: CURATED_STARTME_URL,
        fetchedAt: new Date().toISOString(),
        ok: false,
        error: msg,
        totalTools: 0,
        totalSections: 0,
      };
      await env.KV_CACHE.put(CURATED_TOOLBOX_META_KEY, JSON.stringify(meta));
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function getCuratedToolboxHandler(c: Context<{ Bindings: Env }>) {
  const kv = c.env.KV_CACHE;
  if (!kv) {
    return c.json(CURATED_TOOLBOX_SEED, 200, { 'cache-control': 'public, max-age=60' });
  }
  // L1: cache-api shadow. Same pattern as the OWASP handler — payload is
  // large JSON, low write rate, identical across colos.
  const cache = (caches as unknown as { default: Cache }).default;
  const shadowReq = shadowCacheReq('curated', CURATED_TOOLBOX_KV_KEY);
  try {
    const hit = await cache.match(shadowReq);
    if (hit)
      return new Response(hit.body, {
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
      });
  } catch {
    /* fall through to KV */
  }
  const raw = await kv.get(CURATED_TOOLBOX_KV_KEY, 'json');
  if (raw) {
    try {
      await cache.put(
        shadowReq,
        new Response(JSON.stringify(raw), {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` },
        })
      );
    } catch {
      /* best-effort */
    }
    return c.json(raw, 200, { 'cache-control': `public, max-age=${CACHE_MAX_AGE_S}` });
  }
  let meta: CuratedMeta | null = null;
  try {
    meta = (await kv.get(CURATED_TOOLBOX_META_KEY, 'json')) as CuratedMeta | null;
  } catch {
    /* ignore */
  }
  return c.json({ ...CURATED_TOOLBOX_SEED, meta }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function getCuratedToolboxMetaHandler(c: Context<{ Bindings: Env }>) {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ ok: true, source: 'seed' }, 200, { 'cache-control': 'no-store' });
  // L1: cache-api shadow (60s TTL is fine for meta — UI just shows the
  // last-updated stamp; the value only flips on cron sync).
  const cache = (caches as unknown as { default: Cache }).default;
  const shadowReq = shadowCacheReq('curated-meta', CURATED_TOOLBOX_META_KEY);
  try {
    const hit = await cache.match(shadowReq);
    if (hit)
      return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    /* fall through to KV */
  }
  const raw = await kv.get(CURATED_TOOLBOX_META_KEY, 'json');
  const value = raw ?? { ok: true, source: 'seed' };
  try {
    await cache.put(
      shadowReq,
      new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' },
      })
    );
  } catch {
    /* best-effort */
  }
  return c.json(value, 200, { 'cache-control': 'no-store' });
}
