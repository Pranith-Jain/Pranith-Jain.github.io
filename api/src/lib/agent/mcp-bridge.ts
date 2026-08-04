/**
 * MCP-to-agent bridge.
 *
 * The investigator agent (InvestigatorAgentDO) and the MCP server
 * (DfirMcpServer / DFIR_MCP) are two parallel tool surfaces. The agent
 * builds its own AgentTool[] registry in tools.ts (124 tools, each
 * calling a REST route via self.fetch). The MCP server registers 279
 * tools via this.tools(...) on the DFIR_MCP Durable Object. ~155 MCP
 * tools are invisible to the agent — including every ti_*, si_*,
 * winreg_*, depx_*, traceix, whoxy, breach_vip, and Tor tool.
 *
 * This bridge closes that gap. It generates AgentTool[] entries for
 * the high-value MCP-only tools by calling the same library functions
 * the MCP server uses — no HTTP hop, no auth, same memory space. The
 * agent DO has env.ASSETS (Worker-level binding) so manifest loaders
 * work identically to how the MCP server reads them.
 *
 * Usage in investigator-agent.ts:
 *   const allTools = [
 *     ...buildToolRegistry(this.env.SELF, undefined, { 'x-internal-token': internalToken }),
 *     ...bridgeMcpTools(this.env.ASSETS, this.env as unknown as ApiEnv),
 *   ];
 *
 * The bridge is additive — it only adds tools that are NOT already in
 * the hand-written registry (dedup by name). This keeps the existing
 * tool semantics (caching, timeouts, retry) intact for the 124 tools
 * that already work, and layers in the 155 MCP-only tools on top.
 */
import type { AgentTool } from './types';

// Threat Intel manifest (CVEs, KEV, IOCs, sector briefs, darknet directory)
import {
  loadTiIndex,
  loadKevSnapshot,
  getTiCve,
  getTiIoc,
  getTiSector,
  getTiList,
  filterCves,
  filterIocs,
  filterLists,
  searchListEntries,
  tiCacheStats,
  loadDarknetIndex,
  getDarknetSite,
  getDarknetCategory,
  filterDarknetSites,
  type TiSeverity,
  type TiIocIndexEntry,
} from '../threat-intel-manifest';

// Security Investigator manifest (25 skills, 45 KQL queries, 3 automations)
import {
  loadSiIndex,
  getSiSkill,
  getSiQuery,
  getSiAutomation,
  loadDocsIndex,
  getDoc,
  filterSkills,
  filterQueries,
  type SiSkillCategory,
} from '../si-manifest';

// WinReg manifest (292 Windows registry forensic artifacts)
import { loadWinRegIndex, getWinRegArtifact, filterArtifacts } from '../winreg-manifest';

// Traceix (SHA-256 AV reputation lookup)
import { traceixLookup } from '../traceix';

// Whoxy (reverse WHOIS)
import { whoxyReverseWhois } from '../whoxy';

// depx (supply-chain malicious packages) — uses REST route, not a lib
// breach_vip_search — uses REST route

type EnvWithAssets = { ASSETS?: Fetcher; TRACEIX_API_KEY?: string; WHOXY_API_KEY?: string };

/**
 * Build AgentTool[] entries for MCP-only tools, calling library
 * functions directly (same as the MCP server). Deduplicates against
 * the existing registry so we never register the same tool twice.
 */
