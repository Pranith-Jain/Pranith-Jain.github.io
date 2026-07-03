/**
 * Pre-defined investigation tool chains — deterministic multi-step workflows
 * that chain existing API tools in a specific order. Unlike the autonomous
 * agent (which uses LLM to decide each step), tool chains are fixed sequences
 * optimized for common investigation patterns.
 *
 * Inspired by CyberSentinel AI's agentic tool orchestration.
 */

export interface ToolChainStep {
  id: string;
  name: string;
  description: string;
  apiPath: string;
  method: 'GET' | 'POST';
  buildParams: (context: Record<string, unknown>) => Record<string, unknown>;
  extractKey?: (result: unknown) => Record<string, unknown>;
}

export interface ToolChain {
  id: string;
  name: string;
  description: string;
  category: 'recon' | 'enrichment' | 'hunting' | 'compliance';
  inputType: 'ip' | 'domain' | 'hash' | 'url' | 'email';
  steps: ToolChainStep[];
}

function extractFirst(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'string' && v) return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  }
  return undefined;
}

function extractArray(obj: unknown, key: string): unknown[] {
  if (!obj || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;
  const v = o[key];
  return Array.isArray(v) ? v : [];
}

export const TOOL_CHAINS: ToolChain[] = [
  {
    id: 'ip-deep-dive',
    name: 'IP Deep Dive',
    description: 'Full investigation of an IP: DNS → ASN → enrich → passive DNS → exposure scan',
    category: 'recon',
    inputType: 'ip',
    steps: [
      {
        id: 'dns_lookup',
        name: 'DNS Lookup',
        description: 'Resolve hostname and detect CDN/ASN',
        apiPath: '/api/v1/dns/lookup',
        method: 'GET',
        buildParams: (ctx) => ({ hostname: ctx.indicator }),
        extractKey: (r) => {
          const records = (r as Record<string, unknown>)?.records as Record<string, unknown> | undefined;
          const aRecords = (records?.A ?? []) as Array<{ data: string }>;
          return { ips: aRecords.map((a) => a.data), asn: (r as Record<string, unknown>)?.asn };
        },
      },
      {
        id: 'enrich',
        name: 'IOC Enrichment',
        description: 'Threat intelligence from multiple providers',
        apiPath: '/api/v1/ioc/check',
        method: 'GET',
        buildParams: (ctx) => ({ indicator: ctx.indicator, type: 'ipv4' }),
        extractKey: (r) => ({ risk_score: (r as Record<string, unknown>)?.risk_score, tags: extractArray(r, 'tags') }),
      },
      {
        id: 'host_intel',
        name: 'Host Intelligence',
        description: 'Open ports, services, and exposures',
        apiPath: '/api/v1/host',
        method: 'GET',
        buildParams: (ctx) => ({ ip: ctx.indicator }),
      },
    ],
  },
  {
    id: 'domain-recon',
    name: 'Domain Reconnaissance',
    description: 'Comprehensive domain analysis: DNS → WHOIS → certificate transparency → subdomains',
    category: 'recon',
    inputType: 'domain',
    steps: [
      {
        id: 'dns',
        name: 'DNS Lookup',
        description: 'All DNS records with CDN/ASN detection',
        apiPath: '/api/v1/dns/lookup',
        method: 'GET',
        buildParams: (ctx) => ({ hostname: ctx.indicator }),
        extractKey: (r) => {
          const records = (r as Record<string, unknown>)?.records as Record<string, unknown> | undefined;
          const aRecords = records?.A as Array<{ data: string }> | undefined;
          return { ips: aRecords?.map((a) => a.data) ?? [] };
        },
      },
      {
        id: 'domain_lookup',
        name: 'Domain Intelligence',
        description: 'WHOIS, registration, and infrastructure details',
        apiPath: '/api/v1/domain/lookup',
        method: 'GET',
        buildParams: (ctx) => ({ domain: ctx.indicator }),
      },
      {
        id: 'cert_transparency',
        name: 'Certificate Transparency',
        description: 'Discover subdomains from CT logs',
        apiPath: '/api/v1/certspotter/search',
        method: 'GET',
        buildParams: (ctx) => ({ q: ctx.indicator }),
        extractKey: (r) => ({
          subdomains: extractArray(r, 'results').map((s: unknown) => (s as Record<string, unknown>)?.name ?? ''),
        }),
      },
    ],
  },
  {
    id: 'hash-investigate',
    name: 'Hash Investigation',
    description: 'Malware hash analysis: triage → AV engines → behavioral IOCs',
    category: 'enrichment',
    inputType: 'hash',
    steps: [
      {
        id: 'triage',
        name: 'Triage Search',
        description: 'Search malware sandbox reports',
        apiPath: '/api/v1/triage/search',
        method: 'GET',
        buildParams: (ctx) => ({ q: ctx.indicator }),
      },
      {
        id: 'ioc_enrich',
        name: 'IOC Enrichment',
        description: 'Multi-provider threat intel lookup',
        apiPath: '/api/v1/ioc/check',
        method: 'GET',
        buildParams: (ctx) => ({ indicator: ctx.indicator, type: 'hash' }),
        extractKey: (r) => ({ risk_score: (r as Record<string, unknown>)?.risk_score }),
      },
    ],
  },
  {
    id: 'cve-deep',
    name: 'CVE Deep Analysis',
    description: 'Full CVE investigation: NVD data → KEV check → exploit availability → affected products',
    category: 'hunting',
    inputType: 'hash',
    steps: [
      {
        id: 'cve_check',
        name: 'CVE Lookup',
        description: 'NVD and CISA KEV data',
        apiPath: '/api/v1/cve/lookup',
        method: 'GET',
        buildParams: (ctx) => ({ id: ctx.indicator }),
      },
      {
        id: 'actor_mapping',
        name: 'Actor Mapping',
        description: 'Which threat actors exploit this CVE',
        apiPath: '/api/v1/cve/actor-mapping',
        method: 'GET',
        buildParams: (ctx) => ({ cve: ctx.indicator }),
      },
    ],
  },
  {
    id: 'email-osint',
    name: 'Email OSINT',
    description: 'Email investigation: validation → breach check → domain intel → social profiles',
    category: 'recon',
    inputType: 'email',
    steps: [
      {
        id: 'validate',
        name: 'Email Validation',
        description: 'Syntax, MX, and deliverability check',
        apiPath: '/api/v1/breach/email-verify',
        method: 'GET',
        buildParams: (ctx) => ({ email: ctx.indicator }),
        extractKey: (r) => ({ domain: extractFirst(r, 'domain'), mx_valid: (r as Record<string, unknown>)?.mx_valid }),
      },
      {
        id: 'breach_check',
        name: 'Breach Check',
        description: 'Check if email appears in known breaches',
        apiPath: '/api/v1/breach/email',
        method: 'GET',
        buildParams: (ctx) => ({ email: ctx.indicator }),
      },
    ],
  },
];

export function getToolChain(id: string): ToolChain | undefined {
  return TOOL_CHAINS.find((c) => c.id === id);
}

export function getToolChainsForInput(type: string): ToolChain[] {
  return TOOL_CHAINS.filter((c) => c.inputType === type);
}

export function listToolChains(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  inputType: string;
}> {
  return TOOL_CHAINS.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    category: c.category,
    inputType: c.inputType,
  }));
}
