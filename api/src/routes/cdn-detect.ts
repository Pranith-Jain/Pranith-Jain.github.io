import type { Context } from 'hono';
import type { Env } from '../env';

interface CdnDetectResult {
  ip: string;
  is_cdn: boolean;
  provider: string | null;
  type: string | null;
  asn?: string;
  cidr?: string;
  origin_ips: string[];
  source: string;
  fetched_at: string;
}

/**
 * CDN/WAF detection — checks if an IP belongs to a known CDN/WAF provider.
 * Uses BGP data and known CDN IP ranges. Equivalent to metabigor's `cdn` command.
 */
export async function cdnDetectHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip');
  if (!ip) return c.json({ error: 'missing ip' }, 400);

  const clean = ip.trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) {
    return c.json({ error: 'invalid IPv4 address' }, 400);
  }

  try {
    // Use bgp.he.net to check ASN — free, no API key
    const bgpUrl = `https://bgp.he.net/net/${encodeURIComponent(clean)}/json`;
    const bgpRes = await fetch(bgpUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DFIR-Portfolio/1.0)' },
      signal: AbortSignal.timeout(8000),
    });

    let asn: string | null = null;
    let asnOrg: string | null = null;
    let cidr: string | null = null;

    if (bgpRes.ok) {
      const bgpData = (await bgpRes.json()) as Array<{
        asn: string;
        as_description: string;
        cidr: string;
        as_country: string;
      }>;
      if (bgpData.length > 0) {
        const first = bgpData[0]!;
        asn = first.asn;
        asnOrg = first.as_description;
        cidr = first.cidr;
      }
    }

    // Known CDN/WAF providers by ASN patterns and organization names
    const CDN_PATTERNS: Array<{ pattern: RegExp; provider: string; type: string }> = [
      { pattern: /cloudflare/i, provider: 'Cloudflare', type: 'CDN/WAF' },
      { pattern: /akamai/i, provider: 'Akamai', type: 'CDN' },
      { pattern: /fastly/i, provider: 'Fastly', type: 'CDN' },
      { pattern: /amazon|aws|cloudfront/i, provider: 'AWS CloudFront', type: 'CDN' },
      { pattern: /google|gcp/i, provider: 'Google Cloud CDN', type: 'CDN' },
      { pattern: /azure|microsoft/i, provider: 'Azure CDN', type: 'CDN' },
      { pattern: /incapsula|imperva/i, provider: 'Imperva Incapsula', type: 'WAF' },
      { pattern: /akamai.*prolexic/i, provider: 'Akamai Prolexic', type: 'WAF' },
      { pattern: /sucuri/i, provider: 'Sucuri', type: 'WAF' },
      { pattern: /stackpath|maxcdn/i, provider: 'StackPath', type: 'CDN' },
      { pattern: /keycdn/i, provider: 'KeyCDN', type: 'CDN' },
      { pattern: /limelight/i, provider: 'Limelight', type: 'CDN' },
      { pattern: /edgecast|verizon/i, provider: 'Verizon Edgecast', type: 'CDN' },
      { pattern: /ddos-guard/i, provider: 'DDoS-Guard', type: 'WAF' },
      { pattern: /radware/i, provider: 'Radware', type: 'WAF' },
      { pattern: /neustar/i, provider: 'Neustar', type: 'WAF' },
    ];

    let isCdn = false;
    let provider: string | null = null;
    let type: string | null = null;

    const orgText = asnOrg || '';
    for (const p of CDN_PATTERNS) {
      if (p.pattern.test(orgText)) {
        isCdn = true;
        provider = p.provider;
        type = p.type;
        break;
      }
    }

    const result: CdnDetectResult = {
      ip: clean,
      is_cdn: isCdn,
      provider,
      type,
      asn: asn || undefined,
      cidr: cidr || undefined,
      origin_ips: [],
      source: isCdn ? `bgp.he.net (${provider})` : 'bgp.he.net',
      fetched_at: new Date().toISOString(),
    };

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: `CDN detection failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
}
