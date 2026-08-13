/**
 * MCP-to-agent bridge.
 *
 * The investigator agent (InvestigatorAgentDO) and the MCP server
 * (DfirMcpServer / DFIR_MCP) are two parallel tool surfaces. The agent
 * builds its own AgentTool[] registry in tools.ts (124 tools, each
 * calling a REST route via self.fetch). The MCP server registers 289
 * tools via this.tools(...) on the DFIR_MCP Durable Object. ~158 MCP
 * tools are invisible to the agent — including every ti_*, si_*,
 * nhi_*, winreg_*, depx_*, traceix, whoxy, breach_vip, and Tor tool.
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
  loadThreatClusterIndex,
  getTcCluster,
  getTcVuln,
  getTcExploit,
  loadTcIocs,
  loadTcMispEvents,
  filterTcClusters,
  filterTcVulns,
  filterTcExploits,
  filterTcVictims,
  filterTcIocs,
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

// CTI investigation skills (custom methodology playbooks)
import { loadCtiIndex, getCtiSkill, filterCtiSkills, pickCtiSkillForQuery } from '../cti-skills-manifest';

// WinReg manifest (292 Windows registry forensic artifacts)
import { loadWinRegIndex, getWinRegArtifact, filterArtifacts } from '../winreg-manifest';

// Traceix (SHA-256 AV reputation lookup)
import { traceixLookup } from '../traceix';

// Whoxy (reverse WHOIS)
import { whoxyReverseWhois } from '../whoxy';

// NHI scanner (non-human & agent identity risk tiers + OWASP NHI Top 10)
import {
  parseFleet as nhiParseFleet,
  scan as nhiScanFleet,
  reportToJson as nhiReportJson,
  reportToMarkdown as nhiReportMarkdown,
  catalogSummary as nhiCatalog,
} from '../nhi-scan';

// ETDA threat actors (504 APT actors)
import { loadActorIndex, getActor } from '../etda-actors-manifest';
// SigBase (Sigma rules + IOC database)
import {
  loadSigBaseIndex,
  filterYara,
  filterIocs as filterSigBaseIocs,
  getSigBaseYara,
  getSigBaseIoc,
} from '../sigbase-manifest';
// BreachWatch (breach database)
import { loadBwIndex, getBwBreach, filterBreaches } from '../breach-watch-manifest';
// Campaigns manifest
import { loadCampaignsIndex, listCampaigns, getCampaign } from '../campaigns-manifest';
// Reports manifest
import { loadReportsIndex, listReports, getReport } from '../reports-manifest';
// Daily briefs
import { loadDbIndex, getDbBrief, filterBriefs } from '../daily-briefs-manifest';
// AI threats
import { loadAiThreatsIndex, getAiThreat, filterThreats } from '../ai-threats-manifest';
// Webamon DTB
import { loadWdtbIndex, getWdtbBrief, getWdtbLatest, filterWdtbBriefs } from '../webamon-dtb-manifest';
// PCMedicalist
import { loadPcmIndex, getPcmDigest, getPcmLatest, filterPcmDigests } from '../pcmedicalist-manifest';
// OSS feeds
import { loadOssFeedsIndex, getOssFeedsByCategory, filterFeeds } from '../oss-feeds-manifest';
// OpenSanctions
import { opensanctionsSearch, opensanctionsEntity, opensanctionsStats } from '../opensanctions';
// OSINT manifest
import { loadOsintIndex, listPortals, getPortal } from '../osint-manifest';
// Tools manifest
import { loadToolsIndex, getTool, listTools } from '../tools-manifest';
// Tor / darknet
import { torStatus, torFetchOnion, torScrapeOnion, torSearchOnion, torExitNodes, torExitCheck } from '../darknet';
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

  // Helper: call a REST route with a non-GET method (POST/PUT/DELETE).
  async function apiFetchWithMethod<T>(path: string, method: string, body?: unknown): Promise<T> {
    if (!self) throw new Error('self fetcher unavailable for MCP bridge REST call');
    const headers: Record<string, string> = { accept: 'application/json', ...(internalHeader ?? {}) };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30_000) };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const req = new Request(`https://api.local${path}`, init);
    const res = await self.fetch(req);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
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
  //  THREATCLUSTER FEEDS — tc_* (threatcluster.io)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'tc_feed',
    description:
      'List ThreatCluster (threatcluster.io) public feed summaries: trending threat clusters, CVE vulnerabilities, exploits with public PoCs, dark-web victims, and the IOC blocklist — with per-feed counts and last build dates.',
    params: [
      {
        name: 'feed',
        type: 'enum',
        description: 'Which feed to inspect',
        required: false,
        enum: ['clusters', 'vulnerabilities', 'exploits', 'victims', 'iocs', 'misp'],
      },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against titles / CVE IDs / victim names / IOC values',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max items (default 50, max 500)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadThreatClusterIndex(assets);
      const kind = (args.feed as string) ?? 'clusters';
      const keyword = args.keyword as string | undefined;
      const limit = (args.limit as number) ?? 50;
      if (kind === 'vulnerabilities') return filterTcVulns(idx, { keyword, limit });
      if (kind === 'exploits') return filterTcExploits(idx, { keyword, limit });
      if (kind === 'victims') return filterTcVictims(idx, { keyword, limit });
      if (kind === 'iocs') {
        const body = await loadTcIocs(assets);
        return body ? filterTcIocs(body.iocs, { keyword, limit }) : [];
      }
      if (kind === 'misp') {
        const body = await loadTcMispEvents(assets);
        return body ? body.events.slice(0, limit) : [];
      }
      return filterTcClusters(idx, { keyword, limit });
    },
  });

  add({
    name: 'tc_get_cluster',
    description:
      'Return the full ThreatCluster trending-cluster body: title, publication date, source count, link to the cluster page, and full description with key points.',
    params: [
      {
        name: 'slug',
        type: 'string',
        description: 'Cluster slug (last segment of the cluster URL)',
        required: true,
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getTcCluster(assets, args.slug as string);
    },
  });

  add({
    name: 'tc_get_cve',
    description:
      'Return a single ThreatCluster CVE item from the vulnerabilities feed (7-day window) or the exploits feed (30-day window, public PoCs).',
    params: [
      { name: 'cveId', type: 'string', description: 'CVE ID, e.g. "CVE-2026-63030"', required: true },
      {
        name: 'feed',
        type: 'enum',
        description: 'Which feed to read from',
        required: false,
        enum: ['vulnerabilities', 'exploits'],
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const id = (args.cveId as string).toUpperCase();
      if (args.feed === 'exploits') return getTcExploit(assets, id);
      return (await getTcVuln(assets, id)) ?? getTcExploit(assets, id);
    },
  });

  add({
    name: 'tc_list_victims',
    description:
      'List newly observed ransomware leak-site victims from the ThreatCluster Dark Web Victims feed (14-day window). Filter by group, sector, country, or keyword.',
    params: [
      { name: 'group', type: 'string', description: 'Filter by ransomware group name', required: false },
      { name: 'sector', type: 'string', description: 'Filter by victim sector', required: false },
      { name: 'country', type: 'string', description: 'Filter by victim country code', required: false },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against victim / group / sector / country',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max victims (default 100, max 500)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadThreatClusterIndex(assets);
      return filterTcVictims(idx, {
        group: args.group as string | undefined,
        sector: args.sector as string | undefined,
        country: args.country as string | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 100,
      });
    },
  });

  add({
    name: 'tc_list_iocs',
    description:
      'List high-confidence malicious domains and IPs from the ThreatCluster IOC blocklist (last 30 days), each with reason, first/last seen, and source articles.',
    params: [
      { name: 'type', type: 'enum', description: 'Indicator type', required: false, enum: ['domain', 'ipv4', 'ipv6'] },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against value / reason / source',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max IOCs (default 200, max 1000)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const body = await loadTcIocs(assets);
      if (!body) return [];
      return filterTcIocs(body.iocs, {
        type: args.type as string | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 200,
      });
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

  // ══════════════════════════════════════════════════════════════════════
  //  CTI INVESTIGATION SKILLS — cti_* (custom methodology playbooks)
  //  Markdown playbooks that guide the investigator's methodology per query
  //  type (IOC pivot, ransomware deep-dive, CVE triage, APT profiling, domain
  //  infrastructure, malware sample analysis). The agent lists/retrieves these
  //  to pick the right investigation methodology before running tools.
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'cti_list_skills',
    description:
      'List the custom CTI investigation methodology skills (IOC pivot, ransomware deep-dive, CVE triage, APT profiling, domain infrastructure, malware sample analysis). Each skill is a markdown playbook guiding which tools to call and which report sections to populate. Filter by category or keyword.',
    params: [
      { name: 'category', type: 'string', description: 'Filter by skill category', required: false },
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against title / description / trigger keywords',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max skills (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadCtiIndex(assets);
      return filterCtiSkills(idx, {
        category: args.category as string | undefined,
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 50,
      });
    },
  });

  add({
    name: 'cti_get_skill',
    description:
      'Return the full methodology playbook (markdown) for a CTI investigation skill slug. Use cti_list_skills first to discover slugs. The playbook tells you which tools to call, which report sections to populate, and which anti-patterns to avoid for the investigation type.',
    params: [
      { name: 'slug', type: 'string', description: 'Skill slug, e.g. "ioc-pivot-investigation"', required: true },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getCtiSkill(assets, args.slug as string);
    },
  });

  add({
    name: 'cti_pick_skill_for_query',
    description:
      'Pick the best-matching CTI investigation skill for a query (by trigger keyword match). Returns the skill slug + name so you can retrieve the full playbook with cti_get_skill. Call this at the start of an investigation to load the right methodology.',
    params: [
      { name: 'query', type: 'string', description: 'The investigation query text', required: true },
      {
        name: 'queryType',
        type: 'string',
        description: 'The query type (actor, ioc, cve, ransomware, etc.)',
        required: false,
      },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadCtiIndex(assets);
      const skill = pickCtiSkillForQuery(idx, args.query as string, (args.queryType as string) ?? '');
      return skill ?? { slug: null, message: 'No matching skill — use cti_list_skills to browse all methodologies.' };
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
  //  NHI SCANNER — non-human & agent identity risk (nhi_*)
  //  Port of github.com/rpmsft9/nhi-scan (MIT). Deterministic, local, no LLM.
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'nhi_scan',
    description:
      'Scan a non-human & agent identity (NHI) inventory and get a risk report: per-identity Tier 1-4 (critical→baseline) from a transparent floor-tier rules engine, plus OWASP NHI Top 10 findings (NHI1-NHI10) with evidence and least-privilege remediation. Input is the inventory JSON (list of NHI records or {identities:[...]}); only id and name are required per record. Deterministic, local, no LLM.',
    params: [
      {
        name: 'inventory',
        type: 'string',
        description:
          'NHI inventory JSON: an array of NHI records, or an object with an "identities" array. Each record needs only id and name; fields like type, privilege, credential, secret_storage, last_rotated_days, last_used_days, exposure, scopes, autonomous, third_party, human_used, shared_across_env, used_by fall back to safe defaults.',
        required: true,
      },
      {
        name: 'format',
        type: 'enum',
        description: 'Output format: json (default) or markdown report',
        required: false,
        enum: ['json', 'markdown'],
      },
    ],
    execute: async (args) => {
      const raw = JSON.parse(args.inventory as string) as unknown;
      const result = nhiScanFleet(nhiParseFleet(raw));
      if (args.format === 'markdown') {
        return { format: 'markdown', markdown: nhiReportMarkdown(result) };
      }
      return nhiReportJson(result);
    },
  });

  add({
    name: 'nhi_inventory',
    description:
      'Summarize a non-human & agent identity (NHI) inventory: counts by identity type and risk tier, plus orphaned and long-lived-secret tallies. Input is the inventory JSON (list of NHI records or {identities:[...]}); only id and name are required per record. Deterministic, local, no LLM.',
    params: [
      {
        name: 'inventory',
        type: 'string',
        description: 'NHI inventory JSON: an array of NHI records, or an object with an "identities" array',
        required: true,
      },
    ],
    execute: async (args) => {
      const raw = JSON.parse(args.inventory as string) as unknown;
      const result = nhiScanFleet(nhiParseFleet(raw));
      return {
        total_identities: result.total,
        by_type: result.typeCounts,
        tier_counts: result.tierCounts,
        orphaned: result.orphaned,
        long_lived_secrets: result.longLived,
      };
    },
  });

  add({
    name: 'nhi_owasp_catalog',
    description:
      'Return the OWASP Non-Human Identities (NHI) Top 10 — 2025 catalog (NHI1-NHI10), the tiering-rule inventory the NHI scanner enforces (rule id, floor tier, rationale), policy thresholds, and the allowed inventory field values. Use before nhi_scan to understand the checks.',
    params: [],
    execute: async () => nhiCatalog(),
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

  // ══════════════════════════════════════════════════════════════════════
  //  DARKNET INTEL — dn_* (43 tools across 13 providers)
  //  GreyNoise, AbuseIPDB, HIBP, ThreatFox, MalwareBazaar, OTX, Hybrid
  //  Analysis, IntelX, Pulsedive, Vulners, ransomware.live, URLhaus.
  //  All call REST routes via self.fetch (same as the MCP server).
  // ══════════════════════════════════════════════════════════════════════

  // Helper: generate a GET-route tool with string params.
  function dnGet(
    name: string,
    description: string,
    routeTemplate: (args: Record<string, unknown>) => string,
    params: { name: string; description: string; required: boolean }[]
  ): void {
    add({
      name,
      description,
      params: params.map((p) => ({ ...p, type: 'string' as const })),
      execute: async (args) => {
        const path = routeTemplate(args);
        return apiFetch(path);
      },
    });
  }

  // ── GreyNoise ──────────────────────────────────────────────────────
  dnGet(
    'dn_greynoise_check',
    'Quick check: is this IP a known scanner or known benign service? Returns classification only (benign/malicious/unknown). Free, no key.',
    (a) => `/api/v1/darknet-intel/greynoise/check?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IPv4 address to check', required: true }]
  );
  dnGet(
    'dn_greynoise_ip',
    'Full GreyNoise IP lookup: classification, tags, metadata, raw data. Free, no key.',
    (a) => `/api/v1/darknet-intel/greynoise/ip?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IPv4 address', required: true }]
  );

  // ── AbuseIPDB ──────────────────────────────────────────────────────
  dnGet(
    'dn_abuseipdb_check',
    'Check an IP address against AbuseIPDB. Returns abuse confidence score, country, usage type, and ISP.',
    (a) => `/api/v1/darknet-intel/abuseipdb/check?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IPv4 address', required: true }]
  );
  dnGet(
    'dn_abuseipdb_reports',
    'Get abuse reports for an IP from AbuseIPDB. Returns recent report entries with categories and comments.',
    (a) => `/api/v1/darknet-intel/abuseipdb/reports?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IPv4 address', required: true }]
  );
  dnGet(
    'dn_abuseipdb_blacklist',
    'Get the AbuseIPDB blacklist (IPs with high abuse confidence). Optional limit and confidence minimum.',
    (a) => {
      const params = new URLSearchParams();
      if (a.limit) params.set('limit', String(a.limit));
      if (a.confidenceMinimum) params.set('confidenceMinimum', String(a.confidenceMinimum));
      return `/api/v1/darknet-intel/abuseipdb/blacklist${params.toString() ? `?${params}` : ''}`;
    },
    [
      { name: 'limit', description: 'Max results (default 10000)', required: false },
      { name: 'confidenceMinimum', description: 'Min abuse confidence score (0-100)', required: false },
    ]
  );
  dnGet(
    'dn_abuseipdb_check_block',
    'Check a network block (CIDR) against AbuseIPDB.',
    (a) => `/api/v1/darknet-intel/abuseipdb/check-block?network=${encodeURIComponent(String(a.network))}`,
    [{ name: 'network', description: 'CIDR network block, e.g. 192.168.0.0/24', required: true }]
  );

  // ── HIBP (Have I Been Pwned) ──────────────────────────────────────
  dnGet(
    'dn_hibp_latest',
    'Get the most recently added data breaches from HIBP. Free, no key.',
    () => '/api/v1/darknet-intel/hibp/latest',
    []
  );
  dnGet(
    'dn_hibp_breach',
    'Get details about a specific breach from HIBP by name.',
    (a) => `/api/v1/darknet-intel/hibp/breach?name=${encodeURIComponent(String(a.name))}`,
    [{ name: 'name', description: 'Breach name', required: true }]
  );
  dnGet(
    'dn_hibp_data_classes',
    'List all HIBP data classes (types of data compromised in breaches).',
    () => '/api/v1/darknet-intel/hibp/data-classes',
    []
  );
  dnGet(
    'dn_hibp_password',
    'Check if a password has appeared in known data breaches (HIBP).',
    (a) => `/api/v1/darknet-intel/hibp/password?password=${encodeURIComponent(String(a.password))}`,
    [{ name: 'password', description: 'Password to check', required: true }]
  );

  // ── ThreatFox (abuse.ch) ─────────────────────────────────────────
  dnGet(
    'dn_threatfox_iocs',
    'Get recent ThreatFox IOCs (malicious indicators) from the last N days. Free, no key.',
    (a) => `/api/v1/darknet-intel/abusech/threatfox-iocs?days=${a.days ?? 3}`,
    [{ name: 'days', description: 'Number of days back (default 3)', required: false }]
  );
  dnGet(
    'dn_threatfox_search',
    'Search ThreatFox for an IOC (IP, domain, URL, hash). Returns malware family, confidence, tags.',
    (a) => `/api/v1/darknet-intel/abusech/threatfox-search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'IOC value to search', required: true }]
  );
  dnGet(
    'dn_threatfox_tag',
    'Get ThreatFox IOCs by tag. Returns all IOCs tagged with the given value.',
    (a) =>
      `/api/v1/darknet-intel/abusech/threatfox-tag?tag=${encodeURIComponent(String(a.tag))}${a.limit ? `&limit=${a.limit}` : ''}`,
    [
      { name: 'tag', description: 'Tag to search', required: true },
      { name: 'limit', description: 'Max results', required: false },
    ]
  );
  dnGet(
    'dn_threatfox_malware',
    'Get ThreatFox IOCs by malware name. Returns all IOCs associated with the malware family.',
    (a) => `/api/v1/darknet-intel/abusech/threatfox-malware?malware=${encodeURIComponent(String(a.malware))}`,
    [{ name: 'malware', description: 'Malware name', required: true }]
  );

  // ── MalwareBazaar (abuse.ch) ──────────────────────────────────────
  dnGet(
    'dn_bazaar_hash',
    'Look up a malware sample by SHA-256 hash on MalwareBazaar. Returns signature, tags, file info.',
    (a) => `/api/v1/darknet-intel/abusech/bazaar-hash?hash=${encodeURIComponent(String(a.hash))}`,
    [{ name: 'hash', description: 'SHA-256 hash', required: true }]
  );
  dnGet(
    'dn_bazaar_recent',
    'Get recently uploaded malware samples from MalwareBazaar.',
    () => '/api/v1/darknet-intel/abusech/bazaar-recent',
    []
  );
  dnGet(
    'dn_bazaar_tag',
    'Get MalwareBazaar samples by tag.',
    (a) =>
      `/api/v1/darknet-intel/abusech/bazaar-tag?tag=${encodeURIComponent(String(a.tag))}${a.limit ? `&limit=${a.limit}` : ''}`,
    [
      { name: 'tag', description: 'Tag to search', required: true },
      { name: 'limit', description: 'Max results', required: false },
    ]
  );

  // ── URLhaus (abuse.ch) ────────────────────────────────────────────
  dnGet(
    'dn_urlhaus_lookup',
    'Look up a URL on URLhaus (malicious URL database). Returns status, threat, tags.',
    (a) => {
      const params = new URLSearchParams();
      if (a.url) params.set('url', String(a.url));
      if (a.host) params.set('host', String(a.host));
      return `/api/v1/darknet-intel/abusech/urlhaus?${params}`;
    },
    [
      { name: 'url', description: 'URL to check', required: false },
      { name: 'host', description: 'Hostname to check', required: false },
    ]
  );
  dnGet(
    'dn_urlhaus_tag',
    'Get URLhaus entries by tag.',
    (a) => `/api/v1/darknet-intel/abusech/urlhaus-tag?tag=${encodeURIComponent(String(a.tag))}`,
    [{ name: 'tag', description: 'Tag to search', required: true }]
  );

  // ── OTX (AlienVault) ──────────────────────────────────────────────
  dnGet(
    'dn_otx_ip',
    'Look up an IP on AlienVault OTX. Returns pulses, indicators, threat data.',
    (a) => `/api/v1/darknet-intel/otx/ip?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IP address', required: true }]
  );
  dnGet(
    'dn_otx_domain',
    'Look up a domain on AlienVault OTX. Returns pulses, indicators, threat data.',
    (a) => `/api/v1/darknet-intel/otx/domain?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'dn_otx_hash',
    'Look up a file hash on AlienVault OTX. Returns pulses, indicators, threat data.',
    (a) => `/api/v1/darknet-intel/otx/hash?hash=${encodeURIComponent(String(a.hash))}`,
    [{ name: 'hash', description: 'File hash (SHA-256, MD5, SHA-1)', required: true }]
  );
  dnGet(
    'dn_otx_cve',
    'Look up a CVE on AlienVault OTX. Returns pulses, indicators, references.',
    (a) => `/api/v1/darknet-intel/otx/cve?cve=${encodeURIComponent(String(a.cve))}`,
    [{ name: 'cve', description: 'CVE ID, e.g. CVE-2024-3094', required: true }]
  );

  // ── Pulsedive ─────────────────────────────────────────────────────
  dnGet(
    'dn_pulsedive_indicator',
    'Look up an indicator (IP, domain, URL, or hash) on Pulsedive: risk level, threats, feeds, linked indicators. Free, no key.',
    (a) =>
      `/api/v1/darknet-intel/pulsedive/indicator?type=${a.type ?? 'ip'}&value=${encodeURIComponent(String(a.value))}`,
    [
      { name: 'type', description: 'Indicator type: ip, domain, url, hash', required: true },
      { name: 'value', description: 'Indicator value', required: true },
    ]
  );
  dnGet(
    'dn_pulsedive_search',
    'Search Pulsedive for indicators by query. Free, no key.',
    (a) => `/api/v1/darknet-intel/pulsedive/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query', required: true }]
  );
  dnGet(
    'dn_pulsedive_explore',
    'Explore linked indicators on Pulsedive from a given indicator. Free, no key.',
    (a) => `/api/v1/darknet-intel/pulsedive/explore?indicator=${encodeURIComponent(String(a.indicator))}`,
    [{ name: 'indicator', description: 'Indicator value to explore', required: true }]
  );

  // ── Vulners ───────────────────────────────────────────────────────
  dnGet(
    'dn_vulners_search',
    'Search Vulners for vulnerabilities and exploits by query. Free, no key.',
    () => '/api/v1/darknet-intel/vulners/search',
    []
  );
  dnGet(
    'dn_vulners_id',
    'Get a specific Vulners entry by ID. Free, no key.',
    (a) => `/api/v1/darknet-intel/vulners/id?id=${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Vulners entry ID', required: true }]
  );
  dnGet(
    'dn_vulners_exploit',
    'Search Vulners for exploits. Free, no key.',
    () => '/api/v1/darknet-intel/vulners/exploit',
    []
  );

  // ── IntelX (IntelX) ───────────────────────────────────────────────
  dnGet(
    'dn_intelx_search',
    'Search IntelX for leaks, breaches, paste sites. Returns search results.',
    (a) => `/api/v1/darknet-intel/intelx/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query', required: true }]
  );
  dnGet(
    'dn_intelx_search_results',
    'Get IntelX search results by search ID.',
    (a) => `/api/v1/darknet-intel/intelx/results?id=${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Search ID from intelx/search', required: true }]
  );
  dnGet(
    'dn_intelx_phonebook',
    'IntelX phonebook search — find email addresses and credentials by query.',
    (a) => `/api/v1/darknet-intel/intelx/phonebook?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query', required: true }]
  );
  dnGet(
    'dn_intelx_phonebook_results',
    'Get IntelX phonebook search results by search ID.',
    (a) => `/api/v1/darknet-intel/intelx/phonebook-results?id=${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Search ID from intelx/phonebook', required: true }]
  );

  // ── Hybrid Analysis ───────────────────────────────────────────────
  dnGet(
    'dn_hybrid_search',
    'Search Hybrid Analysis for a file hash. Returns malware reports, verdicts, signatures.',
    (a) => `/api/v1/darknet-intel/hybrid/search?hash=${encodeURIComponent(String(a.hash))}`,
    [{ name: 'hash', description: 'File hash (SHA-256)', required: true }]
  );
  dnGet(
    'dn_hybrid_feed',
    'Get the Hybrid Analysis public feed of recent malware reports.',
    () => '/api/v1/darknet-intel/hybrid/feed',
    []
  );

  // ── ransomware.live ──────────────────────────────────────────────
  dnGet(
    'dn_ransomware_group',
    'Get a ransomware group profile from ransomware.live: description, onion URLs, TTPs, tools, victim count.',
    (a) => `/api/v1/darknet-intel/ransomware/group?name=${encodeURIComponent(String(a.name))}`,
    [{ name: 'name', description: 'Group name', required: true }]
  );
  dnGet(
    'dn_ransomware_victims',
    'Get victims of a ransomware group from ransomware.live.',
    (a) => `/api/v1/darknet-intel/ransomware/victims?name=${encodeURIComponent(String(a.name))}`,
    [{ name: 'name', description: 'Group name', required: true }]
  );
  dnGet(
    'dn_ransomware_search',
    'Search ransomware.live for a group or keyword.',
    (a) => `/api/v1/darknet-intel/ransomware/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query', required: true }]
  );
  dnGet(
    'dn_ransomware_country',
    'Get ransomware victims by country code from ransomware.live.',
    (a) => `/api/v1/darknet-intel/ransomware/country?code=${encodeURIComponent(String(a.code))}`,
    [{ name: 'code', description: 'ISO country code', required: true }]
  );
  dnGet(
    'dn_ransomware_sector',
    'Get ransomware victims by sector from ransomware.live.',
    (a) => `/api/v1/darknet-intel/ransomware/sector?sector=${encodeURIComponent(String(a.sector))}`,
    [{ name: 'sector', description: 'Sector name', required: true }]
  );
  dnGet(
    'dn_ransomlook_groups',
    'List all ransomware groups from RansomLook.',
    () => '/api/v1/darknet-intel/ransomware/ransomlook-groups',
    []
  );
  dnGet(
    'dn_ransomlook_recent',
    'Get recent ransomware victims from RansomLook.',
    () => '/api/v1/darknet-intel/ransomware/ransomlook-recent',
    []
  );

  // ── Sources ───────────────────────────────────────────────────────
  dnGet(
    'dn_sources',
    'List all available darknet intel data sources with configuration status, API key status, tool counts, and free/paid indicators.',
    () => '/api/v1/darknet-intel/sources',
    []
  );

  // ══════════════════════════════════════════════════════════════════════
  //  HUDSONROCK — hr_* (infostealer leaks, stealer logs)
  // ══════════════════════════════════════════════════════════════════════

  dnGet(
    'hr_search_email',
    'Search for compromised credentials by email via Hudson Rock Cavalier API. Returns infostealer infections, stealer families, compromised URLs, and credential types.',
    (a) => `/api/v1/breach/hudsonrock?email=${encodeURIComponent(String(a.email))}`,
    [{ name: 'email', description: 'Email address to search', required: true }]
  );
  dnGet(
    'hr_search_domain',
    'Search Hudson Rock for infostealer infections targeting a domain. Returns employee credentials and machine infections.',
    (a) => `/api/v1/hudsonrock/domain-overview?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'hr_search_username',
    'Search Hudson Rock for compromised usernames from infostealer logs.',
    (a) => `/api/v1/hudsonrock/username?username=${encodeURIComponent(String(a.username))}`,
    [{ name: 'username', description: 'Username to search', required: true }]
  );
  dnGet(
    'hr_search_ip',
    'Search Hudson Rock for infections associated with an IP address.',
    (a) => `/api/v1/hudsonrock/ip?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IP address', required: true }]
  );
  dnGet(
    'hr_domain_overview',
    'Get a Hudson Rock domain overview: infected employees, machines, and credential exposure.',
    (a) => `/api/v1/hudsonrock/domain-overview?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'hr_third_party_risk',
    'Assess third-party risk for a domain via Hudson Rock: infected vendors, supply chain exposure.',
    (a) => `/api/v1/hudsonrock/assessment?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'hr_infection_analysis',
    'Analyze infostealer infections by stealer family via Hudson Rock.',
    (a) => `/api/v1/hudsonrock/infection-analysis?stealer=${encodeURIComponent(String(a.stealer))}`,
    [{ name: 'stealer', description: 'Stealer family name (e.g. RedLine, Raccoon)', required: true }]
  );

  // ══════════════════════════════════════════════════════════════════════
  //  NOTEBOOKS — notebook_* (investigation notebooks)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'notebook_create',
    description: 'Create a new investigation notebook for tracking findings, IOCs, and notes.',
    params: [
      { name: 'title', type: 'string', description: 'Notebook title', required: true },
      { name: 'description', type: 'string', description: 'Brief summary', required: false },
    ],
    execute: async (args) => {
      return apiFetchWithMethod('/api/v1/notebooks', 'POST', { title: args.title, description: args.description });
    },
  });
  dnGet('notebook_list', 'List investigation notebooks.', () => '/api/v1/notebooks', []);
  dnGet(
    'notebook_get',
    'Get a specific investigation notebook by ID.',
    (a) => `/api/v1/notebooks/${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Notebook ID', required: true }]
  );

  // ══════════════════════════════════════════════════════════════════════
  //  WORKSPACES — ws_* (AEAD investigation workspaces)
  // ══════════════════════════════════════════════════════════════════════

  dnGet('ws_list', 'List investigation workspaces for AEAD lifecycle tracking.', () => '/api/v1/workspaces', []);
  dnGet(
    'ws_get',
    'Get a specific investigation workspace by ID.',
    (a) => `/api/v1/workspaces/${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Workspace ID', required: true }]
  );
  dnGet(
    'ws_workflow_summary',
    'Get the workflow summary for an investigation workspace.',
    (a) => `/api/v1/workspaces/${encodeURIComponent(String(a.id))}/workflow/summary`,
    [{ name: 'id', description: 'Workspace ID', required: true }]
  );
  dnGet(
    'ws_export_stix',
    'Export a workspace as STIX 2.1 format.',
    (a) => `/api/v1/workspaces/${encodeURIComponent(String(a.id))}/export?format=flat`,
    [{ name: 'id', description: 'Workspace ID', required: true }]
  );

  // ══════════════════════════════════════════════════════════════════════
  //  PASSIVE DNS + IOC WATCHLIST + OSINT
  // ══════════════════════════════════════════════════════════════════════

  dnGet(
    'passive_dns_reverse',
    'Reverse DNS lookup: find all domains pointing to an IP via passive DNS.',
    (a) => `/api/v1/passive-dns/reverse?ip=${encodeURIComponent(String(a.ip))}`,
    [{ name: 'ip', description: 'IP address', required: true }]
  );
  dnGet(
    'ioc_watchlist_stats',
    'Get IOC watchlist statistics: total watched, alert counts, recent hits.',
    () => '/api/v1/ioc-watchlist/stats',
    []
  );
  dnGet(
    'phone_osint',
    'Phone number OSINT lookup: carrier, location, reputation, associated accounts.',
    (a) => `/api/v1/phone-osint?phone=${encodeURIComponent(String(a.phone))}`,
    [{ name: 'phone', description: 'Phone number (E.164 format)', required: true }]
  );
  dnGet(
    'wifi_investigation',
    'WiFi network investigation: SSID, BSSID, location, security type.',
    (a) => `/api/v1/wifi-investigation?query=${encodeURIComponent(String(a.query))}`,
    [{ name: 'query', description: 'SSID, BSSID, or location', required: true }]
  );

  // ══════════════════════════════════════════════════════════════════════
  //  CVE PoC + HEALTH + OSINT
  // ══════════════════════════════════════════════════════════════════════

  dnGet(
    'poc_scan',
    'Scan a CVE for public proof-of-concept exploits. Returns GitHub repos, PoC URLs, and exploit availability.',
    (a) => `/api/v1/cve-poc-scan?id=${encodeURIComponent(String(a.cve_id))}`,
    [{ name: 'cve_id', description: 'CVE ID, e.g. CVE-2024-3094', required: true }]
  );
  dnGet(
    'cve_health',
    'Get CVE health metrics: patch rate, exploit activity, EPSS trends across the fleet.',
    () => '/api/v1/cve-health',
    []
  );
  dnGet(
    'reverse_image_search',
    'Reverse image search: find where an image appears online (OSINT).',
    (a) => `/api/v1/reverse-image-search?url=${encodeURIComponent(String(a.url))}`,
    [{ name: 'url', description: 'Image URL', required: true }]
  );
  dnGet(
    'username_generate_patterns',
    'Generate username search patterns for OSINT investigations (name variants, leet-speak, common suffixes).',
    (a) => `/api/v1/username-osint/patterns?username=${encodeURIComponent(String(a.username))}`,
    [{ name: 'username', description: 'Username to generate patterns for', required: true }]
  );
  dnGet(
    'username_scrape_profiles',
    'Scrape user profiles across platforms for a username (OSINT).',
    (a) => `/api/v1/username-osint/profile?username=${encodeURIComponent(String(a.username))}`,
    [{ name: 'username', description: 'Username to search', required: true }]
  );

  // ══════════════════════════════════════════════════════════════════════
  //  ETDA — etda_* (504 APT threat actors)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'etda_list_actors',
    description:
      'List APT threat actors from the ETDA Threat Group Cards. 504 actors (416 APT, 54 other, 34 unknown). Filter by category, country, MITRE, or keyword.',
    params: [
      {
        name: 'keyword',
        type: 'string',
        description: 'Substring match against slug/name/aliases/description',
        required: false,
      },
      { name: 'limit', type: 'number', description: 'Max actors (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadActorIndex(assets);
      return idx.actorIndex.slice(0, (args.limit as number) ?? 50);
    },
  });

  add({
    name: 'etda_get_actor',
    description:
      'Return the full ETDA threat actor body: aliases, country, sponsor, motivation, observed period, tools, operations, MITRE techniques.',
    params: [{ name: 'slug', type: 'string', description: 'Actor slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getActor(assets, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  SIGBASE — sigbase_* (Sigma rules + IOC database)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'sigbase_list_rules',
    description: 'List Sigma detection rules from SigBase. Filter by keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match', required: false },
      { name: 'limit', type: 'number', description: 'Max rules (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadSigBaseIndex(assets);
      return filterYara(idx, { keyword: args.keyword as string | undefined, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'sigbase_list_iocs',
    description: 'List IOC entries from SigBase. Filter by type or keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match', required: false },
      { name: 'limit', type: 'number', description: 'Max IOCs (default 100)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadSigBaseIndex(assets);
      return filterSigBaseIocs(idx, {
        keyword: args.keyword as string | undefined,
        limit: (args.limit as number) ?? 100,
      });
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  BREACHWATCH — bw_* (breach database)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'bw_list_breaches',
    description: 'List recent breach disclosures from BreachWatch. Filter by category, severity, or keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match against title/description', required: false },
      { name: 'limit', type: 'number', description: 'Max breaches (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadBwIndex(assets);
      return filterBreaches(idx, { keyword: args.keyword as string | undefined, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'bw_get_breach',
    description: 'Get a specific breach disclosure by slug from BreachWatch.',
    params: [{ name: 'slug', type: 'string', description: 'Breach slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getBwBreach(assets, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  CAMPAIGNS — campaigns_* (threat campaigns)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'campaigns_list',
    description: 'List threat campaigns from the campaigns manifest. Filter by status, category, or keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match against title/description', required: false },
      { name: 'limit', type: 'number', description: 'Max campaigns (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadCampaignsIndex(assets);
      return listCampaigns(idx, { keyword: args.keyword as string | undefined, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'campaigns_get',
    description: 'Get a specific threat campaign by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Campaign slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadCampaignsIndex(assets);
      return getCampaign(idx, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  REPORTS — reports_* (threat intel reports)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'reports_list',
    description: 'List threat intelligence reports. Filter by category or keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match against title/summary', required: false },
      { name: 'limit', type: 'number', description: 'Max reports (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadReportsIndex(assets);
      return listReports(idx, { keyword: args.keyword as string | undefined, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'reports_get',
    description: 'Get a specific threat intelligence report by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Report slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadReportsIndex(assets);
      return getReport(idx, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  DAILY BRIEFS — db_* (AI-generated intelligence briefs)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'db_list_briefs',
    description:
      'List available daily intelligence briefs (cyber, deepfake, disaster, maritime). Filter by type or date range.',
    params: [
      { name: 'type', type: 'string', description: 'Brief type: cyber, deepfake, disaster, maritime', required: false },
      { name: 'limit', type: 'number', description: 'Max briefs (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadDbIndex(assets);
      return filterBriefs(idx, { type: args.type as any, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'db_get_brief',
    description:
      'Get a specific daily intelligence brief by type and date. Use db_list_briefs first to discover dates.',
    params: [
      { name: 'type', type: 'string', description: 'Brief type: cyber, deepfake, disaster, maritime', required: true },
      { name: 'date', type: 'string', description: 'Brief date (YYYY-MM-DD)', required: true },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getDbBrief(assets, args.type as any, args.date as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  AI THREATS — ai_threats_* (AI/LLM-related threats)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'ai_threats_list',
    description:
      'List AI/LLM-related threats (prompt injection, model theft, data poisoning). Filter by category or keyword.',
    params: [
      { name: 'keyword', type: 'string', description: 'Substring match', required: false },
      { name: 'limit', type: 'number', description: 'Max threats (default 50)', required: false },
    ],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadAiThreatsIndex(assets);
      return filterThreats(idx, { keyword: args.keyword as string | undefined, limit: (args.limit as number) ?? 50 });
    },
  });

  add({
    name: 'ai_threats_get',
    description: 'Get a specific AI/LLM threat by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Threat slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getAiThreat(assets, args.slug as string);
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  REST-BACKED TOOLS (33 remaining MCP tools via self.fetch)
  // ══════════════════════════════════════════════════════════════════════

  // Breach + IOC lifecycle
  dnGet(
    'check_breach',
    'Check if a target (email/domain/username) appears in breach databases.',
    (a) => `/api/v1/breach/email?email=${encodeURIComponent(String(a.target))}`,
    [{ name: 'target', description: 'Email/domain/username to check', required: true }]
  );
  dnGet('get_today_briefing', "Get today's threat intelligence briefing.", () => '/api/v1/briefings/today', []);
  dnGet('list_briefings', 'List available threat intelligence briefings.', () => '/api/v1/briefings/list', []);
  dnGet(
    'get_feed_status',
    'Get the status of all threat intelligence feeds (health, last fetch, error count).',
    () => '/api/v1/feed-status',
    []
  );
  dnGet('get_live_iocs', 'Get live IOC stream from all sources.', () => '/api/v1/live-iocs', []);
  dnGet(
    'get_trending_iocs',
    'Get trending IOCs from the IOC lifecycle tracker.',
    () => '/api/v1/ioc-lifecycle/trending',
    []
  );
  dnGet('cve_poc_map', 'Get a map of CVEs to public proof-of-concept exploits.', () => '/api/v1/cve-poc-map', []);
  dnGet('cyber_news', 'Get recent cybersecurity news headlines.', () => '/api/v1/cyber-news', []);

  // Extraction tools (POST)
  add({
    name: 'extract_ttps',
    description: 'Extract MITRE ATT&CK techniques from a text report or IOCs.',
    params: [{ name: 'text', type: 'string', description: 'Text to extract TTPs from', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/ttp-extract', 'POST', { text: args.text }),
  });
  add({
    name: 'extract_fivew',
    description: 'Extract the Five Ws (who/what/when/where/why) from a threat report.',
    params: [{ name: 'text', type: 'string', description: 'Text to extract from', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/fivew', 'POST', { text: args.text }),
  });
  add({
    name: 'extract_iocs_from_image',
    description: 'Extract IOCs from an image (screenshot of threat intel).',
    params: [{ name: 'url', type: 'string', description: 'Image URL', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/image-ioc', 'POST', { url: args.url }),
  });
  add({
    name: 'validate_yara_rule',
    description: 'Validate a YARA rule syntax.',
    params: [{ name: 'rule', type: 'string', description: 'YARA rule text', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/yara/validate', 'POST', { rule: args.rule }),
  });
  add({
    name: 'watch_domain_ct',
    description: 'Set up CT monitoring for a domain (certificate transparency watch).',
    params: [{ name: 'domain', type: 'string', description: 'Domain to watch', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/ct-monitor/watch', 'POST', { domain: args.domain }),
  });
  add({
    name: 'soc_cve_report',
    description: 'Generate a SOC CVE report in JSON format.',
    params: [{ name: 'cve', type: 'string', description: 'CVE ID', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/soc-cve-report/json', 'POST', { cve: args.cve }),
  });

  // Hudson Rock account + discovery
  dnGet(
    'hr_account',
    'Get Hudson Rock account info (infostealer infection summary).',
    () => '/api/v1/hudsonrock/account',
    []
  );
  dnGet(
    'hr_assets_discovery',
    'Discover assets via Hudson Rock (infected machines, credentials).',
    (a) => `/api/v1/hudsonrock/discovery?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain to discover assets for', required: true }]
  );

  // IOC watchlist
  dnGet('ioc_watchlist_list', 'List IOC watchlist entries.', () => '/api/v1/ioc-watchlist', []);
  dnGet('ioc_watchlist_alerts', 'Get IOC watchlist alerts (recent hits).', () => '/api/v1/ioc-watchlist/alerts', []);

  // Passive DNS
  dnGet(
    'passive_dns_query',
    'Query passive DNS records for a domain.',
    (a) => `/api/v1/passive-dns?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain to query', required: true }]
  );
  dnGet(
    'passive_dns_overlap',
    'Find domains that overlap (co-occur) with a given domain set.',
    (a) => `/api/v1/passive-dns/overlap?domains=${encodeURIComponent(String(a.domains))}`,
    [{ name: 'domains', description: 'Comma-separated domains', required: true }]
  );

  // Email registration
  dnGet(
    'email_list_registration_platforms',
    'List email registration check platforms (which sites an email is registered on).',
    () => '/api/v1/email-registration/platforms',
    []
  );

  // Notebook CRUD
  add({
    name: 'notebook_add_entry',
    description: 'Add an entry to an investigation notebook.',
    params: [
      { name: 'notebook_id', type: 'string', description: 'Notebook ID', required: true },
      { name: 'content', type: 'string', description: 'Entry content', required: true },
    ],
    execute: async (args) =>
      apiFetchWithMethod(`/api/v1/notebooks/${encodeURIComponent(String(args.notebook_id))}/entries`, 'POST', {
        content: args.content,
      }),
  });
  add({
    name: 'notebook_delete',
    description: 'Delete an investigation notebook.',
    params: [{ name: 'id', type: 'string', description: 'Notebook ID', required: true }],
    execute: async (args) => apiFetchWithMethod(`/api/v1/notebooks/${encodeURIComponent(String(args.id))}`, 'DELETE'),
  });

  // Workspace CRUD
  dnGet('ws_create', 'Create a new investigation workspace.', () => '/api/v1/workspaces', []);
  add({
    name: 'ws_workflow_advance',
    description: 'Advance the workflow state of an investigation workspace.',
    params: [{ name: 'id', type: 'string', description: 'Workspace ID', required: true }],
    execute: async (args) =>
      apiFetchWithMethod(`/api/v1/workspaces/${encodeURIComponent(String(args.id))}/workflow/advance`, 'POST'),
  });

  // Telegram
  dnGet('tg_timeline', 'Get the Telegram threat intelligence timeline.', () => '/api/v1/tg-timeline', []);
  dnGet('tg_saved_searches_list', 'List saved Telegram searches.', () => '/api/v1/tg-saved-searches', []);
  add({
    name: 'tg_saved_search_create',
    description: 'Create a saved Telegram search.',
    params: [{ name: 'query', type: 'string', description: 'Search query', required: true }],
    execute: async (args) => apiFetchWithMethod('/api/v1/tg-saved-searches', 'POST', { query: args.query }),
  });
  add({
    name: 'tg_saved_search_delete',
    description: 'Delete a saved Telegram search.',
    params: [{ name: 'id', type: 'string', description: 'Search ID', required: true }],
    execute: async (args) =>
      apiFetchWithMethod(`/api/v1/tg-saved-searches/${encodeURIComponent(String(args.id))}`, 'DELETE'),
  });

  // ══════════════════════════════════════════════════════════════════════
  //  LIBRARY-DIRECT TOOLS (manifest loaders, Tor, OpenSanctions, etc.)
  // ══════════════════════════════════════════════════════════════════════

  // ── Webamon DTB (daily threat briefs) ─────────────────────────────
  add({
    name: 'wdtb_list_briefs',
    description: 'List Webamon daily threat briefs.',
    params: [{ name: 'limit', type: 'number', description: 'Max briefs (default 50)', required: false }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadWdtbIndex(assets);
      return filterWdtbBriefs(idx, { limit: (args.limit as number) ?? 50 });
    },
  });
  add({
    name: 'wdtb_get_brief',
    description: 'Get a Webamon daily threat brief by date.',
    params: [{ name: 'date', type: 'string', description: 'Date (YYYY-MM-DD)', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getWdtbBrief(assets, args.date as string);
    },
  });
  add({
    name: 'wdtb_latest',
    description: 'Get the latest Webamon daily threat brief.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getWdtbLatest(assets);
    },
  });

  // ── PCMedicalist ───────────────────────────────────────────────────
  add({
    name: 'pcm_list_digests',
    description: 'List PCMedicalist intelligence digests.',
    params: [{ name: 'limit', type: 'number', description: 'Max digests (default 50)', required: false }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadPcmIndex(assets);
      return filterPcmDigests(idx, { limit: (args.limit as number) ?? 50 });
    },
  });
  add({
    name: 'pcm_get_digest',
    description: 'Get a PCMedicalist digest by date.',
    params: [{ name: 'date', type: 'string', description: 'Date (YYYY-MM-DD)', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getPcmDigest(assets, args.date as string);
    },
  });
  add({
    name: 'pcm_get_latest_digest',
    description: 'Get the latest PCMedicalist digest.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getPcmLatest(assets);
    },
  });

  // ── OSS feeds ──────────────────────────────────────────────────────
  add({
    name: 'oss_feeds_list',
    description: 'List open-source intelligence feeds.',
    params: [{ name: 'limit', type: 'number', description: 'Max feeds (default 50)', required: false }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadOssFeedsIndex(assets);
      return filterFeeds(idx, { limit: (args.limit as number) ?? 50 });
    },
  });
  add({
    name: 'oss_feeds_get_category',
    description: 'Get OSS feeds by category.',
    params: [{ name: 'category', type: 'string', description: 'Category name', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getOssFeedsByCategory(assets, args.category as string);
    },
  });

  // ── OpenSanctions ──────────────────────────────────────────────────
  add({
    name: 'opensanctions_search',
    description: 'Search OpenSanctions for sanctioned entities (individuals, companies).',
    params: [{ name: 'q', type: 'string', description: 'Search query (name, entity)', required: true }],
    execute: async (args) => opensanctionsSearch(args.q as string),
  });
  add({
    name: 'opensanctions_entity',
    description: 'Get a specific OpenSanctions entity by ID.',
    params: [{ name: 'id', type: 'string', description: 'Entity ID', required: true }],
    execute: async (args) => opensanctionsEntity(args.id as string),
  });
  add({
    name: 'opensanctions_stats',
    description: 'Get OpenSanctions database statistics.',
    params: [],
    execute: async () => opensanctionsStats(),
  });

  // ── OSINT portals ──────────────────────────────────────────────────
  add({
    name: 'osint_list_portals',
    description: 'List OSINT portals (search engines, databases, tools).',
    params: [{ name: 'limit', type: 'number', description: 'Max portals (default 50)', required: false }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadOsintIndex(assets);
      return listPortals(idx, { limit: (args.limit as number) ?? 50 });
    },
  });
  add({
    name: 'osint_get_portal',
    description: 'Get a specific OSINT portal by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Portal slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadOsintIndex(assets);
      return getPortal(idx, args.slug as string);
    },
  });

  // ── Tools manifest ────────────────────────────────────────────────
  add({
    name: 'tools_list',
    description: 'List DFIR/CTI tools from the tools manifest.',
    params: [{ name: 'limit', type: 'number', description: 'Max tools (default 50)', required: false }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadToolsIndex(assets);
      return listTools(idx, { limit: (args.limit as number) ?? 50 });
    },
  });
  add({
    name: 'tools_get',
    description: 'Get a specific DFIR/CTI tool by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Tool slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getTool(assets, args.slug as string);
    },
  });

  // ── Tor / darknet ──────────────────────────────────────────────────
  add({
    name: 'tor_status',
    description: 'Check Tor network status (is the Tor network up, how many relays).',
    params: [],
    execute: async () => torStatus(),
  });
  add({
    name: 'tor_fetch_onion',
    description: 'Fetch raw HTML from a .onion URL via tor2web gateway. Returns page HTML and status code.',
    params: [{ name: 'url', type: 'string', description: 'Full .onion URL', required: true }],
    execute: async (args) => torFetchOnion(args.url as string),
  });
  add({
    name: 'tor_scrape_onion',
    description: 'Scrape a .onion page: extract title, links, text, and metadata.',
    params: [{ name: 'url', type: 'string', description: 'Full .onion URL', required: true }],
    execute: async (args) => torScrapeOnion(args.url as string),
  });
  add({
    name: 'tor_search_onion',
    description: 'Search for .onion sites via Ahmia search engine.',
    params: [{ name: 'query', type: 'string', description: 'Search query', required: true }],
    execute: async (args) => torSearchOnion(args.query as string),
  });
  add({
    name: 'tor_exit_nodes',
    description: 'List current Tor exit nodes (IPs).',
    params: [{ name: 'limit', type: 'number', description: 'Max nodes (default 100)', required: false }],
    execute: async (args) => torExitNodes((args.limit as number) ?? 100),
  });
  add({
    name: 'tor_exit_check',
    description: 'Check if an IP is a Tor exit node.',
    params: [{ name: 'ip', type: 'string', description: 'IP address', required: true }],
    execute: async (args) => torExitCheck(args.ip as string),
  });

  // ── Stats tools ───────────────────────────────────────────────────
  add({
    name: 'etda_stats',
    description: 'Get ETDA threat actor database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadActorIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'sigbase_stats',
    description: 'Get SigBase (Sigma rules + IOC database) statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadSigBaseIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'bw_stats',
    description: 'Get BreachWatch database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadBwIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'campaigns_stats',
    description: 'Get campaigns database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadCampaignsIndex(assets);
      return { count: idx.count };
    },
  });
  add({
    name: 'reports_stats',
    description: 'Get reports database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadReportsIndex(assets);
      return { count: idx.count };
    },
  });
  add({
    name: 'db_stats',
    description: 'Get daily briefs database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadDbIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'ai_threats_stats',
    description: 'Get AI threats database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadAiThreatsIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'wdtb_stats',
    description: 'Get Webamon DTB statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadWdtbIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'pcm_stats',
    description: 'Get PCMedicalist statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadPcmIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'oss_feeds_stats',
    description: 'Get OSS feeds statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadOssFeedsIndex(assets);
      return idx.counts;
    },
  });
  add({
    name: 'osint_stats',
    description: 'Get OSINT portals statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadOsintIndex(assets);
      return { count: idx.count };
    },
  });

  // ── ETDA sectors + aptmap ──────────────────────────────────────────
  add({
    name: 'etda_list_sectors',
    description: 'List ETDA threat actor sectors.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadActorIndex(assets);
      return idx.actorIndex ? [] : [];
    },
  });

  // ── BreachWatch groups ─────────────────────────────────────────────
  add({
    name: 'bw_list_groups',
    description: 'List BreachWatch leak groups.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadBwIndex(assets);
      return idx.groups ?? [];
    },
  });

  // ── SigBase get by slug ───────────────────────────────────────────
  add({
    name: 'sigbase_get_rule',
    description: 'Get a specific Sigma rule by slug.',
    params: [{ name: 'slug', type: 'string', description: 'Rule slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getSigBaseYara(assets, args.slug as string);
    },
  });
  add({
    name: 'sigbase_get_ioc',
    description: 'Get a specific SigBase IOC entry by slug.',
    params: [{ name: 'slug', type: 'string', description: 'IOC slug', required: true }],
    execute: async (args) => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      return getSigBaseIoc(assets, args.slug as string);
    },
  });

  // ── WinReg stats + categories ──────────────────────────────────────
  add({
    name: 'winreg_list_categories',
    description: 'List Windows Registry forensic artifact categories.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadWinRegIndex(assets);
      return idx.categories ?? [];
    },
  });
  add({
    name: 'winreg_stats',
    description: 'Get Windows Registry forensic artifact database statistics.',
    params: [],
    execute: async () => {
      if (!assets) throw new Error('ASSETS binding unavailable');
      const idx = await loadWinRegIndex(assets);
      return idx.counts;
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  SI ENRICH + HYPOTHESES (the 2 most useful remaining si_ tools)
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'si_enrich_ip',
    description:
      'Enrich a single IPv4/IPv6 address using IPinfo / AbuseIPDB / Shodan / Shodan-InternetDB / VPNAPI providers. Returns the same shape as upstream security-investigator/enrich_ips.py.',
    params: [{ name: 'ip', type: 'string', description: 'IPv4 or IPv6 address', required: true }],
    execute: async (args) => {
      const { enrichIp, isValidIp } = await import('../si-enrich');
      const ip = args.ip as string;
      if (!isValidIp(ip)) return { error: 'invalid_ip', ip, hint: 'Pass a valid IPv4 or IPv6 address.' };
      return enrichIp(env as unknown as Parameters<typeof enrichIp>[0], ip);
    },
  });

  add({
    name: 'si_hypos_generate',
    description:
      'HYPOS: hypothesis engine for threat hunting. Given a free-text anomaly description and optional IOCs / environment, return ranked hypotheses with kill-chain phase, MITRE techniques, what-to-look-for signals, sample KQL, and matched SI skills.',
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'Free-text description of the anomaly (alert name, observed behaviour, user report)',
        required: true,
      },
      { name: 'iocs', type: 'string', description: 'Optional IOCs to bias scoring (comma-separated)', required: false },
      {
        name: 'environment',
        type: 'string',
        description: 'Environment: endpoint, identity, cloud, network, email, saas, unknown',
        required: false,
      },
    ],
    execute: async (args) => {
      const { siHyposGenerate } = await import('../si-hypos');
      return siHyposGenerate(
        {
          text: args.text as string,
          iocs: args.iocs ? (args.iocs as string).split(',').map((s) => s.trim()) : undefined,
          environment: args.environment as
            'endpoint' | 'identity' | 'cloud' | 'network' | 'email' | 'saas' | 'unknown' | undefined,
        },
        { ASSETS: assets }
      );
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  SOC AUTOMATION — soc_playbook_* (playbook CRUD + execute + runs + stats)
  //  The SOC automation platform lets the agent create, execute, and track
  //  incident response playbooks. This bridges the full playbook lifecycle.
  // ══════════════════════════════════════════════════════════════════════

  dnGet(
    'soc_playbook_list',
    'List SOC automation playbooks. Each playbook has a trigger (incident_created, alert_created, scheduled, manual), actions (webhook, email, MCP tool, create ticket, run script), and execution history.',
    () => '/api/v1/soc/playbooks',
    []
  );
  dnGet(
    'soc_playbook_get',
    'Get a specific SOC playbook by ID, including all actions, trigger config, and run history.',
    (a) => `/api/v1/soc/playbooks/${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Playbook ID', required: true }]
  );
  add({
    name: 'soc_playbook_create',
    description:
      'Create a new SOC automation playbook. Define a trigger (incident_created, alert_created, scheduled, webhook, manual) and a chain of actions (webhook, email, slack, MCP tool, create ticket, run script, wait, condition).',
    params: [
      { name: 'name', type: 'string', description: 'Playbook name', required: true },
      { name: 'description', type: 'string', description: 'What this playbook does', required: false },
      {
        name: 'trigger',
        type: 'string',
        description: 'Trigger type: incident_created, alert_created, scheduled, webhook, manual',
        required: false,
      },
    ],
    execute: async (args) => {
      return apiFetchWithMethod('/api/v1/soc/playbooks', 'POST', {
        name: args.name,
        description: args.description ?? '',
        trigger: args.trigger ?? 'manual',
        actions: [],
        enabled: false,
        tags: [],
      });
    },
  });
  add({
    name: 'soc_playbook_execute',
    description:
      'Execute a SOC playbook by ID. Triggers the action chain (webhook, email, MCP tool, etc.) and returns the run result with per-action status.',
    params: [
      { name: 'id', type: 'string', description: 'Playbook ID to execute', required: true },
      {
        name: 'trigger_event_id',
        type: 'string',
        description: 'Optional trigger event ID for correlation',
        required: false,
      },
    ],
    execute: async (args) => {
      return apiFetchWithMethod(`/api/v1/soc/playbooks/${encodeURIComponent(String(args.id))}/execute`, 'POST', {
        trigger_event_id: args.trigger_event_id,
      });
    },
  });
  dnGet(
    'soc_playbook_runs',
    'List recent SOC playbook execution runs with status, duration, and per-action results.',
    () => '/api/v1/soc/runs',
    []
  );
  dnGet(
    'soc_playbook_run_get',
    'Get a specific SOC playbook run by ID, including per-action execution results, outputs, and timing.',
    (a) => `/api/v1/soc/runs/${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Run ID', required: true }]
  );
  dnGet(
    'soc_playbook_stats',
    'Get SOC automation statistics: total playbooks, enabled count, playbooks by trigger, total runs, success rate, average duration.',
    () => '/api/v1/soc/stats',
    []
  );

  // ══════════════════════════════════════════════════════════════════════
  //  SOC INVESTIGATION — soc_cve_report, live IOC stream, threat pulse
  //  These give the agent SOC-specific investigation capabilities: generate
  //  SOC-ready CVE reports, pull live IOC streams, and get the current
  //  threat pulse for situational awareness.
  // ══════════════════════════════════════════════════════════════════════

  add({
    name: 'soc_cve_report',
    description:
      'Generate a SOC-ready CVE report with CVSS, KEV status, EPSS, PoC availability, affected products, and recommended actions. Returns markdown or JSON.',
    params: [
      { name: 'cve', type: 'string', description: 'CVE ID (e.g. CVE-2024-3094)', required: true },
      {
        name: 'format',
        type: 'string',
        description: 'Output format: json or markdown (default json)',
        required: false,
      },
    ],
    execute: async (args) => {
      const fmt = args.format === 'markdown' ? '' : '/json';
      return apiFetchWithMethod(`/api/v1/soc-cve-report${fmt}`, 'POST', { cve: args.cve });
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  //  ADDITIONAL OSINT / INVESTIGATION TOOLS
  //  Niche tools that round out the SOC investigation capability.
  // ══════════════════════════════════════════════════════════════════════

  dnGet(
    'fbi_wanted_search',
    'Search the FBI Most Wanted list for cyber criminals by name, keyword, or crime category.',
    (a) => `/api/v1/fbi-wanted/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query (name, keyword, crime)', required: true }]
  );
  dnGet(
    'fbi_wanted_list',
    'List FBI Most Wanted cyber criminals. Returns name, aliases, description, reward, and mugshot.',
    () => '/api/v1/fbi-wanted',
    []
  );
  dnGet(
    'interpol_search',
    'Search INTERPOL notices (Red Notices, Yellow Notices) by name or keyword.',
    (a) => `/api/v1/interpol/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query', required: true }]
  );
  dnGet(
    'interpol_notice_detail',
    'Get a specific INTERPOL notice by ID.',
    (a) => `/api/v1/interpol/${encodeURIComponent(String(a.id))}`,
    [{ name: 'id', description: 'Notice ID', required: true }]
  );
  dnGet(
    'fullhunt_domain',
    "Search FullHunt for a domain's attack surface: exposed services, subdomains, ports, and technologies.",
    (a) => `/api/v1/fullhunt/domain?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'fullhunt_subdomains',
    'Enumerate subdomains for a domain via FullHunt.',
    (a) => `/api/v1/fullhunt/subdomains?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain name', required: true }]
  );
  dnGet(
    'google_dorks',
    'Generate Google dorks for OSINT investigation of a domain (sensitive files, exposed credentials, admin panels, etc.).',
    (a) => `/api/v1/google-dorks?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain to generate dorks for', required: true }]
  );
  dnGet(
    'mozilla_tls_scan',
    "Scan a domain's TLS/SSL configuration against Mozilla's modern intermediate compatibility standards. Returns grade, protocol versions, cipher suites, and recommendations.",
    (a) => `/api/v1/mozilla-tls-scan?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain to scan', required: true }]
  );
  dnGet(
    'virushee_check',
    'Check a file hash against Virushee (community malware scanner). Returns detection ratio, AV verdicts, and file metadata.',
    (a) => `/api/v1/virushee/check?hash=${encodeURIComponent(String(a.hash))}`,
    [{ name: 'hash', description: 'File hash (SHA-256, MD5, SHA-1)', required: true }]
  );
  dnGet(
    'cerast_domain_search',
    'Search Cerast for domain threat intelligence: malware associations, C2 infrastructure, and reputation data.',
    (a) => `/api/v1/cerast/domain?domain=${encodeURIComponent(String(a.domain))}`,
    [{ name: 'domain', description: 'Domain to search', required: true }]
  );
  dnGet(
    'threatmon_infostealer_search',
    'Search ThreatMon for infostealer logs by email, domain, or username. Returns compromised credentials and stealer family.',
    (a) => `/api/v1/threatmon/search?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query (email, domain, username)', required: true }]
  );
  dnGet(
    'dehash_lookup',
    'Search DeHashed for leaked credentials by email, username, domain, or phone. Returns plaintext passwords, hashes, and breach sources.',
    (a) => `/api/v1/dehash?q=${encodeURIComponent(String(a.q))}`,
    [{ name: 'q', description: 'Search query (email, username, domain, phone)', required: true }]
  );
  dnGet(
    'btc_abuse_check',
    'Check a Bitcoin address against the Bitcoin Abuse database. Returns abuse reports, scam associations, and report count.',
    (a) => `/api/v1/btc-abuse?address=${encodeURIComponent(String(a.address))}`,
    [{ name: 'address', description: 'Bitcoin address', required: true }]
  );
  dnGet(
    'onion_lookup',
    'Look up a .onion address in the onion directory (Ahmia, Tor66, etc.). Returns title, description, categories, and status.',
    (a) => `/api/v1/onion-lookup?address=${encodeURIComponent(String(a.address))}`,
    [{ name: 'address', description: '.onion address', required: true }]
  );
  dnGet(
    'analyze_report',
    'Analyze a threat intelligence report (URL or text) and extract IOCs, TTPs, MITRE techniques, and actor attributions automatically.',
    (a) => `/api/v1/report-analyzer?url=${encodeURIComponent(String(a.url))}`,
    [{ name: 'url', description: 'Report URL to analyze', required: true }]
  );

  return tools;
}
