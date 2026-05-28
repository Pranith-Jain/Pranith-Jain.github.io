import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';

type Env = {
  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
};

const API_BASE = 'https://pranithjain.qzz.io';

async function apiFetch<T>(path: string, apiKey?: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'accept': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (apiKey) {
    headers['authorization'] = `Bearer ${apiKey}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export class DfirMcpServer extends McpAgent<Env, Record<string, never>, {}> {
  server = new McpServer({
    name: 'DFIR-ThreatIntel-MCP',
    version: '1.0.0',
  });

  /** API key extracted from the MCP client's Authorization header. */
  private apiKey: string | undefined;

  /**
   * Called when a new MCP client connects. Extracts the API key from the
   * Authorization header for downstream API calls.
   */
  async onConnect(connection: unknown): Promise<void> {
    // McpAgent passes the request context through props or connection metadata.
    // For Streamable HTTP transport, the API key is in the initial request headers.
    // We store it on the instance for all subsequent tool calls.
    const req = (this as unknown as { request?: Request }).request;
    if (req) {
      const authz = req.headers.get('authorization') ?? '';
      const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
      const apiKey = req.headers.get('x-api-key');
      this.apiKey = bearer ?? apiKey ?? undefined;
    }
  }

  async init() {
    // ── IOC Check ────────────────────────────────────────────────────────
    this.server.tool(
      'check_ioc',
      'Check reputation of an IP address, domain, URL, or file hash (MD5/SHA1/SHA256) across 30+ threat intelligence providers. Returns composite score, admiralty grade, and per-provider verdicts.',
      { indicator: z.string().describe('The IOC to check — IP, domain, URL, or hash') },
      async ({ indicator }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/ioc/check?indicator=${encodeURIComponent(indicator)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── CVE Lookup ───────────────────────────────────────────────────────
    this.server.tool(
      'lookup_cve',
      'Look up a CVE by ID. Returns description, CVSS score, EPSS probability, CISA KEV status, affected products, and references.',
      { cve_id: z.string().describe('CVE identifier, e.g. CVE-2024-3094') },
      async ({ cve_id }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/cve/lookup?id=${encodeURIComponent(cve_id)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── CVE Search ───────────────────────────────────────────────────────
    this.server.tool(
      'search_cve',
      'Search CVEs by keyword. Returns matching CVE IDs with severity and brief descriptions.',
      { q: z.string().describe('Search keyword — vendor, product, or vulnerability type') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/cve/search?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Threat Actor Enrichment ──────────────────────────────────────────
    this.server.tool(
      'enrich_actor',
      'Get a threat actor profile. Returns aliases, country attribution, MITRE ATT&CK techniques, known campaigns, and associated malware families.',
      { actor: z.string().describe('Threat actor name or slug, e.g. APT28, lazarus-group') },
      async ({ actor }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/actor-enrich?actor=${encodeURIComponent(actor)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Malpedia Search ──────────────────────────────────────────────────
    this.server.tool(
      'search_malpedia',
      'Search Malpedia for malware families or threat actors. Returns matching entries with descriptions and references.',
      { q: z.string().describe('Search query — malware family name or actor name') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/malpedia/search?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Domain Lookup ────────────────────────────────────────────────────
    this.server.tool(
      'lookup_domain',
      'Domain intelligence lookup. Returns DNS records (A, AAAA, MX, NS, TXT, SOA), WHOIS/RDAP registration data, CT log (certificate transparency) entries, SPF/DKIM/DMARC email authentication analysis, and threat intel hits from blocklists and IOC feeds.',
      { domain: z.string().describe('Fully qualified domain name, e.g. example.com') },
      async ({ domain }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/domain/lookup?domain=${encodeURIComponent(domain)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── ASN Lookup ───────────────────────────────────────────────────────
    this.server.tool(
      'lookup_asn',
      'ASN intelligence lookup. Returns AS name, country, network ranges, RIR registration, and BGP peer info.',
      { asn: z.string().describe('AS number, e.g. AS13335 or 13335') },
      async ({ asn }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/asn/lookup?asn=${encodeURIComponent(asn)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Triage Search ────────────────────────────────────────────────────
    this.server.tool(
      'search_triage',
      'Search Recorded Future Triage sandbox for malware samples by family, tag, hash, URL, or domain. Returns analysis results, behavioral reports, and extracted configs.',
      { q: z.string().describe('Triage search query — family:name, tag:ransomware, md5:..., url:...') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/triage/search?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Today's Briefing ─────────────────────────────────────────────────
    this.server.tool(
      'get_today_briefing',
      "Get today's threat intelligence briefing. A curated digest of the latest CVEs, ransomware activity, data breaches, and emerging threats from the past 24 hours.",
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/briefings/today', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── List Briefings ───────────────────────────────────────────────────
    this.server.tool(
      'list_briefings',
      'List recent threat intelligence briefings (daily and weekly). Returns slug, date, type, and summary for each.',
      { limit: z.number().optional().describe('Max briefings to return (default 10)') },
      async ({ limit }) => {
        const qs = limit ? `?limit=${limit}` : '';
        const data = await apiFetch<Record<string, unknown>>(`/api/v1/briefings/list${qs}`, this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Live IOCs ────────────────────────────────────────────────────────
    this.server.tool(
      'get_live_iocs',
      'Get the latest live IOC feed — real-time indicators of compromise aggregated from 20+ sources including blocklists, tweet feeds, abuse.ch, and community submissions.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/live-iocs', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Ransomware Recent ────────────────────────────────────────────────
    this.server.tool(
      'get_ransomware_activity',
      'Get recent ransomware activity — latest victims, group activity, and leak-site posts from ransomware.live and other trackers.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/ransomware-recent', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Phishing Analyze ─────────────────────────────────────────────────
    this.server.tool(
      'analyze_phishing_email',
      'Analyze raw email source for phishing indicators. Parses headers, checks SPF/DKIM/DMARC, extracts URLs, and computes a risk score with flags.',
      { raw_email: z.string().describe('Full raw email source (headers + body)') },
      async ({ raw_email }) => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/phishing/analyze', this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: raw_email,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Unified Search ───────────────────────────────────────────────────
    this.server.tool(
      'unified_search',
      'Cross-source search across all threat intelligence feeds. Search by keyword, IOC, actor name, malware family, or CVE to find matching entries across briefings, live feeds, ransomware data, and more.',
      { q: z.string().describe('Search query') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/unified-search?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Detections ───────────────────────────────────────────────────────
    this.server.tool(
      'get_detections',
      'Get the latest detection rules feed — Sigma, YARA, and Snort rules mapped to threat actors, malware families, and MITRE ATT&CK techniques.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/detections', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Threat Pulse ─────────────────────────────────────────────────────
    this.server.tool(
      'get_threat_pulse',
      'Get a global threat overview — top active threat actors, trending malware families, most exploited CVEs, and geopolitical cyber events from the past week.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/threat-pulse', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── IOC Correlation ──────────────────────────────────────────────────
    this.server.tool(
      'correlate_iocs',
      'Search correlated IOCs. Find relationships between indicators — shared infrastructure, overlapping campaigns, and linked threat actors.',
      { q: z.string().describe('IOC or keyword to correlate') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/ioc-correlation?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Breach Check ─────────────────────────────────────────────────────
    this.server.tool(
      'check_breach',
      'Check if an email address or domain has been exposed in known data breaches. Returns breach names, dates, and exposed data types.',
      {
        target: z.string().describe('Email address or domain to check'),
        type: z.enum(['email', 'domain']).describe('Whether the target is an email or domain'),
      },
      async ({ target, type }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/breach/${type}?q=${encodeURIComponent(target)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Feed Status ──────────────────────────────────────────────────────
    this.server.tool(
      'get_feed_status',
      'Get the health and freshness status of all 30+ threat intelligence feed sources. Shows last update time, error rates, and data volume.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>('/api/v1/feed-status', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── MITRE Technique ──────────────────────────────────────────────────
    this.server.tool(
      'lookup_mitre',
      'Look up a MITRE ATT&CK technique by ID. Returns technique name, description, tactics, mitigations, and detection guidance.',
      { technique_id: z.string().describe('MITRE ATT&CK technique ID, e.g. T1566.001') },
      async ({ technique_id }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/mitre/technique?id=${encodeURIComponent(technique_id)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Relationship Graph ───────────────────────────────────────────────
    this.server.tool(
      'get_relationships',
      'Get the relationship graph for an IOC — shows connections to threat actors, malware families, campaigns, CVEs, and other indicators.',
      { indicator: z.string().describe('The IOC to get relationships for') },
      async ({ indicator }) => {
        const data = await apiFetch<Record<string, unknown>>(
          `/api/v1/relationship-graph?indicator=${encodeURIComponent(indicator)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
