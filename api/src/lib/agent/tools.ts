/**
 * Agent tool registry. Wraps the platform's existing API endpoints as typed
 * tools the investigator agent can call. Each tool maps 1:1 to an MCP tool
 * from worker/mcp-server.ts but uses a lightweight fetch helper instead of
 * the MCP SDK.
 */
import type { AgentTool } from './types';

const API_BASE = 'https://pranithjain.qzz.io';

/**
 * Fetch a JSON response from the platform's own API via the SELF service
 * binding (in-process) or a public fetch fallback.
 */
async function apiFetch<T>(
  self: Fetcher | undefined,
  path: string,
  apiKey?: string,
  init?: RequestInit,
  internalHeader?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(internalHeader ?? {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
  const req = new Request(`${API_BASE}${path}`, { ...init, headers });
  const res = self ? await self.fetch(req) : await fetch(req);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch an SSE stream endpoint and return parsed events. Used for /ioc/check
 * which streams per-provider results.
 */
async function apiFetchSse(
  self: Fetcher | undefined,
  path: string,
  apiKey?: string,
  internalHeader?: Record<string, string>
): Promise<{ events: Array<{ event: string; data: unknown }> }> {
  const headers: Record<string, string> = { accept: 'text/event-stream', ...(internalHeader ?? {}) };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
  const req = new Request(`${API_BASE}${path}`, { headers });
  const res = self ? await self.fetch(req) : await fetch(req);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split('\n\n')) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const raw = dataLines.join('\n');
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw */
    }
    events.push({ event, data });
  }
  return { events };
}

