import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, badGateway } from '../lib/api-error';

/**
 * KQL hunting-query scraper for ransomware.live.
 *
 * The PRO API (api-pro.ransomware.live) does NOT expose KQL queries —
 * `/kql` returns 404 even with a valid key. The queries live only on the
 * public website at `/kql` (index) and `/kql/view/{id}` (full query).
 * This module scrapes those pages, extracts structured data, and caches
 * it for 24h (the dataset changes rarely — new queries are added
 * occasionally, existing ones are stable).
 *
 * Routes (registered BEFORE the generic /api/v1/rl/:resource proxy):
 *   GET /api/v1/rl/kql          → KQL index (all queries, grouped)
 *   GET /api/v1/rl/kql/:id      → single KQL query (full content)
 */

const SITE_BASE = 'https://www.ransomware.live';
const CACHE_TTL = 24 * 60 * 60; // 24h
const FETCH_TIMEOUT = 15_000;
const UA = 'pranithjain.qzz.io CTI (read-only)';

export interface KqlQuerySummary {
  id: string;
  title: string;
  group: string;
  category: string;
  mitre: string;
}

export interface KqlIndexResponse {
  source: string;
  fetched_at: string;
  total_queries: number;
  total_groups: number;
  queries: KqlQuerySummary[];
}

export interface KqlQueryDetail {
  source: string;
  id: string;
  title: string;
  group: string;
  mitre: string;
  tactic: string;
  data_source: string;
  date_added: string;
  last_updated: string;
  description: string;
  query: string;
}

/** Decode HTML entities (&gt; &lt; &#34; &#39; &amp;). */
function decodeHtml(s: string): string {
  return s
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/**
 * Parse the KQL index page. The HTML structure is:
 *   <span class="rl-group-badge">8base</span> ... <span class="badge">1</span>
 *   <ul>
 *     <li class="kql-query-row">
 *       <a href="/kql/view/13">8Base – Rootkit-Capable ...</a>
 *       <span class="badge">Defense Evasion</span>
 *       <code>T1489</code>  (MITRE technique, inside an <a> to attack.mitre.org)
 *     </li>
 *   </ul>
 */
function parseKqlIndex(html: string): KqlQuerySummary[] {
  const queries: KqlQuerySummary[] = [];
  let currentGroup = '';

  // Split on group badges to track the current group context.
  const groupSplit = html.split(/<span class="rl-group-badge"[^>]*>/);
  for (let i = 1; i < groupSplit.length; i++) {
    const chunk = groupSplit[i]!;
    // Group name is the text before the next tag.
    const groupMatch = /^([^<]+)/.exec(chunk);
    if (groupMatch) currentGroup = groupMatch[1]!.trim().toLowerCase();

    // Find all /kql/view/{id} links in this group's chunk.
    const linkRegex = /<a href="\/kql\/view\/(\d+)"[^>]*>([^<]+)<\/a>/g;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(chunk)) !== null) {
      const id = linkMatch[1]!;
      const title = decodeHtml(linkMatch[2]!.trim());

      // Look ahead in the chunk for category + MITRE after this link.
      const after = chunk.slice(linkMatch.index! + linkMatch[0].length);
      const afterSlice = after.slice(0, 600);

      // Category: text inside the next badge span (e.g. "Defense Evasion").
      const catMatch = /<span class="badge[^"]*"[^>]*>\s*(?:<i[^>]*><\/i>)?\s*([^<]+?)\s*<\/span>/.exec(afterSlice);
      const category = catMatch ? catMatch[1]!.trim() : '';

      // MITRE: technique ID like T1489 or T1574.001 (often in an <a> to attack.mitre.org or a <code>).
      const mitreMatch = /(?:techniques\/(T\d{4}(?:\.\d{3})?)|>(T\d{4}(?:\.\d{3})?)<)/.exec(afterSlice);
      const mitre = mitreMatch ? (mitreMatch[1] ?? mitreMatch[2] ?? '') : '';

      queries.push({ id, title, group: currentGroup, category, mitre });
    }
  }

  return queries;
}

