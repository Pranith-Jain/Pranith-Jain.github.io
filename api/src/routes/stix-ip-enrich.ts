/**
 * STIX IP Enrichment — enrich an IP and return a STIX 2.1 bundle.
 *
 *   GET  /api/v1/si/enrich-ip-stix?ip=...&tlp=GREEN
 *   POST /api/v1/si/enrich-ip-stix-batch  { ips: string[], tlp?: string }
 *
 * Calls the existing enrichment endpoints through the Worker service
 * binding and wraps the results in STIX 2.1 indicator, vulnerability,
 * and relationship objects.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

const INTERNAL = 'https://self.internal';

async function selfFetch(self: Fetcher | undefined, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = self
      ? await self.fetch(`${INTERNAL}${path}`, { headers: { accept: 'application/json' } })
      : await fetch(`${INTERNAL}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stixId(type: string, value: string): string {
  const enc = new TextEncoder();
  const data = enc.encode(`${type}:${value}`);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + (data[i] ?? 0)) | 0;
  }
  return `${type}--${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

const TLP_IDS: Record<string, string> = {
  WHITE: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  GREEN: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
  AMBER: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
  RED: 'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
};

function buildStixBundle(ip: string, enrichment: Record<string, unknown>, tlp: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const objects: Array<Record<string, unknown>> = [];
  const markingId = TLP_IDS[tlp] ?? TLP_IDS.GREEN;

  // Identity
  const identityId = stixId('identity', 'dfir-platform');
  objects.push({
    type: 'identity',
    spec_version: '2.1',
    id: identityId,
    created: now,
    modified: now,
    name: 'DFIR Platform',
    identity_class: 'organization',
  });

  // TLP marking
  objects.push({
    type: 'marking-definition',
    spec_version: '2.1',
    id: markingId,
    created: now,
    definition_type: 'tlp',
    definition: { tlp },
  });

  // IP indicator
  const isV6 = ip.includes(':');
  const ipType = isV6 ? 'ipv6-addr' : 'ipv4-addr';
  const indicatorId = stixId('indicator', ip);
  const confidence = computeConfidence(enrichment);
  const tags = buildTags(enrichment);
  const description = buildDescription(enrichment, ip);

  objects.push({
    type: 'indicator',
    spec_version: '2.1',
    id: indicatorId,
    created: now,
    modified: now,
    name: `IP: ${ip}`,
    description,
    pattern: `[${ipType}:value = '${ip}']`,
    pattern_type: 'stix',
    valid_from: now,
    created_by_ref: identityId,
    object_marking_refs: [markingId],
    confidence,
    labels: tags,
  });

  // ASN indicator
  const asn = enrichment.asn as string | undefined;
  const org = enrichment.org as string | undefined;
  if (asn) {
    const asnId = stixId('indicator', asn);
    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id: asnId,
      created: now,
      modified: now,
      name: `ASN: ${asn} (${org ?? 'unknown'})`,
      pattern: `[autonomous-system:number = ${asn.replace(/^AS/i, '')}]`,
      pattern_type: 'stix',
      valid_from: now,
      created_by_ref: identityId,
      object_marking_refs: [markingId],
      confidence,
      labels: ['asn', 'infrastructure'],
    });
  }

  // Shodan vulnerabilities → STIX vulnerability objects
  const vulns = (enrichment.shodan_vulns as string[] | undefined) ?? [];
  for (const cve of vulns.slice(0, 20)) {
    const vulnId = stixId('vulnerability', cve.toLowerCase());
    objects.push({
      type: 'vulnerability',
      spec_version: '2.1',
      id: vulnId,
      created: now,
      modified: now,
      name: cve,
      description: `${cve} detected on ${ip} via Shodan`,
    });
    objects.push({
      type: 'relationship',
      spec_version: '2.1',
      id: stixId('relationship', `${ip}-${cve}`),
      created: now,
      modified: now,
      relationship_type: 'indicates',
      source_ref: indicatorId,
      target_ref: vulnId,
    });
  }

  return {
    type: 'bundle',
    id: stixId('bundle', `ip-enrich-${ip}-${Date.now()}`),
    spec_version: '2.1',
    created: now,
    objects,
  };
}

function computeConfidence(r: Record<string, unknown>): number {
  let score = 50;
  if (r.org) score += 10;
  if (r.country) score += 5;
  if (r.is_vpn) score += 10;
  if (r.abuse_confidence_score && (r.abuse_confidence_score as number) > 50) score += 15;
  if (r.threat_detected) score += 10;
  const vulns = r.shodan_vulns as string[] | undefined;
  if (vulns?.length) score += 10;
  return Math.min(score, 100);
}

function buildTags(r: Record<string, unknown>): string[] {
  const tags: string[] = ['ip', 'enriched'];
  if (r.is_vpn) tags.push('vpn');
  if (r.threat_detected) tags.push('threat-detected');
  if (r.abuse_confidence_score && (r.abuse_confidence_score as number) > 50) tags.push('abusive');
  const shodanTags = r.shodan_tags as string[] | undefined;
  if (shodanTags) tags.push(...shodanTags.slice(0, 5));
  if (r.country) tags.push(`geo:${r.country}`);
  if (r.asn) tags.push(r.asn as string);
  return tags;
}

function buildDescription(r: Record<string, unknown>, ip: string): string {
  const parts: string[] = [];
  if (r.org) parts.push(`Org: ${r.org}`);
  if (r.city && r.country) parts.push(`Location: ${r.city}, ${r.country}`);
  else if (r.country) parts.push(`Country: ${r.country}`);
  if (r.is_vpn) parts.push(`VPN: ${r.vpn_network ?? 'yes'}`);
  if (r.abuse_confidence_score != null) parts.push(`Abuse confidence: ${r.abuse_confidence_score}%`);
  const ports = r.shodan_ports as number[] | undefined;
  if (ports?.length) parts.push(`Open ports: ${ports.join(', ')}`);
  const vulns = r.shodan_vulns as string[] | undefined;
  if (vulns?.length) parts.push(`Vulns: ${vulns.slice(0, 5).join(', ')}`);
  return parts.join(' | ') || `Enriched IP: ${ip}`;
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function isValidIp(ip: string): boolean {
  if (!ip) return false;
  if (IPV4_RE.test(ip)) return ip.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255);
  if (ip.includes(':') && IPV6_RE.test(ip)) return true;
  return false;
}

/** GET /api/v1/si/enrich-ip-stix?ip=...&tlp=GREEN */
export async function stixIpEnrichHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  const tlp = (c.req.query('tlp')?.trim().toUpperCase() ?? 'GREEN') as string;

  if (!ip || !isValidIp(ip)) {
    return c.json({ error: 'invalid_ip', hint: 'Pass a valid IPv4 or IPv6 address.' }, 400);
  }

  const self = (c.env as Env).SELF;

  // Call existing enrichment endpoints in parallel
  const [ipinfo, abuse, shodan, internetdb, vpnapi] = await Promise.all([
    selfFetch(self, `/api/v1/host?ip=${encodeURIComponent(ip)}`),
    selfFetch(self, `/api/v1/abuseipdb/${encodeURIComponent(ip)}`),
    selfFetch(self, `/api/v1/shodan/host/${encodeURIComponent(ip)}`),
    selfFetch(self, `/api/v1/shodan-internetdb/${encodeURIComponent(ip)}`),
    selfFetch(self, `/api/v1/vpnapi/${encodeURIComponent(ip)}`),
  ]);

  // Merge enrichment data
  const enrichment: Record<string, unknown> = { ip, diagnostics: [] };

  if (ipinfo) {
    enrichment.org = ipinfo.org ?? ipinfo.asn;
    enrichment.city = ipinfo.city;
    enrichment.region = ipinfo.region;
    enrichment.country = ipinfo.country;
    const orgMatch = (ipinfo.org as string | undefined)?.match(/^(AS\d+)\s+(.+)$/);
    if (orgMatch) {
      enrichment.asn = orgMatch[1];
      enrichment.org = orgMatch[2];
    }
  }

  if (abuse) {
    const data = (abuse.data as Record<string, unknown>) ?? abuse;
    enrichment.abuse_confidence_score = data.abuseConfidenceScore ?? data.confidence;
    enrichment.total_reports = data.totalReports ?? data.reports;
    enrichment.isp = data.isp;
    enrichment.usage_type = data.usageType;
  }

  if (shodan) {
    enrichment.shodan_ports = shodan.ports;
    enrichment.shodan_tags = shodan.tags;
    enrichment.shodan_vulns = shodan.vulns;
    enrichment.shodan_hostnames = shodan.hostnames;
  } else if (internetdb) {
    enrichment.shodan_ports = internetdb.ports;
    enrichment.shodan_tags = internetdb.tags;
    enrichment.shodan_vulns = internetdb.vulns;
    enrichment.shodan_hostnames = internetdb.hostnames;
  }

  if (vpnapi) {
    const security = (vpnapi.security as Record<string, unknown>) ?? vpnapi;
    enrichment.is_vpn = Boolean(security.vpn) || Boolean(security.proxy) || Boolean(security.tor);
    enrichment.vpn_network = security.network ?? security.operator;
  }

  const bundle = buildStixBundle(ip, enrichment, tlp);

  return c.json({
    enrichment,
    stix_bundle: bundle,
    stix_object_count: bundle.objects?.length ?? 0,
  });
}

