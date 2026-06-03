import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import type { Connection, ConnectionContext } from 'agents';
import { z } from 'zod';

type Env = {
  KV_CACHE?: KVNamespace;
  BRIEFINGS_DB?: D1Database;
  /** Self-referencing service binding — lets tool calls hit our own /api/* in
   *  process (no public DNS/TLS round-trip). Optional so a missing binding
   *  falls back to a public fetch. */
  SELF?: Fetcher;
};

const API_BASE = 'https://pranithjain.qzz.io';

async function apiFetch<T>(self: Fetcher | undefined, path: string, apiKey?: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (apiKey) {
    headers['authorization'] = `Bearer ${apiKey}`;
  }
  const req = new Request(`${API_BASE}${path}`, { ...init, headers });
  // Prefer the in-process SELF service binding (no public DNS/TLS hop back into
  // our own origin); fall back to a public fetch if the binding isn't present.
  const res = self ? await self.fetch(req) : await fetch(req);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export class DfirMcpServer extends McpAgent<Env, Record<string, never>, Record<string, never>> {
  server = new McpServer({
    name: 'DFIR-ThreatIntel-MCP',
    version: '1.0.0',
  });

  /** API key extracted from the MCP client's Authorization header. */
  private apiKey: string | undefined;

  /**
   * Called when a new MCP client connects. Captures the caller's API key
   * from the initial request headers (the streamable-HTTP transport forwards
   * the original client headers on the internal connection request) so the
   * tool handlers below can authorize downstream API calls.
   */
  override async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
    const authz = ctx.request.headers.get('authorization') ?? '';
    const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
    const apiKey = ctx.request.headers.get('x-api-key') ?? undefined;
    this.apiKey = bearer ?? apiKey ?? undefined;

    // CRITICAL: delegate to the base McpAgent. Its onConnect wires the
    // streamable-HTTP transport (handlePostRequest / handleGetRequest) — i.e.
    // it feeds JSON-RPC messages into the MCP server. Without this super call,
    // every message (starting with `initialize`) is dropped on the floor: the
    // server returns 200 + a session id but never writes a response, so every
    // client hangs and times out on connect.
    await super.onConnect(conn, ctx);
  }

  async init() {
    // ── IOC Check ────────────────────────────────────────────────────────
    this.server.tool(
      'check_ioc',
      'Check reputation of an IP address, domain, URL, or file hash (MD5/SHA1/SHA256) across 30+ threat intelligence providers. Returns composite score, admiralty grade, and per-provider verdicts.',
      { indicator: z.string().describe('The IOC to check — IP, domain, URL, or hash') },
      async ({ indicator }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
          this.env.SELF,
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
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/briefings/today', this.apiKey);
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
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, `/api/v1/briefings/list${qs}`, this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Live IOCs ────────────────────────────────────────────────────────
    this.server.tool(
      'get_live_iocs',
      'Get the latest live IOC feed — real-time indicators of compromise aggregated from 20+ sources including blocklists, tweet feeds, abuse.ch, and community submissions.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/live-iocs', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Ransomware Recent ────────────────────────────────────────────────
    this.server.tool(
      'get_ransomware_activity',
      'Get recent ransomware activity — latest victims, group activity, and leak-site posts from ransomware.live and other trackers.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/ransomware-recent', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Phishing Analyze ─────────────────────────────────────────────────
    this.server.tool(
      'analyze_phishing_email',
      'Analyze raw email source for phishing indicators. Parses headers, checks SPF/DKIM/DMARC, extracts URLs, and computes a risk score with flags.',
      { raw_email: z.string().describe('Full raw email source (headers + body)') },
      async ({ raw_email }) => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/phishing/analyze', this.apiKey, {
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
          this.env.SELF,
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
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/detections', this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Threat Pulse ─────────────────────────────────────────────────────
    this.server.tool(
      'get_threat_pulse',
      'Get a global threat overview — top active threat actors, trending malware families, most exploited CVEs, and geopolitical cyber events from the past week.',
      {},
      async () => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/threat-pulse', this.apiKey);
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
          this.env.SELF,
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
          this.env.SELF,
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
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/feed-status', this.apiKey);
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
          this.env.SELF,
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
          this.env.SELF,
          `/api/v1/relationship-graph?indicator=${encodeURIComponent(indicator)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── IP Geolocation & Privacy ─────────────────────────────────────────
    this.server.tool(
      'lookup_ip_geo',
      'Get IP geolocation, ASN, company, and privacy detection (VPN/proxy/tor/hosting). Uses IPinfo and Spur.us for anonymization detection.',
      { ip: z.string().describe('IPv4 or IPv6 address') },
      async ({ ip }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/ip-geo?ip=${encodeURIComponent(ip)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Generate Blocklists ──────────────────────────────────────────────
    this.server.tool(
      'get_blocklists',
      'Get pre-generated firewall blocklists in pfSense, iptables, and Suricata formats. Derived from aggregated threat intel feeds.',
      {
        format: z
          .enum(['pfsense', 'iptables', 'suricata', 'meta'])
          .optional()
          .describe('Blocklist format (default: meta)'),
      },
      async ({ format }) => {
        const fmt = format ?? 'meta';
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, `/api/v1/blocklists/${fmt}`, this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Search Malpedia ─────────────────────────────────────────────────
    this.server.tool(
      'search_malware',
      'Search for malware families. Returns family info, YARA rules, samples, and references from Malpedia.',
      { q: z.string().describe('Malware family name or keyword') },
      async ({ q }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/malpedia/search?q=${encodeURIComponent(q)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Wayback Machine ─────────────────────────────────────────────────
    this.server.tool(
      'wayback_lookup',
      'Check the Wayback Machine (archive.org) for historical snapshots of a URL. Useful for tracking website changes or recovering deleted content.',
      { url: z.string().describe('URL to look up in the Wayback Machine') },
      async ({ url }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/wayback/cdx?url=${encodeURIComponent(url)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Phishing Analysis ───────────────────────────────────────────────
    this.server.tool(
      'analyze_phishing_url',
      'Analyze a URL for phishing indicators. Checks against PhishTank, OpenPhish, URLhaus, and performs visual similarity analysis.',
      { url: z.string().describe('URL to analyze') },
      async ({ url }) => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, `/api/v1/phishing/analyze`, this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Web Scan ────────────────────────────────────────────────────────
    this.server.tool(
      'scan_website',
      'Scan a website for security issues — checks security headers, SSL certificate, technologies, and potential vulnerabilities.',
      { url: z.string().describe('URL to scan') },
      async ({ url }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/web-scan?url=${encodeURIComponent(url)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Google Dorks ────────────────────────────────────────────────────
    this.server.tool(
      'google_dorks',
      'Generate and execute Google dork queries for a domain. Useful for finding exposed files, login pages, and sensitive information.',
      {
        domain: z.string().describe('Domain to dork'),
        dork_type: z.enum(['files', 'login', 'sensitive', 'all']).optional().describe('Type of dorks to run'),
      },
      async ({ domain, dork_type }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/google-dorks?domain=${encodeURIComponent(domain)}&type=${dork_type ?? 'all'}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Crypto Trace ────────────────────────────────────────────────────
    this.server.tool(
      'trace_crypto_address',
      'Trace a cryptocurrency wallet address. Returns balance, transaction history, and associated entities from blockchain explorers.',
      {
        address: z.string().describe('Crypto wallet address'),
        chain: z.enum(['bitcoin', 'ethereum', 'monero']).optional().describe('Blockchain (default: auto-detect)'),
      },
      async ({ address, chain }) => {
        const qs = new URLSearchParams({ address });
        if (chain) qs.set('chain', chain);
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, `/api/v1/crypto-trace?${qs}`, this.apiKey);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Report Parser ───────────────────────────────────────────────────
    this.server.tool(
      'parse_threat_report',
      'Parse a threat intelligence report or article to extract structured data: IOCs (IPs, domains, URLs, hashes), threat actors, malware families, MITRE ATT&CK techniques, CVEs, targeted sectors, and an executive summary. Use this when analyzing threat reports, blog posts, or incident write-ups.',
      {
        text: z.string().optional().describe('The report text to analyze'),
        url: z.string().optional().describe('URL of the report to fetch and analyze'),
      },
      async ({ text, url }) => {
        if (!text && !url) {
          throw new Error('Either text or url must be provided');
        }
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/report/parse', this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, url }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── IOC Lifecycle ───────────────────────────────────────────────────
    this.server.tool(
      'get_ioc_lifecycle',
      'Get the lifecycle data for an IOC — when it first appeared, last seen, activity trend, and decay rate. Use this to understand if an indicator is still active or dormant.',
      { indicator: z.string().describe('The IOC to get lifecycle data for') },
      async ({ indicator }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/ioc-lifecycle?indicator=${encodeURIComponent(indicator)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Trending IOCs ───────────────────────────────────────────────────
    this.server.tool(
      'get_trending_iocs',
      'Get the most active IOCs in the last 24 hours. Returns indicators with highest observation counts and scores, useful for identifying emerging threats.',
      {
        limit: z.number().optional().describe('Max results (default 50, max 200)'),
        type: z.enum(['ipv4', 'domain', 'url', 'hash']).optional().describe('Filter by indicator type'),
      },
      async ({ limit, type }) => {
        const params = new URLSearchParams();
        if (limit) params.set('limit', String(limit));
        if (type) params.set('type', type);
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/ioc-lifecycle/trending?${params}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── YARA Rule Generator ─────────────────────────────────────────────
    this.server.tool(
      'generate_yara_rule',
      'Generate a YARA detection rule using AI. Provide a description of what to detect, and optionally known strings, malware family name, and target file type. Returns a syntactically valid YARA rule with metadata.',
      {
        description: z.string().describe('What the rule should detect (e.g., "Cobalt Strike beacon DLL")'),
        strings: z.array(z.string()).optional().describe('Known malicious strings to match'),
        family: z.string().optional().describe('Malware family name'),
        filetype: z.string().optional().describe('Target file type (PE, ELF, document, etc.)'),
        complexity: z.enum(['basic', 'standard', 'advanced']).optional().describe('Rule complexity level'),
      },
      async ({ description, strings, family, filetype, complexity }) => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/yara/generate', this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ description, strings, family, filetype, complexity }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── YARA Rule Validator ─────────────────────────────────────────────
    this.server.tool(
      'validate_yara_rule',
      'Validate a YARA rule syntax. Checks for balanced braces, required sections, and proper string definitions.',
      {
        rule: z.string().describe('The YARA rule text to validate'),
      },
      async ({ rule }) => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/yara/validate', this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rule }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── CT Domain Monitor ───────────────────────────────────────────────
    this.server.tool(
      'watch_domain_ct',
      'Add a domain to Certificate Transparency monitoring. Alerts on new subdomains, suspicious patterns, wildcard certs, and more. Uses crt.sh for unlimited free CT log queries.',
      {
        domain: z.string().describe('Domain to monitor (e.g., example.com)'),
        alert_types: z
          .array(z.enum(['new_subdomain', 'suspicious_name', 'wildcard', 'ca_change', 'short_validity', 'ip_cert']))
          .optional()
          .describe('Types of alerts to generate'),
      },
      async ({ domain, alert_types }) => {
        const data = await apiFetch<Record<string, unknown>>(this.env.SELF, '/api/v1/ct-monitor/watch', this.apiKey, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ domain, alert_types }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      'get_domain_certs',
      'Get recent certificates for a domain from Certificate Transparency logs. Shows new subdomains, certificate details, and any alerts.',
      {
        domain: z.string().describe('Domain to query'),
        days: z.number().optional().describe('Look back period in days (default 30)'),
        limit: z.number().optional().describe('Max results (default 100)'),
      },
      async ({ domain, days, limit }) => {
        const params = new URLSearchParams({ domain });
        if (days) params.set('days', String(days));
        if (limit) params.set('limit', String(limit));
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/ct-monitor/certs?${params}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── WHOIS History ────────────────────────────────────────────────
    this.server.tool(
      'get_domain_history',
      'Get the WHOIS history for a domain. Returns all historical registration snapshots, ownership changes, registrar changes, and nameserver changes over time. Essential for tracking domain ownership transfers and identifying infrastructure reuse by threat actors.',
      { domain: z.string().describe('Domain to get history for, e.g. evil-example.com') },
      async ({ domain }) => {
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/domain/history?domain=${encodeURIComponent(domain)}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      'pivot_domain',
      'Pivot across domains by shared registrant attributes. Find other domains owned by the same entity by matching registrant email, organization, nameservers, or registrar. Critical for mapping attacker infrastructure — if a malicious domain shares its registrant email with 50 other domains, those are likely all owned by the same threat actor.',
      {
        domain: z.string().describe('Domain to pivot from'),
        type: z
          .enum(['email', 'org', 'nameserver', 'registrar', 'all'])
          .optional()
          .describe(
            'Pivot type (default: all) — email pivots by registrant email, org by organization, nameserver by shared NS, registrar by same registrar'
          ),
      },
      async ({ domain, type }) => {
        const params = new URLSearchParams({ domain });
        if (type) params.set('type', type);
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/domain/history/pivot?${params}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      'search_registrant',
      'Search for all domains registered by a specific email address or organization name. Returns domains, registration dates, and snapshot counts. Useful for finding all infrastructure operated by a known threat actor.',
      {
        email: z.string().optional().describe('Registrant email to search for'),
        org: z.string().optional().describe('Registrant organization name to search for (partial match)'),
      },
      async ({ email, org }) => {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (org) params.set('org', org);
        const data = await apiFetch<Record<string, unknown>>(
          this.env.SELF,
          `/api/v1/domain/history/search?${params}`,
          this.apiKey
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
