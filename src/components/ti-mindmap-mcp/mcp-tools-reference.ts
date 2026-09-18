/**
 * MCP Tools Reference (TI-Mindmap-Hub).
 *
 * The 25-tool registry for mcp.ti-mindmap-hub.com, in table form:
 * tool name, description, and per-tool parameters. Drives the
 * <McpToolsReference /> section on /threatintel/mcp-search so the page
 * documents not just *that* there are 25 tools but what each one does
 * and how to call it — matching the upstream docs table.
 *
 * Kept local (not fetched) so the page renders its reference even with
 * no API key configured. Mirrors src/data/dfir/secops-catalog.ts (the
 * `tim-*` entries) and the upstream docs at docs.ti-mindmap-hub.com/mcp.
 */

export interface McpToolParam {
  name: string;
  required: boolean;
  /** Accepted values for enum-ish params (e.g. content_type). */
  values?: string[];
}

export interface McpToolRef {
  /** MCP wire name, e.g. `list_reports`. */
  name: string;
  description: string;
  params: McpToolParam[];
}

export const TI_MINDMAP_MCP_TOOLS: readonly McpToolRef[] = [
  // ── Reports ──────────────────────────────────────────────────────
  {
    name: 'list_reports',
    description:
      'List available threat intelligence reports with optional filters. Returns title, summary, source, date, tags, and direct link to each report.',
    params: [
      { name: 'search', required: false },
      { name: 'tags', required: false },
      { name: 'source', required: false },
      { name: 'time_range', required: false, values: ['24h', '7d', '30d', '90d'] },
      { name: 'limit', required: false },
    ],
  },
  {
    name: 'get_report_details',
    description:
      'Retrieve complete details of a specific report including title, content, source, publication date, tags, and links to all processed content.',
    params: [{ name: 'report_id', required: true }],
  },
  {
    name: 'get_report_content',
    description: 'Retrieve specific content from a report such as AI summary, mindmap, TTPs, IOCs, or STIX bundle.',
    params: [
      { name: 'report_id', required: true },
      {
        name: 'content_type',
        required: false,
        values: ['summary', 'raw', 'mindmap', 'ttps_table', 'ttps_execution', 'five_whats', 'stix', 'iocs'],
      },
    ],
  },
  {
    name: 'get_available_sources',
    description: 'Get the list of all available threat intelligence sources monitored by the platform.',
    params: [],
  },
  {
    name: 'get_available_tags',
    description: 'Get the list of all available tags for filtering reports.',
    params: [],
  },
  {
    name: 'submit_article',
    description:
      'Submit a URL for ingestion — the platform extracts IOCs, TTPs, CVEs, and malware families and generates the mindmap, summary, and STIX bundle.',
    params: [{ name: 'url', required: true }],
  },
  {
    name: 'get_statistics',
    description: 'Platform-wide statistics — total reports, IOCs, CVEs, briefings, and monitored source count.',
    params: [],
  },

  // ── IOC & CVE intelligence ───────────────────────────────────────
  {
    name: 'search_ioc',
    description:
      'Search an IOC (IP, hash, domain, URL) across all reports. Returns matching reports, IOC type, and first/last seen dates.',
    params: [{ name: 'ioc_value', required: true }],
  },
  {
    name: 'search_cve',
    description:
      'Look up a specific CVE — CVSS, severity, EPSS, KEV exploitation status, description, affected products, and references.',
    params: [{ name: 'cve_id', required: true }],
  },
  {
    name: 'search_cves_by_keyword',
    description:
      'Keyword search across the CVE database. Returns matching CVEs with severity, CVSS, and exploitation flags.',
    params: [
      { name: 'query', required: true },
      { name: 'limit', required: false },
    ],
  },
  {
    name: 'list_cves',
    description: 'Paginated list of all CVEs. Filter by severity; sort by CVSS or date.',
    params: [
      { name: 'severity', required: false, values: ['critical', 'high', 'medium', 'low'] },
      { name: 'sort', required: false, values: ['cvss', 'date'] },
      { name: 'limit', required: false },
      { name: 'offset', required: false },
    ],
  },
  {
    name: 'get_cves_by_article',
    description: 'Retrieve all CVEs associated with a specific article/report.',
    params: [{ name: 'article_id', required: true }],
  },
  {
    name: 'get_cve_statistics',
    description:
      'CVE statistics — total count, severity distribution, top vendors, exploitation count, average CVSS, and monthly trend.',
    params: [],
  },

  // ── Briefings ────────────────────────────────────────────────────
  {
    name: 'list_briefings',
    description: 'List daily and weekly threat intelligence briefings with summaries.',
    params: [{ name: 'limit', required: false }],
  },
  {
    name: 'get_latest_briefing',
    description: 'Fetch the most recent daily or weekly briefing.',
    params: [{ name: 'type', required: false, values: ['daily', 'weekly'] }],
  },
  {
    name: 'get_briefing_by_date',
    description: 'Retrieve a specific briefing by date.',
    params: [
      { name: 'date', required: true },
      { name: 'type', required: false, values: ['daily', 'weekly'] },
    ],
  },

  // ── STIX ─────────────────────────────────────────────────────────
  {
    name: 'list_stix_bundles',
    description: 'List available STIX 2.1 bundles with object counts and creation dates.',
    params: [{ name: 'limit', required: false }],
  },
  {
    name: 'get_stix_bundle',
    description: 'Download a full STIX 2.1 bundle by article ID for import into OpenCTI, MISP, or other CTI platforms.',
    params: [{ name: 'article_id', required: true }],
  },
  {
    name: 'get_stix_statistics',
    description: 'STIX statistics — total bundles, total objects, and distribution by STIX object type.',
    params: [],
  },

  // ── Knowledge graph ──────────────────────────────────────────────
  {
    name: 'kg_search',
    description: 'Search the STIX constellation knowledge graph for entities by name or alias. Filter by entity type.',
    params: [
      { name: 'query', required: true },
      { name: 'entity_type', required: false },
      { name: 'limit', required: false },
    ],
  },
  {
    name: 'kg_cluster',
    description:
      'Expand a knowledge-graph entity to its local neighborhood — related entities and relationships at configurable depth.',
    params: [
      { name: 'entity_id', required: true },
      { name: 'depth', required: false },
    ],
  },
  {
    name: 'kg_timeline',
    description: 'Build a chronological timeline of reports mentioning a specific entity.',
    params: [{ name: 'entity_id', required: true }],
  },
  {
    name: 'kg_attack_path',
    description: 'Find attack paths between entities via TTP relationships.',
    params: [
      { name: 'source_id', required: true },
      { name: 'target_id', required: true },
    ],
  },
  {
    name: 'kg_cross_report',
    description: 'Find shared entities between two reports — useful for linking campaigns and actor infrastructure.',
    params: [
      { name: 'report_id_a', required: true },
      { name: 'report_id_b', required: true },
    ],
  },
  {
    name: 'kg_stats',
    description:
      'Knowledge-graph statistics — total entities, relationships, entity-type distribution, and relationship-type distribution.',
    params: [],
  },
];
