/**
 * IOC pivot chain — deterministic enrichment that runs BEFORE the LLM planner
 * takes over, when the query contains a concrete indicator (hash, domain, or
 * IP). Mirrors the NamrataSonii-style "follow the infrastructure graph"
 * investigation: hash → domains → subdomains → C2 IP → contacted IPs →
 * related files.
 *
 * Why a deterministic step (not LLM-driven):
 * The planner is query-centric ("tell me about X") and may stop after one
 * enrichment. A pivot chain forces the infrastructure walk that produces the
 * subdomain/C2/contacted-IP graph a deep-dive report needs. The LLM planner
 * then starts from a rich working memory instead of an empty one.
 *
 * The chain is best-effort: every tool call is wrapped so a single failure
 * (rate limit, 404, timeout) never blocks the rest. Failures are recorded as
 * `status: 'error'` results so the observer/planner sees them.
 */
import type { AgentStep, AgentTool, AgentToolResult } from './types';
import type { QueryEntities } from './query-entities';

/** A single tool call to execute as part of the pivot chain. */
interface PivotCall {
  tool: string;
  args: Record<string, unknown>;
  /** Why this call is in the chain — surfaced as the step's `plan`. */
  reason: string;
}

/** Max parallel tool calls per pivot batch (free-plan subrequest budget). */
const MAX_PARALLEL = 4;

/**
 * Build the deterministic pivot chain for the query's primary indicator.
 * Returns the ordered list of tool calls to execute. Returns an empty array
 * when the query has no concrete indicator to pivot from (actor/CVE/ransomware
 * queries don't benefit from an infrastructure walk).
 */
export function buildPivotChain(entities: QueryEntities): PivotCall[] {
  const calls: PivotCall[] = [];

  // ── Hash pivot: traceix → domains/IPs from verdicts → domain lookup → IOC check ──
  if (entities.hashes.length > 0) {
    const hash = entities.hashes[0]!;
    calls.push({ tool: 'traceix_lookup', args: { hash }, reason: `AV/reputation lookup for ${hash.slice(0, 16)}…` });
    // After traceix, we'd extract contacted domains/IPs — but those come back
    // in the result, so we add a follow-up batch that runs AFTER we see the
    // traceix result. That follow-up is handled by extractPivotFollowUps().
  }

  // ── Domain pivot: full domain intel + passive DNS (subdomains) + relationships ──
  if (entities.domains.length > 0) {
    const domain = entities.domains[0]!;
    calls.push({ tool: 'lookup_domain', args: { domain }, reason: `DNS/WHOIS/CT/blocklist intel for ${domain}` });
    calls.push({
      tool: 'passive_dns_lookup',
      args: { q: domain },
      reason: `Subdomain + historical IP enumeration for ${domain}`,
    });
    calls.push({
      tool: 'get_relationships',
      args: { indicator: domain },
      reason: `Relationship graph (actors/malware/CVEs) for ${domain}`,
    });
  }

  // ── IP pivot: IOC check + deep enrich + reverse DNS + geo + relationships ──
  if (entities.ips.length > 0) {
    const ip = entities.ips[0]!;
    calls.push({ tool: 'check_ioc', args: { indicator: ip }, reason: `Multi-source reputation check for ${ip}` });
    calls.push({
      tool: 'enrich_ioc_deep',
      args: { indicator: ip },
      reason: `Deep enrichment (ASN/geo/VPN/proxy) for ${ip}`,
    });
    calls.push({ tool: 'lookup_reverse_dns', args: { ip }, reason: `Reverse DNS (hostname) for ${ip}` });
    calls.push({
      tool: 'get_relationships',
      args: { indicator: ip },
      reason: `Relationship graph (actors/malware/CVEs) for ${ip}`,
    });
  }

  // ── URL pivot: extract domain, treat as domain + check the URL ──
  if (entities.urls.length > 0 && entities.domains.length === 0) {
    try {
      const u = new URL(entities.urls[0]!);
      const domain = u.hostname;
      calls.push({ tool: 'lookup_domain', args: { domain }, reason: `Domain intel for URL host ${domain}` });
      calls.push({ tool: 'passive_dns_lookup', args: { q: domain }, reason: `Subdomain enumeration for ${domain}` });
    } catch {
      /* malformed URL — skip */
    }
  }

  // ── Actor pivot: enrich_actor + actor_timeline + ransomware group profile ──
  // Actors have infrastructure (leak sites, payment addresses, C2) and TTPs
  // worth seeding before the LLM planner takes over. The group profile
  // (ransomware.live) returns the leak-site URL, payment addresses, and
  // known infrastructure that the report's Network Communication + IOC
  // sections need.
  if (
    entities.actors.length > 0 &&
    entities.hashes.length === 0 &&
    entities.domains.length === 0 &&
    entities.ips.length === 0
  ) {
    const actor = entities.actors[0]!;
    const slug = actorToSlug(actor);
    calls.push({ tool: 'enrich_actor', args: { actor: slug }, reason: `Actor profile + aliases + TTPs for ${actor}` });
    calls.push({ tool: 'actor_timeline', args: { actor: slug }, reason: `Activity timeline for ${actor}` });
    calls.push({
      tool: 'get_ransomware_group_profile',
      args: { slug },
      reason: `Ransomware group profile (leak site, payment, CVEs) for ${actor}`,
    });
    calls.push({
      tool: 'get_ransomware_activity',
      args: { group: slug },
      reason: `Recent leak-site posts + victim disclosures for ${actor}`,
    });
  }

  return calls;
}