export function bridgeMcpTools(
  assets: Fetcher | undefined,
  env: EnvWithAssets,
  existingNames: Set<string>,
  self?: Fetcher,
  internalHeader?: Record<string, string>
): AgentTool[] {
  const tools: AgentTool[] = [];
  const seen = new Set(existingNames);

  function add(tool: AgentTool): void {
    if (seen.has(tool.name)) return;
    seen.add(tool.name);
    tools.push(tool);
  }

  // Helper: call a REST route via self.fetch (for tools that don't have
  // a direct library function, like depx and breach_vip_search).
  async function apiFetch<T>(path: string): Promise<T> {
    if (!self) throw new Error('self fetcher unavailable for MCP bridge REST call');
    const headers: Record<string, string> = { accept: 'application/json', ...(internalHeader ?? {}) };
    const req = new Request(`https://api.local${path}`, { headers, signal: AbortSignal.timeout(30_000) });
    const res = await self.fetch(req);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  THREAT INTEL — ti_* (CVEs, KEV, IOCs, sector briefs, detection lists)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'ti_list_cves',
    description:
      'List CVEs from the threat-intel vertical (NVD + CISA KEV). CVEs are enriched with priority scoring (CVSS + KEV + recency). Filter by severity, KEV-only, vendor, recency, or keyword.',
    params: [
      {
        name: 'severity',
        type: 'enum',
        description: 'Filter by CVSS v3 severity: critical, high, medium, low, unknown',
        required: false,
        enum: ['critical', 'high', 'medium', 'low', 'unknown'],
      },
      {
        name: 'kevOnly',
        type: 'boolean',
        description: 'Only return CVEs in CISA Known Exploited Vulnerabilities catalog',
        required: false,
      },
      {
        name: 'vendor',
        type: 'string',
        description: 'Case-insensitive substring match against vendor field',
        required: false,
      },
      {
        name: 'daysBack',
        type: 'number',
        description: 'Only CVEs published within this many days (1-365)',
        required: false,
      },
      { name: 'minPriority', type: 'number', description: 'Minimum priority score (0-100)', required: false },
      {
        name: 'keyword',
        type: 'string',
        description: 'Case-insensitive match against CVE ID / vendor / product / description',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max CVEs to return (default 50, max 200)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadTiIndex(assets);
      return filterCves(idx, {
        severity: args.severity as TiSeverity | undefined,
        kevOnly: args.kevOnly as boolean | undefined,
        vendor: args.vendor as string | undefined,
        daysBack: args.daysBack as number | undefined,
        minPriority: args.minPriority as number | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'ti_get_cve',
    description:
      'Return the full CVE body with CVSS vector, CWE IDs, references, and LLM summary/recommended action. Use ti_list_cves first to discover CVE IDs.',
    params: [
      { name: 'cveId', type: 'string', description: 'CVE ID, e.g. "CVE-2026-1001". Case-insensitive.', required: true },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getTiCve(assets, args.cveId as string);
    },
  });

  add({
    name: 'ti_list_kev',
    description:
      'Return the CISA Known Exploited Vulnerabilities (KEV) snapshot — actively exploited CVEs with required actions and due dates.',
    params: [
      { name: 'vendor', type: 'string', description: 'Filter by vendor (case-insensitive substring)', required: false },
      { name: 'limit', type: 'number', description: 'Max KEV entries (default 100, max 500)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const kev = await loadKevSnapshot(assets);
      const needle = (args.vendor as string)?.toLowerCase();
      const out = needle ? kev.filter((e) => e.vendor.toLowerCase().includes(needle)) : kev;
      return out.slice(0, (args.limit as number) ?? 100);
    },
  });

  add({
    name: 'ti_list_iocs',
    description: 'List IOC families (ransomware, malware, APT, C2, phishing, stealers) from the threat-intel vertical.',
    params: [
      {
        name: 'category',
        type: 'enum',
        description: 'Filter by category',
        required: false,
        enum: ['ransomware', 'malware', 'apt', 'c2', 'phishing', 'stealer', 'other'],
      },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against slug / family / aliases / description',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max families (default 50, max 100)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadTiIndex(assets);
      return filterIocs(idx, {
        category: args.category as TiIocIndexEntry['category'] | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'ti_get_ioc',
    description:
      'Return the full IOC family body with indicators, MITRE techniques, and context. Use ti_list_iocs first to discover family slugs.',
    params: [
      { name: 'slug', type: 'string', description: 'IOC family slug, e.g. "lockbit-4-0-ransomware"', required: true },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getTiIoc(assets, args.slug as string);
    },
  });

  add({
    name: 'ti_brief_sector',
    description:
      'Return a sector-specific threat brief (Financial, Healthcare, or Government) with executive summary, top threats, and recommended actions.',
    params: [
      {
        name: 'sector',
        type: 'enum',
        description: 'Target sector',
        required: true,
        enum: ['financial', 'healthcare', 'government'],
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getTiSector(assets, args.sector as string);
    },
  });

  add({
    name: 'ti_list_detection_lists',
    description:
      'List SOC/DFIR detection lists (suspicious named pipes, ports, user-agents, mutexes, ransomware extensions) sourced from mthcht/awesome-lists.',
    params: [
      {
        name: 'category',
        type: 'string',
        description: 'Filter by category: windows, network, ransomware, hardware, cloud, general',
        required: false,
      },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against slug / title / description',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max lists (default 50, max 100)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadTiIndex(assets);
      return filterLists(idx, {
        category: args.category as string | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'ti_get_detection_list',
    description:
      'Return a detection list with all entries. Filter by keyword or severity. Use ti_list_detection_lists first to discover slugs.',
    params: [
      { name: 'slug', type: 'string', description: 'List slug, e.g. "suspicious-named-pipes"', required: true },
      { name: 'keyword', type: 'string', description: 'Filter entries by keyword', required: false },
      { name: 'severity', type: 'string', description: 'Filter entries by severity', required: false },
      { name: 'limit', type: 'number', description: 'Max entries (default 500, max 2000)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const body = await getTiList(assets, args.slug as string);
      if (!body) return null;
      return searchListEntries(body, {
        keyword: args.keyword as string | undefined,
        severity: args.severity as string | undefined,
        limit: (args.limit as number) ?? 500,
      });
    },
  });

  add({
    name: 'ti_stats',
    description:
      'Return cache + manifest stats for the Threat Intel data: index loaded, KEV loaded, body-cache sizes and hit ratios.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadTiIndex(assets);
      return { counts: idx.counts, source: idx.source, lastSyncedAt: idx.lastSyncedAt, cache: tiCacheStats() };
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  DARKNET DIRECTORY — ti_*darknet* (darknetlist.is)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'ti_list_darknet',
    description:
      'List Tor-accessible sites from the darknetlist.is directory (markets, forums, news, security, comms, crypto, tools, AI). Each site has live up/down status, onion URL, response code, and fingerprint. Filter by category, status, recommended, or keyword.',
    params: [
      {
        name: 'category',
        type: 'string',
        description: 'Filter by category: markets, search, forums, news, security, communications, crypto, tools, ai',
        required: false,
      },
      { name: 'status', type: 'enum', description: 'Filter by live status', required: false, enum: ['up', 'down'] },
      { name: 'recommended', type: 'boolean', description: 'Only return recommended sites', required: false },
      { name: 'onionOnly', type: 'boolean', description: 'Only return .onion sites', required: false },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against site name / DWD ID / category',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max sites (default 200, max 500)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadDarknetIndex(assets);
      return filterDarknetSites(idx, {
        category: args.category as string | undefined,
        status: args.status as 'up' | 'down' | undefined,
        recommendedOnly: args.recommended as boolean | undefined,
        onionOnly: args.onionOnly as boolean | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 200,
      });
    },
  });

  add({
    name: 'ti_get_darknet_site',
    description:
      'Return the full site body from the darknetlist.is directory: name, DWD ID, category, onion URL, live status, mirror counts, latency, HTTP code, page size, and fingerprint.',
    params: [
      {
        name: 'slug',
        type: 'string',
        description: 'Site slug (DWD ID lowercased, e.g. "dwd-3c9c-715")',
        required: true,
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getDarknetSite(assets, args.slug as string);
    },
  });

  add({
    name: 'ti_get_darknet_category',
    description:
      'Return all sites in a darknetlist.is category (markets, search, forums, news, security, communications, crypto, tools, ai) with full details.',
    params: [
      {
        name: 'category',
        type: 'string',
        description: 'Category ID: markets, search, forums, news, security, communications, crypto, tools, ai',
        required: true,
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getDarknetCategory(assets, args.category as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  SECURITY INVESTIGATOR — si_* (25 skills, 45 KQL queries, 3 automations)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'si_list_skills',
    description:
      'List the 25 Security Investigator Agent Skills (Microsoft Sentinel / Defender XDR), filter by category or keyword. Each skill is a markdown playbook for a specific investigation type.',
    params: [
      { name: 'category', type: 'string', description: 'Filter by skill category', required: false },
      { name: 'keyword', type: 'string', description: 'Substring match against title / description', required: false },
      { name: 'limit', type: 'number', description: 'Max skills (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadSiIndex(assets);
      return filterSkills(idx, {
        category: args.category as SiSkillCategory | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'si_get_skill',
    description:
      'Return the full SKILL.md body (markdown) for a Security Investigator skill slug. Use si_list_skills first to discover slugs.',
    params: [{ name: 'slug', type: 'string', description: 'Skill slug, e.g. "svg-dashboard"', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getSiSkill(assets, args.slug as string);
    },
  });

  add({
    name: 'si_list_queries',
    description: 'List the 45 KQL queries (Sentinel / Defender XDR Advanced Hunting), filter by domain or keyword.',
    params: [
      { name: 'domain', type: 'string', description: 'Filter by KQL domain', required: false },
      { name: 'keyword', type: 'string', description: 'Substring match against title / description', required: false },
      { name: 'limit', type: 'number', description: 'Max queries (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadSiIndex(assets);
      return filterQueries(idx, {
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'si_get_query',
    description: 'Return the full KQL query body (markdown) for a slug. Use si_list_queries first to discover slugs.',
    params: [{ name: 'slug', type: 'string', description: 'Query slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getSiQuery(assets, args.slug as string);
    },
  });

  add({
    name: 'si_get_automation',
    description: 'Return a Security Investigator scheduled-workflow definition (3 available).',
    params: [{ name: 'slug', type: 'string', description: 'Automation slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getSiAutomation(assets, args.slug as string);
    },
  });

  add({
    name: 'si_list_docs',
    description:
      'List the Security Investigator knowledge-base docs (Sentinel guides, KQL cookbooks, identity protection, honeypot, ingestion cost).',
    params: [{ name: 'keyword', type: 'string', description: 'Substring match', required: false }],
    execute: async (_args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadDocsIndex(assets);
      return idx;
    },
  });

  add({
    name: 'si_get_doc',
    description:
      'Return a Security Investigator knowledge-base doc body (markdown). Use si_list_docs first to discover slugs.',
    params: [{ name: 'slug', type: 'string', description: 'Doc slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getDoc(assets, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  WINREG — Windows Registry Forensic Artifacts (292 artifacts)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'winreg_list_artifacts',
    description:
      'List Windows Registry forensic artifacts (292 total, 16 categories, 10 hive types, 77 MITRE techniques). Filter by category, hive, or keyword.',
    params: [
      { name: 'category', type: 'string', description: 'Filter by category', required: false },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against name / description / path',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max artifacts (default 100, max 500)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadWinRegIndex(assets);
      return filterArtifacts(idx, {
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 100,
      });
    },
  });

  add({
    name: 'winreg_get_artifact',
    description:
      'Return the full Windows Registry forensic artifact body: registry path, hive, category, MITRE techniques, description, and references. Use winreg_list_artifacts first to discover slugs.',
    params: [{ name: 'slug', type: 'string', description: 'Artifact slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getWinRegArtifact(assets, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  TRACEIX — SHA-256 AV/Reputation Lookup
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'traceix_lookup',
    description:
      'Look up a SHA-256 file hash against traceix.com for per-engine antivirus/reputation verdicts (Safe/Malicious/Unknown/Failed).',
    params: [{ name: 'hash', type: 'string', description: 'SHA-256 file hash (64 hex chars)', required: true }],
    execute: async (args) => {
      if (!env.TRACEIX_API_KEY) throw new Error('TRACEIX_API_KEY not configured');
      return traceixLookup({ TRACEIX_API_KEY: env.TRACEIX_API_KEY }, args.hash as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  WHOXY — Reverse WHOIS Lookup
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'whoxy_reverse_whois',
    description:
      'Reverse WHOIS lookup against whoxy.com — find all domains registered by an email, owner name, company, or keyword (705M+ records).',
    params: [
      { name: 'q', type: 'string', description: 'Search term (email, name, company, or keyword)', required: true },
      {
        name: 'type',
        type: 'enum',
        description: 'Search type',
        required: false,
        enum: ['email', 'name', 'company', 'keyword'],
      },
    ],
    execute: async (args) => {
      if (!env.WHOXY_API_KEY) throw new Error('WHOXY_API_KEY not configured');
      return whoxyReverseWhois(
        { WHOXY_API_KEY: env.WHOXY_API_KEY },
        args.q as string,
        (args.type as 'email' | 'name' | 'company' | 'keyword') ?? 'keyword'
      );
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  DEPX — Supply-Chain Intelligence (REST-backed)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'depx_feed',
    description:
      'List recently disclosed malicious packages from the OpenSSF Malicious Packages database. Filter by ecosystem and time window.',
    params: [
      { name: 'since', type: 'string', description: 'Time window: 7d, 14d, 30d (default 7d)', required: false },
      { name: 'ecosystem', type: 'string', description: 'Filter by ecosystem: npm, pypi, gem, etc.', required: false },
      { name: 'limit', type: 'number', description: 'Max packages (default 100, max 500)', required: false },
    ],
    execute: async (args) => {
      const params = new URLSearchParams();
      if (args.since) params.set('since', args.since as string);
      if (args.ecosystem) params.set('ecosystem', args.ecosystem as string);
      if (args.limit) params.set('limit', String(args.limit));
      const qs = params.toString();
      return apiFetch(`/api/v1/depx/feed${qs ? `?${qs}` : ''}`);
    },
  });

  add({
    name: 'depx_check',
    description:
      'Check if a package is known-malicious (OpenSSF Malicious Packages database). Returns clean/malicious/unknown verdict.',
    params: [
      { name: 'ecosystem', type: 'string', description: 'Package ecosystem: npm, pypi, gem, etc.', required: true },
      { name: 'package', type: 'string', description: 'Package name', required: true },
    ],
    execute: async (args) => {
      const params = new URLSearchParams({
        ecosystem: args.ecosystem as string,
        package: args.package as string,
      });
      return apiFetch(`/api/v1/depx/feed/check?${params}`);
    },
  });

  add({
    name: 'depx_stats',
    description:
      'Return ecosystem breakdown and feed statistics for the depx supply-chain intelligence feed (30-day window).',
    params: [],
    execute: async () => apiFetch('/api/v1/depx/feed/stats'),
  });

  // ══════════════════════════════════════════════════════════════════════
  //  BREACHVIP — Breach Database Search (REST-backed)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'breach_vip_search',
    description:
      'Search the BreachVIP breach database (10B+ records, 1000+ datasets) by email, username, domain, IP, phone, password, or name. Returns metadata-only entries (record count + data-class labels; raw credentials never surfaced).',
    params: [
      {
        name: 'term',
        type: 'string',
        description: 'Search term (email, username, domain, IP, phone, name)',
        required: true,
      },
    ],
    execute: async (args) => {
      const params = new URLSearchParams({ term: args.term as string });
      return apiFetch(`/api/v1/breach?${params}`);
    },
  });

  return tools;
}