/** Build the full agent tool registry for a given session context. */
export function buildToolRegistry(
  self?: Fetcher,
  apiKey?: string,
  internalHeader?: Record<string, string>
): AgentTool[] {
  const ih = internalHeader;
  return [
    // ── IOC & Reputation ──────────────────────────────────────────────
    {
      name: 'check_ioc',
      description:
        'Check reputation of an IP, domain, URL, or file hash across 30+ threat intelligence providers. Returns composite score, admiralty grade, and per-provider verdicts.',
      params: [
        {
          name: 'indicator',
          type: 'string',
          description: 'The IOC to check — IP, domain, URL, or hash',
          required: true,
        },
      ],
      execute: (args) =>
        apiFetchSse(self, `/api/v1/ioc/check?indicator=${encodeURIComponent(String(args.indicator))}`, apiKey, ih),
    },
    {
      name: 'correlate_iocs',
      description:
        'Search correlated IOCs. Find relationships between indicators — shared infrastructure, overlapping campaigns, and linked threat actors.',
      params: [{ name: 'q', type: 'string', description: 'IOC or keyword to correlate', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/ioc-correlation?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'get_ioc_lifecycle',
      description:
        'Get lifecycle data for an IOC — first seen, last seen, activity trend, decay rate. Use to determine if an indicator is still active.',
      params: [{ name: 'indicator', type: 'string', description: 'The IOC to check', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          `/api/v1/ioc-lifecycle?indicator=${encodeURIComponent(String(args.indicator))}`,
          apiKey,
          undefined,
          ih
        ),
    },
    {
      name: 'get_trending_iocs',
      description: 'Get the most active IOCs in the last 24 hours. Useful for identifying emerging threats.',
      params: [
        { name: 'limit', type: 'number', description: 'Max results (default 50)', required: false },
        {
          name: 'type',
          type: 'enum',
          description: 'Filter by indicator type',
          required: false,
          enum: ['ipv4', 'domain', 'url', 'hash'],
        },
      ],
      execute: (args) => {
        const p = new URLSearchParams();
        if (args.limit) p.set('limit', String(args.limit));
        if (args.type) p.set('type', String(args.type));
        return apiFetch(self, `/api/v1/ioc-lifecycle/trending?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'get_relationships',
      description:
        'Get the relationship graph for an IOC — connections to actors, malware, campaigns, CVEs, and other indicators.',
      params: [{ name: 'indicator', type: 'string', description: 'The IOC to get relationships for', required: true }],
      execute: (args) => {
        const enc = encodeURIComponent(String(args.indicator));
        return apiFetch(self, `/api/v1/relationship-graph?indicator=${enc}&q=${enc}`, apiKey, undefined, ih);
      },
    },

    // ── CVE & Vulnerabilities ─────────────────────────────────────────
    {
      name: 'lookup_cve',
      description:
        'Look up a CVE by ID. Returns CVSS score, EPSS probability, CISA KEV status, affected products, and references.',
      params: [{ name: 'cve_id', type: 'string', description: 'CVE identifier, e.g. CVE-2024-3094', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/cve/lookup?id=${encodeURIComponent(String(args.cve_id))}`, apiKey, undefined, ih),
    },

    // ── Domain & Network ──────────────────────────────────────────────
    {
      name: 'lookup_domain',
      description: 'Domain intelligence — DNS records, WHOIS/RDAP, CT logs, SPF/DKIM/DMARC, and threat intel hits.',
      params: [{ name: 'domain', type: 'string', description: 'Fully qualified domain name', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          `/api/v1/domain/lookup?domain=${encodeURIComponent(String(args.domain))}`,
          apiKey,
          undefined,
          ih
        ),
    },
    {
      name: 'lookup_ip_geo',
      description: 'IP geolocation, ASN, company, and VPN/proxy/tor detection.',
      params: [{ name: 'ip', type: 'string', description: 'IPv4 or IPv6 address', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/ip-geo?ip=${encodeURIComponent(String(args.ip))}`, apiKey, undefined, ih),
    },
    {
      name: 'lookup_asn',
      description: 'ASN intelligence — AS name, country, network ranges, RIR registration, BGP peers.',
      params: [{ name: 'asn', type: 'string', description: 'AS number, e.g. AS13335', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/asn/lookup?asn=${encodeURIComponent(String(args.asn))}`, apiKey, undefined, ih),
    },
    {
      name: 'get_domain_history',
      description:
        'WHOIS history for a domain — registration snapshots, ownership changes, registrar changes over time.',
      params: [{ name: 'domain', type: 'string', description: 'Domain to get history for', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          `/api/v1/domain/history?domain=${encodeURIComponent(String(args.domain))}`,
          apiKey,
          undefined,
          ih
        ),
    },
    {
      name: 'pivot_domain',
      description:
        'Pivot across domains by shared registrant email, org, nameservers, or registrar. Maps attacker infrastructure.',
      params: [
        { name: 'domain', type: 'string', description: 'Domain to pivot from', required: true },
        {
          name: 'type',
          type: 'enum',
          description: 'Pivot type',
          required: false,
          enum: ['email', 'org', 'nameserver', 'registrar', 'all'],
        },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ domain: String(args.domain) });
        if (args.type) p.set('type', String(args.type));
        return apiFetch(self, `/api/v1/domain/history/pivot?${p}`, apiKey, undefined, ih);
      },
    },

    // ── Threat Actors & Malware ────────────────────────────────────────
    {
      name: 'enrich_actor',
      description:
        'Get a threat actor profile — aliases, country attribution, MITRE techniques, campaigns, and associated malware.',
      params: [{ name: 'actor', type: 'string', description: 'Actor name or slug, e.g. APT28', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/actor-enrich?name=${encodeURIComponent(String(args.actor))}`, apiKey, undefined, ih),
    },
    {
      name: 'search_malpedia',
      description:
        'Search Malpedia for malware families or threat actors. Returns entries with descriptions and references.',
      params: [{ name: 'q', type: 'string', description: 'Malware family or actor name', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/malpedia/search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'search_triage',
      description: 'Search Recorded Future Triage sandbox for malware samples by family, tag, hash, URL, or domain.',
      params: [{ name: 'q', type: 'string', description: 'Triage search query', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/triage/search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ── Intel Feeds ───────────────────────────────────────────────────
    {
      name: 'get_live_iocs',
      description:
        'Latest live IOC feed — real-time indicators from 20+ sources including blocklists, abuse.ch, and community submissions.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/live-iocs', apiKey, undefined, ih),
    },
    {
      name: 'get_ransomware_activity',
      description: 'Recent ransomware activity — latest victims, group activity, and leak-site posts.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/ransomware-recent', apiKey, undefined, ih),
    },
    {
      name: 'get_threat_pulse',
      description:
        'Global threat overview — top actors, trending malware, most exploited CVEs, and geopolitical cyber events from the past week.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/threat-pulse', apiKey, undefined, ih),
    },
    {
      name: 'get_today_briefing',
      description:
        "Today's threat intelligence briefing — curated digest of latest CVEs, ransomware, breaches, and emerging threats.",
      params: [],
      execute: () => apiFetch(self, '/api/v1/briefings/today', apiKey, undefined, ih),
    },
    {
      name: 'get_detections',
      description:
        'Latest detection rules feed — Sigma, YARA, and Snort rules mapped to actors, malware, and MITRE techniques.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/detections', apiKey, undefined, ih),
    },
    {
      name: 'unified_search',
      description:
        'Cross-source search across all threat intel feeds. Search by keyword, IOC, actor name, malware family, or CVE.',
      params: [{ name: 'q', type: 'string', description: 'Search query', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/unified-search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ── Breach & Exposure ─────────────────────────────────────────────
    {
      name: 'check_breach',
      description:
        'Check if an email or domain has been exposed in known data breaches. Returns breach names, dates, and exposed data types.',
      params: [
        { name: 'target', type: 'string', description: 'Email address or domain', required: true },
        { name: 'type', type: 'enum', description: 'Target type', required: true, enum: ['email', 'domain'] },
      ],
      execute: (args) => {
        const breachType = args.type === 'email' || args.type === 'domain' ? args.type : 'email';
        return apiFetch(
          self,
          `/api/v1/breach/${breachType}?${breachType}=${encodeURIComponent(String(args.target))}`,
          apiKey,
          undefined,
          ih
        );
      },
    },

    // ── MITRE ATT&CK ─────────────────────────────────────────────────
    {
      name: 'lookup_mitre',
      description:
        'Look up a MITRE ATT&CK technique by ID. Returns name, description, tactics, mitigations, and detection guidance.',
      params: [{ name: 'technique_id', type: 'string', description: 'Technique ID, e.g. T1566.001', required: true }],
      execute: (args) => {
        const enc = encodeURIComponent(String(args.technique_id));
        return apiFetch(self, `/api/v1/mitre/technique?id=${enc}&technique=${enc}`, apiKey, undefined, ih);
      },
    },

    // ── Web & Phishing ────────────────────────────────────────────────
    {
      name: 'scan_website',
      description:
        'Scan a website for security issues — security headers, SSL certificate, technologies, and vulnerabilities.',
      params: [{ name: 'url', type: 'string', description: 'URL to scan', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/web-scan?url=${encodeURIComponent(String(args.url))}`, apiKey, undefined, ih),
    },
    {
      name: 'analyze_phishing_url',
      description:
        'Analyze a URL for phishing indicators. Checks PhishTank, OpenPhish, URLhaus, and visual similarity.',
      params: [{ name: 'url', type: 'string', description: 'URL to analyze', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/phishing/analyze',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: String(args.url) }),
          },
          ih
        ),
    },
    {
      name: 'wayback_lookup',
      description:
        'Check Wayback Machine for historical snapshots of a URL. Track website changes or recover deleted content.',
      params: [{ name: 'url', type: 'string', description: 'URL to look up', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/wayback/cdx?url=${encodeURIComponent(String(args.url))}`, apiKey, undefined, ih),
    },

    // ── Crypto ────────────────────────────────────────────────────────
    {
      name: 'trace_crypto_address',
      description: 'Trace a cryptocurrency wallet — balance, transaction history, and associated entities.',
      params: [
        { name: 'address', type: 'string', description: 'Crypto wallet address', required: true },
        {
          name: 'chain',
          type: 'enum',
          description: 'Blockchain',
          required: false,
          enum: ['bitcoin', 'ethereum', 'monero'],
        },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ address: String(args.address) });
        if (args.chain) p.set('chain', String(args.chain));
        return apiFetch(self, `/api/v1/crypto-trace?${p}`, apiKey, undefined, ih);
      },
    },

    // ── Reports & Parsing ─────────────────────────────────────────────
    {
      name: 'parse_threat_report',
      description:
        'Parse a threat report to extract IOCs, actors, malware families, MITRE techniques, CVEs, and targeted sectors.',
      params: [
        {
          name: 'text',
          type: 'string',
          description: 'Report text to analyze (required if url not provided)',
          required: false,
        },
        {
          name: 'url',
          type: 'string',
          description: 'URL of the report to fetch and analyze (required if text not provided)',
          required: false,
        },
      ],
      execute: (args) => {
        if (!args.text && !args.url) {
          return Promise.reject(new Error('Either text or url must be provided'));
        }
        return apiFetch(
          self,
          '/api/v1/report/parse',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: args.text, url: args.url }),
          },
          ih
        );
      },
    },

    // ── CT Monitoring ─────────────────────────────────────────────────
    {
      name: 'get_domain_certs',
      description:
        'Recent certificates for a domain from Certificate Transparency logs. Shows new subdomains and cert details.',
      params: [
        { name: 'domain', type: 'string', description: 'Domain to query', required: true },
        { name: 'days', type: 'number', description: 'Look back period in days (default 30)', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ domain: String(args.domain) });
        if (args.days) p.set('days', String(args.days));
        return apiFetch(self, `/api/v1/ct-monitor/certs?${p}`, apiKey, undefined, ih);
      },
    },
  ];
}

/**
 * Summarize tool results into a compact observation string for the LLM planner.
 * Truncates large payloads to stay within context limits.
 */
export function summarizeToolResult(tool: string, result: unknown, maxLen = 2000): string {
  const json = JSON.stringify(result, null, 2);
  if (json.length <= maxLen) return json;
  return json.slice(0, maxLen) + `\n... [truncated, ${json.length} chars total]`;
}

/** Get a plain-text description of all available tools for the planner prompt. */
export function describeTools(tools: AgentTool[]): string {
  return tools
    .map(
      (t) =>
        `- **${t.name}**: ${t.description}\n  Params: ${t.params.length === 0 ? '(none)' : t.params.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}${p.enum ? ` [${p.enum.join('|')}]` : ''}`).join(', ')}`
    )
    .join('\n');
}