/** Normalize an actor name to the slug the tools expect (lowercase, hyphenated). */
function actorToSlug(actor: string): string {
  return actor
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^(apt)(\d+)$/, '$1-$2');
}

/**
 * After the first pivot batch runs, extract follow-up indicators from the
 * results (e.g. domains/IPs discovered in a traceix or passive-DNS response)
 * and build a second batch of enrichment calls. This is the "follow the
 * graph" step — hash → contacted domains → domain intel → resolved IPs →
 * IOC check on those IPs.
 *
 * Returns at most MAX_PARALLEL calls (free-plan subrequest budget).
 */
export function buildPivotFollowUps(primaryEntities: QueryEntities, stepResults: AgentToolResult[]): PivotCall[] {
  const discoveredIps = new Set<string>();
  const discoveredDomains = new Set<string>();

  for (const r of stepResults) {
    if (r.status !== 'ok' || !r.data) continue;
    const json = JSON.stringify(r.data);
    // Extract IPs (avoid the query's own primary IP — already enriched)
    for (const ip of json.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []) {
      if (ip !== primaryEntities.ips[0] && isValidIp(ip)) discoveredIps.add(ip);
    }
    // Extract domains
    for (const d of json.match(
      /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|org|net|io|co|ru|cn|gov|edu|info|xyz|biz|us|uk|de|fr|nl|to|me|cc|tk)\b/gi
    ) ?? []) {
      const lower = d.toLowerCase();
      if (lower !== primaryEntities.domains[0]) discoveredDomains.add(lower);
    }
  }

  const followUps: PivotCall[] = [];

  // Enrich up to 3 discovered IPs (IOC check + reverse DNS)
  for (const ip of [...discoveredIps].slice(0, 3)) {
    followUps.push({ tool: 'check_ioc', args: { indicator: ip }, reason: `Reputation check for discovered IP ${ip}` });
  }
  // Enrich up to 2 discovered domains (passive DNS for subdomains)
  for (const domain of [...discoveredDomains].slice(0, 2)) {
    followUps.push({
      tool: 'passive_dns_lookup',
      args: { q: domain },
      reason: `Subdomain enumeration for discovered domain ${domain}`,
    });
  }

  return followUps.slice(0, MAX_PARALLEL);
}

function isValidIp(ip: string): boolean {
  return ip.split('.').every((oct) => {
    const n = Number(oct);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/**
 * Execute the pivot chain as a single deterministic "step 0" before the LLM
 * planner takes over. Returns an AgentStep (stepNumber 0) with the collected
 * results, or null when the query has no indicator to pivot from.
 *
 * The step is marked `stepNumber: 0` so it sorts before the planner's step 1
 * and is clearly labeled as deterministic enrichment in the report.
 */
export async function executePivotChain(entities: QueryEntities, tools: AgentTool[]): Promise<AgentStep | null> {
  const primaryCalls = buildPivotChain(entities);
  if (primaryCalls.length === 0) return null;

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const startedAt = new Date().toISOString();

  // Batch 1: primary indicator enrichment (parallel)
  const batch1Results = await runPivotBatch(primaryCalls, toolMap);

  // Batch 2: follow-up enrichment on discovered indicators (parallel)
  const followUpCalls = buildPivotFollowUps(entities, batch1Results);
  const batch2Results = await runPivotBatch(followUpCalls, toolMap);

  const allResults = [...batch1Results, ...batch2Results];
  const okCount = allResults.filter((r) => r.status === 'ok').length;
  const errCount = allResults.filter((r) => r.status === 'error').length;

  const plan = [
    'Deterministic IOC pivot chain — infrastructure graph walk:',
    ...primaryCalls.map((c) => `  • ${c.tool}(${JSON.stringify(c.args)}) — ${c.reason}`),
    ...(followUpCalls.length > 0
      ? [
          `Follow-up enrichment on discovered indicators:`,
          ...followUpCalls.map((c) => `  • ${c.tool}(${JSON.stringify(c.args)}) — ${c.reason}`),
        ]
      : []),
  ].join('\n');

  return {
    stepNumber: 0,
    plan,
    toolCalls: [...primaryCalls, ...followUpCalls].map((c) => ({ tool: c.tool, args: c.args, reasoning: c.reason })),
    results: allResults,
    status: errCount === allResults.length ? 'error' : 'done',
    startedAt,
    completedAt: new Date().toISOString(),
    observation: `Pivot chain collected ${okCount} results (${errCount} errors) before the LLM planner started. Infrastructure graph seeded for the report's Detailed Analysis section.`,
    nextAction: 'continue',
  };
}

/** Run a batch of pivot tool calls in parallel (capped at MAX_PARALLEL). */
async function runPivotBatch(calls: PivotCall[], toolMap: Map<string, AgentTool>): Promise<AgentToolResult[]> {
  const batch = calls.slice(0, MAX_PARALLEL);
  const results = await Promise.all(
    batch.map(async (call): Promise<AgentToolResult> => {
      const tool = toolMap.get(call.tool);
      if (!tool) {
        return {
          tool: call.tool,
          args: call.args,
          status: 'error',
          error: `tool not in registry`,
          durationMs: 0,
        };
      }
      const start = Date.now();
      try {
        const data = await Promise.race([tool.execute(call.args), timeout(30_000)]);
        return {
          tool: call.tool,
          args: call.args,
          status: 'ok',
          data,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          tool: call.tool,
          args: call.args,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    })
  );
  return results;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('pivot tool timeout')), ms));
}
