/**
 * CTI Analyst Agent — Full tool registry.
 * 60+ tools across all CTI domains: IOC enrichment, vulnerability intel,
 * actor profiling, malware analysis, domain/host intel, detection rules,
 * relationship graphs, campaign tracking, STIX/TAXII, dark web, phishing,
 * breach monitoring, and more.
 */
import type { AgentTool } from './types';

const API_BASE = 'https://pranithjain.qzz.io';

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

export function buildToolRegistry(
  self?: Fetcher,
  apiKey?: string,
  internalHeader?: Record<string, string>
): AgentTool[] {
  const ih = internalHeader;

  return [
    // ══════════════════════════════════════════════════════════════════════
    //  IOC ENRICHMENT & REPUTATION
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'check_ioc',
      description:
        'Multi-provider IOC reputation check (32+ providers: VirusTotal, AbuseIPDB, Shodan, AlienVault, GreyNoise, CrowdSec, StopForumSpam, DShield, TweetFeed, Spamhaus, ThreatFox, URLhaus, IPsum, and more). Returns composite score, admiralty grade, per-provider verdicts with detection ratios, geolocation, ASN, abuse reports.',
      params: [{ name: 'indicator', type: 'string', description: 'IP, domain, URL, or file hash', required: true }],
      execute: (args) =>
        apiFetchSse(self, `/api/v1/ioc/check?indicator=${encodeURIComponent(String(args.indicator))}`, apiKey, ih),
    },
    {
      name: 'correlate_iocs',
      description:
        'Cross-source IOC correlation. Find which feeds report this indicator, source count, shared infrastructure, overlapping campaigns.',
      params: [{ name: 'q', type: 'string', description: 'IOC or keyword to correlate', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/ioc-correlation?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'get_ioc_lifecycle',
      description:
        'IOC temporal lifecycle — first seen, last seen, activity trend, decay rate, observation count. Is this indicator still active?',
      params: [{ name: 'indicator', type: 'string', description: 'IOC to check lifecycle', required: true }],
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
      name: 'get_relationships',
      description:
        'IOC relationship graph — connections to threat actors, malware families, campaigns, CVEs, other indicators. Shows the attack graph.',
      params: [{ name: 'indicator', type: 'string', description: 'IOC to map relationships', required: true }],
      execute: (args) => {
        const enc = encodeURIComponent(String(args.indicator));
        return apiFetch(self, `/api/v1/relationship-graph?indicator=${enc}&q=${enc}`, apiKey, undefined, ih);
      },
    },

    // ══════════════════════════════════════════════════════════════════════
    //  THREAT ACTOR INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'enrich_actor',
      description:
        'Threat actor profile — aliases, country, MITRE techniques, campaigns, malware families, OTX pulses, linked CVEs.',
      params: [
        {
          name: 'actor',
          type: 'string',
          description: 'Actor name or slug (APT28, lazarus-group, lockbit)',
          required: true,
        },
      ],
      execute: (args) =>
        apiFetch(self, `/api/v1/actor-enrich?name=${encodeURIComponent(String(args.actor))}`, apiKey, undefined, ih),
    },
    {
      name: 'actor_timeline',
      description: 'Actor activity timeline — posting cadence, victim disclosures over time, operational tempo.',
      params: [{ name: 'actor', type: 'string', description: 'Actor slug', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/actor-timeline?actor=${encodeURIComponent(String(args.actor))}`, apiKey, undefined, ih),
    },
    {
      name: 'actor_cves',
      description: 'CVEs attributed to a specific threat actor. Use slug format (apt28, lazarus-group, lockbit).',
      params: [{ name: 'actor', type: 'string', description: 'Actor slug (apt28, lazarus-group)', required: true }],
      execute: (args) => {
        const slug = String(args.actor).toLowerCase().replace(/\s+/g, '-');
        return apiFetch(self, `/api/v1/actor-cves?slug=${encodeURIComponent(slug)}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'search_malpedia',
      description:
        'Search Malpedia for malware families or threat actors. Returns descriptions, references, YARA rules. For actors, use the actor name (e.g. "APT28", "Fancy Bear"). For malware, use the family name.',
      params: [
        {
          name: 'q',
          type: 'string',
          description: 'Search query — actor name, malware family, or keyword',
          required: true,
        },
      ],
      execute: (args) =>
        apiFetch(self, `/api/v1/malpedia/search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  CVE & VULNERABILITY INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'lookup_cve',
      description:
        'CVE lookup — CVSS score/vector, EPSS probability, CISA KEV status, affected products, references, known exploitation.',
      params: [{ name: 'cve_id', type: 'string', description: 'CVE ID (CVE-2024-3094)', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/cve/lookup?id=${encodeURIComponent(String(args.cve_id))}`, apiKey, undefined, ih),
    },
    {
      name: 'search_triage',
      description:
        'Recorded Future Triage sandbox search — malware samples by family, tag, hash, URL. Returns analysis, configs, C2.',
      params: [
        {
          name: 'q',
          type: 'string',
          description: 'Triage query (family:name, tag:ransomware, md5:...)',
          required: true,
        },
      ],
      execute: (args) =>
        apiFetch(self, `/api/v1/triage/search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'scan_dependencies',
      description:
        'Scan a dependency list for known vulnerabilities + malicious-package (MAL-) advisories via OSV.dev. ' +
        'Input is one or more "eco:name@ver" specs separated by newlines and/or commas (version optional), ' +
        'e.g. "npm:left-pad@1.3.0\\nPyPI:requests, npm:lodash". Returns OSV vuln IDs (CVE/GHSA/MAL-) per package, ' +
        'with summaries/severity/fixed version for up to 35 distinct advisories.',
      params: [
        {
          name: 'packages',
          type: 'string',
          description: 'Newline/comma-separated "eco:name@ver" specs (version optional), e.g. "npm:left-pad@1.3.0, PyPI:requests"',
          required: true,
        },
      ],
      execute: (args) => {
        // Parse "eco:name@ver" lines/commas → {packages:[{name,ecosystem,version?}]}
        // mirroring osvScanSchema EXACTLY (else validate('json') 400s the valid request).
        const packages = String(args.packages ?? '')
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((spec) => {
            const colon = spec.indexOf(':');
            if (colon < 1) return null; // need "eco:..."
            const ecosystem = spec.slice(0, colon).trim();
            const rest = spec.slice(colon + 1).trim();
            const at = rest.lastIndexOf('@');
            const name = (at > 0 ? rest.slice(0, at) : rest).trim();
            const version = at > 0 ? rest.slice(at + 1).trim() : '';
            if (!ecosystem || !name) return null;
            return version ? { name, ecosystem, version } : { name, ecosystem };
          })
          .filter((p): p is { name: string; ecosystem: string; version?: string } => p !== null)
          .slice(0, 250); // mirror osvScanSchema .max(250)
        if (packages.length === 0) {
          return Promise.reject(new Error('scan_dependencies: no valid "eco:name@ver" specs parsed from input'));
        }
        return apiFetch(
          self,
          '/api/v1/osv/scan',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ packages }),
          },
          ih
        );
      },
    },

    // ══════════════════════════════════════════════════════════════════════
    //  DOMAIN & HOST INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'lookup_domain',
      description: 'Full domain intel — DNS records, WHOIS/RDAP, CT logs, SPF/DKIM/DMARC, blocklist hits.',
      params: [{ name: 'domain', type: 'string', description: 'Domain name', required: true }],
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
      description: 'IP geolocation, ASN, company, VPN/proxy/tor detection.',
      params: [{ name: 'ip', type: 'string', description: 'IPv4 or IPv6', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/ip-geo?ip=${encodeURIComponent(String(args.ip))}`, apiKey, undefined, ih),
    },
    {
      name: 'lookup_builtwith',
      description:
        'Technology stack discovery — what technologies a domain uses (web servers, frameworks, analytics, hosting).',
      params: [{ name: 'domain', type: 'string', description: 'Domain name', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/builtwith?domain=${encodeURIComponent(String(args.domain))}`, apiKey, undefined, ih),
    },
    {
      name: 'lookup_certificate_transparency',
      description: 'Certificate Transparency log analysis — all SSL certificates issued for a domain or IP address.',
      params: [{ name: 'target', type: 'string', description: 'Domain or IP address', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/ct-log?target=${encodeURIComponent(String(args.target))}`, apiKey, undefined, ih),
    },
    {
      name: 'lookup_wayback_advanced',
      description:
        'Enhanced Wayback Machine archive search — historical snapshots with context, DNS records, and content analysis.',
      params: [
        { name: 'domain', type: 'string', description: 'Domain name', required: true },
        {
          name: 'date_range',
          type: 'string',
          description: 'Date range (e.g., 2020-01-01..2024-12-31)',
          required: false,
        },
        {
          name: 'filter',
          type: 'enum',
          description: 'Filter by content type',
          required: false,
          enum: ['html', 'js', 'css', 'all'],
        },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ domain: String(args.domain) });
        if (args.date_range) p.set('date_range', String(args.date_range));
        if (args.filter) p.set('filter', String(args.filter));
        return apiFetch(self, `/api/v1/wayback/advanced?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'urlscan_ip_search',
      description:
        'Search urlscan.io for all scans involving an IP address. Returns URLs, domains, screenshot, and threat classifications associated with the IP.',
      params: [{ name: 'ip', type: 'string', description: 'IPv4 address', required: true }],
      execute: (args) => {
        const enc = encodeURIComponent(String(args.ip));
        return apiFetch(self, `/api/v1/urlscan-ip?ip=${enc}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'lookup_asn',
      description: 'ASN intelligence — name, country, network ranges, RIR, BGP peers.',
      params: [{ name: 'asn', type: 'string', description: 'AS number (AS13335)', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/asn/lookup?asn=${encodeURIComponent(String(args.asn))}`, apiKey, undefined, ih),
    },
    {
      name: 'get_domain_history',
      description: 'WHOIS history — registration snapshots, ownership changes over time.',
      params: [{ name: 'domain', type: 'string', description: 'Domain', required: true }],
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
      description: 'Pivot by shared registrant email/org/nameservers/registrar — maps attacker infrastructure.',
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
    {
      name: 'search_registrant',
      description: 'Find all domains by registrant email or org — infrastructure mapping.',
      params: [
        { name: 'email', type: 'string', description: 'Registrant email', required: false },
        { name: 'org', type: 'string', description: 'Registrant org', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams();
        if (args.email) p.set('email', String(args.email));
        if (args.org) p.set('org', String(args.org));
        return apiFetch(self, `/api/v1/domain/history/search?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'get_domain_certs',
      description: 'CT log certificates for domain — new subdomains, cert details.',
      params: [
        { name: 'domain', type: 'string', description: 'Domain', required: true },
        { name: 'days', type: 'number', description: 'Look back days (30)', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ domain: String(args.domain) });
        if (args.days) p.set('days', String(args.days));
        return apiFetch(self, `/api/v1/ct-monitor/certs?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'scan_website',
      description: 'Website security scan — headers, SSL, technologies, vulnerabilities.',
      params: [{ name: 'url', type: 'string', description: 'URL to scan', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/web-scan?url=${encodeURIComponent(String(args.url))}`, apiKey, undefined, ih),
    },
    {
      name: 'wayback_lookup',
      description: 'Wayback Machine historical snapshots — track changes over time.',
      params: [{ name: 'url', type: 'string', description: 'URL to check', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/wayback/cdx?url=${encodeURIComponent(String(args.url))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  RANSOMWARE & BREACH INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'get_ransomware_activity',
      description: 'Recent ransomware victims, group activity, leak-site posts. Filtered by group if specified.',
      params: [{ name: 'group', type: 'string', description: 'Ransomware group name (optional)', required: false }],
      execute: (args) => {
        if (args.group)
          return apiFetch(
            self,
            `/api/v1/rl/victims-recent?group=${encodeURIComponent(String(args.group))}`,
            apiKey,
            undefined,
            ih
          );
        return apiFetch(self, '/api/v1/ransomware-recent', apiKey, undefined, ih);
      },
    },
    {
      name: 'get_ransomware_negotiations',
      description: 'Ransomware negotiation data — demands, discounts, settlement patterns.',
      params: [{ name: 'group', type: 'string', description: 'Ransomware group (optional)', required: false }],
      execute: (args) => {
        const p = args.group ? `?group=${encodeURIComponent(String(args.group))}` : '';
        return apiFetch(self, `/api/v1/negotiations${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'check_breach',
      description: 'Check if email/domain exposed in known breaches.',
      params: [
        { name: 'target', type: 'string', description: 'Email or domain', required: true },
        { name: 'type', type: 'enum', description: 'Target type', required: true, enum: ['email', 'domain'] },
      ],
      execute: (args) => {
        const t = args.type === 'email' || args.type === 'domain' ? args.type : 'email';
        return apiFetch(
          self,
          `/api/v1/breach/${t}?${t}=${encodeURIComponent(String(args.target))}`,
          apiKey,
          undefined,
          ih
        );
      },
    },
    {
      name: 'get_breach_disclosures',
      description: 'Recent breach disclosures — names, dates, data classes, affected records.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/breach-disclosures', apiKey, undefined, ih),
    },
    {
      name: 'get_supply_chain_attacks',
      description:
        'Software supply-chain compromise incidents (npm/PyPI/container/AI-agent ecosystems) from supplychainattack.org. Returns title, status, severity, ecosystems, attack vectors, blast radius, remediation, package IOCs, and GHSA sources. Filter by ecosystem/status/severity.',
      params: [
        { name: 'ecosystem', type: 'string', description: 'Ecosystem filter, e.g. npm/pypi (optional)', required: false },
        { name: 'status', type: 'string', description: 'Incident status: active/contained/resolved (optional)', required: false },
        { name: 'severity', type: 'string', description: 'Severity: critical/high/medium/low (optional)', required: false },
        { name: 'limit', type: 'number', description: 'Max incidents (optional)', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams();
        if (args.ecosystem) p.set('ecosystem', String(args.ecosystem));
        if (args.status) p.set('status', String(args.status));
        if (args.severity) p.set('severity', String(args.severity));
        if (args.limit) p.set('limit', String(args.limit));
        const qs = p.toString();
        return apiFetch(self, `/api/v1/supply-chain-attacks${qs ? `?${qs}` : ''}`, apiKey, undefined, ih);
      },
    },

    // ══════════════════════════════════════════════════════════════════════
    //  DETECTION RULES & HUNTING
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'generate_yara_rule',
      description:
        'AI-generate detection rules in YARA, Sigma, KQL, Splunk, Lucene, EQL, Snort/Suricata format. Include MITRE mapping.',
      params: [
        { name: 'description', type: 'string', description: 'What to detect', required: true },
        { name: 'family', type: 'string', description: 'Malware family name', required: false },
        { name: 'strings', type: 'string', description: 'Known malicious strings (comma-separated)', required: false },
        {
          name: 'format',
          type: 'enum',
          description: 'Rule format',
          required: false,
          enum: ['yara', 'sigma', 'kql', 'splunk', 'snort', 'suricata'],
        },
      ],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/rules/generate',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              description: String(args.description),
              type: args.format ? String(args.format) : 'yara',
              family: args.family ? String(args.family) : undefined,
              strings: args.strings
                ? String(args.strings)
                    .split(',')
                    .map((s) => s.trim())
                : undefined,
            }),
          },
          ih
        ),
    },
    {
      name: 'generate_hunting_queries',
      description: 'AI-generate SIEM hunting queries for threat hunting. Supports Splunk, KQL, Sigma, Elastic, YARA.',
      params: [
        { name: 'threat', type: 'string', description: 'Threat description to hunt for', required: true },
        {
          name: 'siem',
          type: 'enum',
          description: 'Target SIEM',
          required: false,
          enum: ['splunk', 'kql', 'sigma', 'elastic', 'yara'],
        },
      ],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/hunting-queries/generate',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ threat: String(args.threat), siem: args.siem ? String(args.siem) : 'splunk' }),
          },
          ih
        ),
    },
    {
      name: 'get_detections',
      description: 'Detection engine output — rules that fired against live IOC stream with severity.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/detections', apiKey, undefined, ih),
    },
    {
      name: 'get_yara_rules',
      description: 'Community YARA rules from YARAify/abuse.ch for a malware family.',
      params: [{ name: 'q', type: 'string', description: 'Malware family or keyword', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/yara-hub?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  MITRE ATT&CK & KILL CHAIN
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'lookup_mitre',
      description:
        'MITRE ATT&CK technique lookup by EXACT ID. Must be in format T1234 or T1234.001 (e.g. T1566, T1566.001). Do NOT use technique names — only IDs work.',
      params: [
        {
          name: 'technique_id',
          type: 'string',
          description: 'Exact technique ID (T1566 or T1566.001)',
          required: true,
        },
      ],
      execute: (args) => {
        const id = String(args.technique_id).trim();
        if (!/^T\d{4}(?:\.\d{3})?$/.test(id)) {
          return Promise.reject(new Error(`Invalid technique ID format: "${id}". Expected T1234 or T1234.001`));
        }
        const enc = encodeURIComponent(id);
        return apiFetch(self, `/api/v1/mitre/technique?id=${enc}&technique=${enc}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'reconstruct_attack_chain',
      description:
        'Map IOCs to MITRE ATT&CK kill chain — reconstruct attack progression, identify gaps, predict next moves.',
      params: [
        { name: 'indicators', type: 'string', description: 'Comma-separated IOCs', required: true },
        { name: 'actor', type: 'string', description: 'Known actor (optional)', required: false },
      ],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/attack-chain/reconstruct',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              indicators: String(args.indicators)
                .split(',')
                .map((s) => s.trim()),
              actor: args.actor ? String(args.actor) : undefined,
            }),
          },
          ih
        ),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  CAMPAIGN TRACKING
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'analyze_campaign',
      description: 'Campaign lifecycle analysis — phase detection, predictive modeling, kill chain mapping.',
      params: [
        { name: 'actor', type: 'string', description: 'Threat actor slug (apt28, lazarus-group)', required: true },
        { name: 'iocs', type: 'string', description: 'Known IOCs (comma-separated)', required: false },
      ],
      execute: (args) => {
        const indicators = args.iocs
          ? String(args.iocs)
              .split(',')
              .map((v) => {
                const val = v.trim();
                const type = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val)
                  ? 'ipv4'
                  : /^[a-fA-F0-9]{32,64}$/.test(val)
                    ? 'hash'
                    : /^https?:\/\//.test(val)
                      ? 'url'
                      : /\./.test(val)
                        ? 'domain'
                        : 'ipv4';
                return { value: val, type };
              })
          : [];
        return apiFetch(
          self,
          '/api/v1/threat-intel/campaign/analyze',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actor: String(args.actor), indicators }),
          },
          ih
        );
      },
    },
    {
      name: 'cross_campaign_correlate',
      description: 'Find connections between campaigns — shared infrastructure, tooling, TTPs.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/threat-intel/cross-campaign/correlations', apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  PHISHING INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'analyze_phishing_url',
      description: 'Analyze URL for phishing — PhishTank, OpenPhish, URLhaus checks, visual similarity.',
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
      name: 'analyze_phishing_email',
      description: 'Parse raw email for phishing — headers, SPF/DKIM/DMARC, URL extraction, risk score.',
      params: [{ name: 'raw_email', type: 'string', description: 'Full raw email source', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/phishing/analyze',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: String(args.raw_email),
          },
          ih
        ),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  MALWARE ANALYSIS
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'malware_family_detail',
      description: 'Malware family intelligence — IOCs, behavior, variants, YARA rules.',
      params: [{ name: 'family', type: 'string', description: 'Malware family name', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/malware-iocs/${encodeURIComponent(String(args.family))}`, apiKey, undefined, ih),
    },
    {
      name: 'sample_scan',
      description: 'Multi-provider hash fan-out — VirusTotal, MalwareBazaar, Triage, sandbox deep links.',
      params: [{ name: 'hash', type: 'string', description: 'File hash (MD5/SHA1/SHA256)', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/sample/scan?hash=${encodeURIComponent(String(args.hash))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  DARK WEB & CYBERCRIME
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'get_breach_forums',
      description: 'Breach forum monitoring — recent posts, actor claims, data leaks.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/breach-forums', apiKey, undefined, ih),
    },
    {
      name: 'search_telegram_leaks',
      description: 'Telegram leak channel search — leaked data, credentials, databases.',
      params: [{ name: 'q', type: 'string', description: 'Search query', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/telegram-leaks/search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  CRYPTO & FINANCIAL
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'trace_crypto_address',
      description: 'Cryptocurrency wallet tracing — balance, transactions, associated entities.',
      params: [
        { name: 'address', type: 'string', description: 'Wallet address', required: true },
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

    // ══════════════════════════════════════════════════════════════════════
    //  SEARCH & CORRELATION
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'unified_search',
      description:
        'Cross-source search across ALL feeds — briefings, IOCs, ransomware, detections, CVEs, writeups, cybercrime, malware.',
      params: [{ name: 'q', type: 'string', description: 'Search query', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/unified-search?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'cross_correlate',
      description: 'Cross-correlation engine — CVE→actor→sector→coverage. Surfaces actionable intel gaps.',
      params: [
        { name: 'query', type: 'string', description: 'Correlation query', required: true },
        {
          name: 'type',
          type: 'enum',
          description: 'Query type',
          required: false,
          enum: ['cve', 'actor', 'sector', 'campaign'],
        },
      ],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/threat-intel/correlate',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: String(args.query), type: args.type ?? 'auto' }),
          },
          ih
        ),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  STIX / STRUCTURED INTEL
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'build_stix_bundle',
      description:
        'Build STIX 2.1 bundle for an indicator, actor, or CVE. Produces structured threat intelligence objects with relationships.',
      params: [
        { name: 'indicator', type: 'string', description: 'IOC (IP, domain, hash, URL)', required: false },
        { name: 'actor', type: 'string', description: 'Threat actor name', required: false },
        { name: 'cve', type: 'string', description: 'CVE ID', required: false },
      ],
      execute: (args) => {
        const body: Record<string, unknown> = { include_relationships: true };
        if (args.indicator) body.indicator = String(args.indicator);
        if (args.actor) body.actor = String(args.actor);
        if (args.cve) body.cve = String(args.cve);
        return apiFetch(
          self,
          '/api/v1/intel-bundle/build',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
          ih
        );
      },
    },
    {
      name: 'parse_threat_report',
      description:
        'Parse threat report to extract IOCs, actors, malware, MITRE techniques, CVEs. Supports text input or URL (max 100K chars for URL content).',
      params: [
        { name: 'text', type: 'string', description: 'Report text (max 100K chars)', required: false },
        { name: 'url', type: 'string', description: 'Report URL (content must be under 100K chars)', required: false },
      ],
      execute: (args) => {
        if (!args.text && !args.url) return Promise.reject(new Error('text or url required'));
        // Truncate text if too long
        let text = args.text ? String(args.text) : undefined;
        if (text && text.length > 95000) text = text.slice(0, 95000) + '\n[truncated]';
        return apiFetch(
          self,
          '/api/v1/report/parse',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, url: args.url }),
          },
          ih
        ).catch((err) => {
          // If URL content was too long, return a helpful error
          if (String(err).includes('too long')) {
            return {
              error: 'Report content exceeds 100K limit. Try with a shorter URL or paste relevant sections as text.',
            };
          }
          throw err;
        });
      },
    },

    // ══════════════════════════════════════════════════════════════════════
    //  THREAT LANDSCAPE & PREDICTIVE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'get_threat_pulse',
      description:
        'Global threat overview — top actors, trending malware, most exploited CVEs, geopolitical events (past week).',
      params: [],
      execute: () => apiFetch(self, '/api/v1/threat-pulse', apiKey, undefined, ih),
    },
    {
      name: 'get_ransomware_map',
      description: 'Ransomware geographic map — victims by country and sector.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/ransomware-map', apiKey, undefined, ih),
    },
    {
      name: 'get_c2_tracker',
      description: 'C2 server tracker — active C2 infrastructure with framework identification.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/c2-tracker', apiKey, undefined, ih),
    },
    {
      name: 'get_predictive_forecasts',
      description: 'Threat forecasting — predicted emerging threats based on historical patterns.',
      params: [],
      execute: () => apiFetch(self, '/api/v1/threat-intel/predictive/forecasts', apiKey, undefined, ih),
    },

    {
      name: 'webamon_search',
      description:
        'Search Webamon domain index — Lucene queries across 750M+ scanned domains. Use for domain risk assessment, infrastructure discovery, geo netblock lookups, or finding related malicious infrastructure. Supports queries like risk_score:>5, domain.name:example.com, fingerprint.tech:*wordpress, tag:nrd_*',
      params: [
        { name: 'query', type: 'string', description: 'Lucene search query', required: true },
        { name: 'size', type: 'number', description: 'Results per page (max 100)', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams({ search: String(args.query) });
        if (args.size) p.set('size', String(args.size));
        p.set(
          'results',
          'domain.name,page_title,meta.risk_score,fingerprint.tech,fingerprint.asn,resolved_url,tag,sub_domain'
        );
        return apiFetch(self, `/api/v1/webamon/search?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'webamon_scan',
      description:
        'Submit a URL or domain to Webamon sandbox for live analysis — headers, certs, technologies, scripts, cookies, resources.',
      params: [{ name: 'url', type: 'string', description: 'URL or domain to scan', required: true }],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/webamon/scan',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ submission_url: String(args.url) }),
          },
          ih
        ),
    },
    {
      name: 'webamon_report',
      description:
        'Get a published Webamon scan report by ID — certificates, servers, cookies, technologies, resources, scripts.',
      params: [{ name: 'report_id', type: 'string', description: 'Webamon report ID', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/webamon/report/${encodeURIComponent(String(args.report_id))}`, apiKey, undefined, ih),
    },
    {
      name: 'webamon_domain',
      description: 'Lookup full domain infrastructure from Webamon — DNS, CT logs, ASN, risk score, tech stack.',
      params: [{ name: 'domain', type: 'string', description: 'Domain name', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/webamon/domain/${encodeURIComponent(String(args.domain))}`, apiKey, undefined, ih),
    },
    {
      name: 'webamon_server',
      description: 'Lookup server intelligence from Webamon — IP, ASN, country, open ports, running services.',
      params: [{ name: 'ip', type: 'string', description: 'IP address', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/webamon/server/${encodeURIComponent(String(args.ip))}`, apiKey, undefined, ih),
    },
    {
      name: 'webamon_resource',
      description: 'Lookup file/resource intelligence from Webamon by SHA256 hash — MIME type, size, observed URLs.',
      params: [{ name: 'sha256', type: 'string', description: 'SHA256 hash', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/webamon/resource/${encodeURIComponent(String(args.sha256))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  EXPLOIT-DB & SECURITY UPDATES (NEW)
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'lookup_exploit_db',
      description:
        'Search Exploit-DB and related sources for exploits by CVE ID or keyword. Returns exploit references, platforms, and descriptions.',
      params: [{ name: 'q', type: 'string', description: 'CVE ID or search keyword', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/exploit-db?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },
    {
      name: 'lookup_cisa_kev',
      description:
        'CISA Known Exploited Vulnerabilities lookup. Filter by CVE, vendor, product, or days. Returns vulnerability details, due dates, and ransomware use flags.',
      params: [
        { name: 'q', type: 'string', description: 'CVE ID, vendor, or product keyword', required: false },
        { name: 'cve', type: 'string', description: 'Specific CVE ID', required: false },
        { name: 'vendor', type: 'string', description: 'Vendor name filter', required: false },
        { name: 'product', type: 'string', description: 'Product name filter', required: false },
        { name: 'days', type: 'number', description: 'Look back N days', required: false },
        {
          name: 'ransomware_only',
          type: 'boolean',
          description: 'Only vulnerabilities tied to ransomware',
          required: false,
        },
      ],
      execute: (args) => {
        const p = new URLSearchParams();
        if (args.q) p.set('q', String(args.q));
        if (args.cve) p.set('cve', String(args.cve));
        if (args.vendor) p.set('vendor', String(args.vendor));
        if (args.product) p.set('product', String(args.product));
        if (args.days) p.set('days', String(args.days));
        if (args.ransomware_only) p.set('ransomware_only', 'true');
        return apiFetch(self, `/api/v1/cisa-kev?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'lookup_security_updates',
      description:
        'Search vendor security advisories and CISA KEV for updates. Query by vendor, product, or keyword. Returns recent security patches and vulnerabilities.',
      params: [
        { name: 'q', type: 'string', description: 'Search keyword', required: false },
        { name: 'vendor', type: 'string', description: 'Vendor name', required: false },
        { name: 'product', type: 'string', description: 'Product name', required: false },
      ],
      execute: (args) => {
        const p = new URLSearchParams();
        if (args.q) p.set('q', String(args.q));
        if (args.vendor) p.set('vendor', String(args.vendor));
        if (args.product) p.set('product', String(args.product));
        return apiFetch(self, `/api/v1/security-updates?${p}`, apiKey, undefined, ih);
      },
    },
    {
      name: 'passive_dns_lookup',
      description:
        'Passive DNS history lookup — subdomains, historical IPs, first/last seen timestamps. Uses crt.sh and optional SecurityTrails for historical DNS data.',
      params: [{ name: 'q', type: 'string', description: 'Domain or IP address', required: true }],
      execute: (args) =>
        apiFetch(self, `/api/v1/passive-dns?q=${encodeURIComponent(String(args.q))}`, apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  BLOCKLISTS & DEFENSIVE OUTPUT
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'get_blocklists',
      description: 'Blocklist metadata — IP counts, generation time, available formats (pfSense, iptables, Suricata).',
      params: [],
      execute: () => apiFetch(self, '/api/v1/blocklists/meta', apiKey, undefined, ih),
    },

    // ══════════════════════════════════════════════════════════════════════
    //  IR & RESPONSE
    // ══════════════════════════════════════════════════════════════════════
    {
      name: 'generate_ir_playbook',
      description: 'AI-generate incident response playbook — steps, tools, timeline, criticality.',
      params: [
        {
          name: 'scenario',
          type: 'string',
          description: 'Incident type (ransomware, phishing, data breach, etc.)',
          required: true,
        },
        { name: 'actor', type: 'string', description: 'Known threat actor (optional)', required: false },
      ],
      execute: (args) =>
        apiFetch(
          self,
          '/api/v1/ir-playbooks/generate',
          apiKey,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scenario: String(args.scenario), actor: args.actor }),
          },
          ih
        ),
    },
  ];
}

export function summarizeToolResult(tool: string, result: unknown, maxLen = 2000): string {
  const json = JSON.stringify(result, null, 2);
  if (json.length <= maxLen) return json;
  return json.slice(0, maxLen) + `\n... [truncated, ${json.length} chars total]`;
}

export function describeTools(tools: AgentTool[]): string {
  return tools
    .map(
      (t) =>
        `- **${t.name}**: ${t.description}\n  Params: ${t.params.length === 0 ? '(none)' : t.params.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}${p.enum ? ` [${p.enum.join('|')}]` : ''}`).join(', ')}`
    )
    .join('\n');
}