/**
 * Parse a single KQL view page. Key elements:
 *   <h1>Title</h1>
 *   <a href="/group/{group}">  (group name)
 *   <a href="https://attack.mitre.org/techniques/T1490/">  (MITRE)
 *   >Data Source</div> ... <code>DeviceProcessEvents</code>
 *   >Date Added</div> ... <div>2026-07-23</div>
 *   >What This Detects</div> ... <div>description</div>
 *   <code class="language-kusto" id="queryContent">...query...</code>
 */
function parseKqlView(html: string, id: string): KqlQueryDetail | null {
  const titleMatch = /<h1[^>]*>([^<]+)/.exec(html);
  const title = titleMatch ? decodeHtml(titleMatch[1]!.trim()) : `KQL Query #${id}`;

  const groupMatch = /\/group\/([a-z0-9._-]+)/i.exec(html);
  const group = groupMatch ? groupMatch[1]! : '';

  const mitreMatch = /attack\.mitre\.org\/techniques\/(T\d{4}(?:\.\d{3})?)/.exec(html);
  const mitre = mitreMatch ? mitreMatch[1]! : '';

  // Tactic name follows the MITRE link.
  const tacticMatch = mitre
    ? new RegExp(`techniques/${mitre.replace(/\./g, '\\.')}["/][^>]*>[^<]*</a>\\s*([^<]+)`).exec(html)
    : null;
  const tactic = tacticMatch ? tacticMatch[1]!.trim() : '';

  const extractField = (label: string): string => {
    const re = new RegExp(`>${label}</div>\\s*(?:<[^>]*>)?\\s*([^<]+)`, 'i');
    const m = re.exec(html);
    return m ? decodeHtml(m[1]!.trim()) : '';
  };

  const dataSourceMatch = />Data Source<\/div>\s*<div><code>([^<]+)/.exec(html);
  const data_source = dataSourceMatch ? decodeHtml(dataSourceMatch[1]!.trim()) : '';

  const date_added = extractField('Date Added');
  const last_updated = extractField('Last Updated');

  // Description: text after "What This Detects" label div.
  const descMatch = />What This Detects<\/div>\s*<div>([\s\S]*?)<\/div>/.exec(html);
  const description = descMatch ? decodeHtml(stripTags(descMatch[1]!).trim()) : '';

  // Query content from the kusto code block.
  const queryMatch = /id="queryContent"[^>]*>([\s\S]*?)<\/code>/.exec(html);
  const query = queryMatch ? decodeHtml(queryMatch[1]!.trim()) : '';

  if (!query) return null;

  return {
    source: 'ransomware.live (scraped)',
    id,
    title,
    group,
    mitre,
    tactic,
    data_source,
    date_added,
    last_updated,
    description,
    query,
  };
}

export async function kqlIndexHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://rl-kql-index-cache.internal/v1');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const html = await fetchPage(`${SITE_BASE}/kql`);
  if (!html) {
    return badGateway(c, 'upstream_unreachable');
  }

  const queries = parseKqlIndex(html);
  const groups = new Set(queries.map((q) => q.group));
  const body: KqlIndexResponse = {
    source: 'ransomware.live (scraped)',
    fetched_at: new Date().toISOString(),
    total_queries: queries.length,
    total_groups: groups.size,
    queries,
  };

  const response = c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export async function kqlViewHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id') ?? '';
  if (!/^\d{1,4}$/.test(id)) {
    return badRequest(c, 'bad_id');
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://rl-kql-view-cache.internal/v1/${id}`);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const html = await fetchPage(`${SITE_BASE}/kql/view/${id}`);
  if (!html) {
    return badGateway(c, 'upstream_unreachable');
  }

  const detail = parseKqlView(html, id);
  if (!detail) {
    return badGateway(c, 'parse_failed');
  }

  const response = c.json(detail, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