/** POST /api/v1/si/enrich-ip-stix-batch  { ips: string[], tlp?: string } */
export async function stixIpEnrichBatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { ips?: unknown; tlp?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', hint: 'Request body must be JSON with { ips: string[] }.' }, 400);
  }

  if (!Array.isArray(body.ips) || body.ips.length === 0 || body.ips.length > 10) {
    return c.json({ error: 'invalid_ips', hint: 'Pass 1-10 IP addresses in the ips array.' }, 400);
  }

  const tlp = (typeof body.tlp === 'string' ? body.tlp.toUpperCase() : 'GREEN') as string;
  const self = (c.env as Env).SELF;

  // Enrich all IPs in parallel
  const results = await Promise.all(
    (body.ips as string[]).map(async (ip) => {
      if (!isValidIp(ip)) return { ip, error: 'invalid_ip', enrichment: null };

      const [ipinfo, abuse, shodan, internetdb, vpnapi] = await Promise.all([
        selfFetch(self, `/api/v1/host?ip=${encodeURIComponent(ip)}`),
        selfFetch(self, `/api/v1/abuseipdb/${encodeURIComponent(ip)}`),
        selfFetch(self, `/api/v1/shodan/host/${encodeURIComponent(ip)}`),
        selfFetch(self, `/api/v1/shodan-internetdb/${encodeURIComponent(ip)}`),
        selfFetch(self, `/api/v1/vpnapi/${encodeURIComponent(ip)}`),
      ]);

      const enrichment: Record<string, unknown> = { ip, diagnostics: [] };

      if (ipinfo) {
        enrichment.org = ipinfo.org ?? ipinfo.asn;
        enrichment.city = ipinfo.city;
        enrichment.country = ipinfo.country;
        const orgMatch = (ipinfo.org as string | undefined)?.match(/^(AS\d+)\s+(.+)$/);
        if (orgMatch) {
          enrichment.asn = orgMatch[1];
          enrichment.org = orgMatch[2];
        }
      }
      if (abuse) {
        const data = (abuse.data as Record<string, unknown>) ?? abuse;
        enrichment.abuse_confidence_score = data.abuseConfidenceScore ?? data.confidence;
        enrichment.isp = data.isp;
      }
      if (shodan) {
        enrichment.shodan_ports = shodan.ports;
        enrichment.shodan_tags = shodan.tags;
        enrichment.shodan_vulns = shodan.vulns;
      } else if (internetdb) {
        enrichment.shodan_ports = internetdb.ports;
        enrichment.shodan_tags = internetdb.tags;
        enrichment.shodan_vulns = internetdb.vulns;
      }
      if (vpnapi) {
        const security = (vpnapi.security as Record<string, unknown>) ?? vpnapi;
        enrichment.is_vpn = Boolean(security.vpn) || Boolean(security.proxy) || Boolean(security.tor);
        enrichment.vpn_network = security.network ?? security.operator;
      }

      return { ip, enrichment };
    })
  );

  // Merge into a single STIX bundle
  const now = new Date().toISOString();
  const objects: Array<Record<string, unknown>> = [];
  const markingId = TLP_IDS[tlp] ?? TLP_IDS.GREEN;
  const identityId = stixId('identity', 'dfir-platform');

  objects.push({
    type: 'identity',
    spec_version: '2.1',
    id: identityId,
    created: now,
    modified: now,
    name: 'DFIR Platform',
    identity_class: 'organization',
  });
  objects.push({
    type: 'marking-definition',
    spec_version: '2.1',
    id: markingId,
    created: now,
    definition_type: 'tlp',
    definition: { tlp },
  });

  for (const r of results) {
    if (!r.enrichment) continue;
    const ip = r.ip;
    const isV6 = ip.includes(':');
    const ipType = isV6 ? 'ipv6-addr' : 'ipv4-addr';
    const indicatorId = stixId('indicator', ip);
    const conf = computeConfidence(r.enrichment);
    const tags = buildTags(r.enrichment);

    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id: indicatorId,
      created: now,
      modified: now,
      name: `IP: ${ip}`,
      description: buildDescription(r.enrichment, ip),
      pattern: `[${ipType}:value = '${ip}']`,
      pattern_type: 'stix',
      valid_from: now,
      created_by_ref: identityId,
      object_marking_refs: [markingId],
      confidence,
      labels: tags,
    });

    if (r.enrichment.asn) {
      objects.push({
        type: 'indicator',
        spec_version: '2.1',
        id: stixId('indicator', r.enrichment.asn as string),
        created: now,
        modified: now,
        name: `ASN: ${r.enrichment.asn}`,
        pattern: `[autonomous-system:number = ${(r.enrichment.asn as string).replace(/^AS/i, '')}]`,
        pattern_type: 'stix',
        valid_from: now,
        created_by_ref: identityId,
        object_marking_refs: [markingId],
        confidence: conf,
        labels: ['asn'],
      });
    }

    const vulns = (r.enrichment.shodan_vulns as string[] | undefined) ?? [];
    for (const cve of vulns.slice(0, 10)) {
      const vulnId = stixId('vulnerability', cve.toLowerCase());
      objects.push({
        type: 'vulnerability',
        spec_version: '2.1',
        id: vulnId,
        created: now,
        modified: now,
        name: cve,
        description: `${cve} detected on ${ip} via Shodan`,
      });
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: stixId('relationship', `${ip}-${cve}`),
        created: now,
        modified: now,
        relationship_type: 'indicates',
        source_ref: indicatorId,
        target_ref: vulnId,
      });
    }
  }

  return c.json({
    enrichments: results.map((r) => r.enrichment).filter(Boolean),
    invalid_ips: results.filter((r) => !r.enrichment).map((r) => r.ip),
    stix_bundle: {
      type: 'bundle',
      id: stixId('bundle', `batch-${Date.now()}`),
      spec_version: '2.1',
      created: now,
      objects,
    },
    stix_object_count: objects.length,
  });
}
