export interface IpWhoIsResponse {
  ip?: string;
  success?: boolean;
  message?: string;
  type?: 'IPv4' | 'IPv6';
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string; utc?: string };
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
}

export interface IpGeoResponse {
  ip: string;
  detected_kind: 'ipv4' | 'ipv6';
  geo: {
    ok: boolean;
    error?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    zip?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    isp?: string;
    org?: string;
    asn?: string;
    asname?: string;
    reverse_dns?: string;
    is_proxy?: boolean;
    is_hosting?: boolean;
    is_mobile?: boolean;
    source: string;
    source_url: string;
  };
  reputation: {
    ok: boolean;
    error?: string;
    confidence?: number;
    total_reports?: number;
    usage_type?: string;
    verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
    source: string;
    source_url: string;
  };
  privacy?: {
    ok: boolean;
    error?: string;
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
    source: string;
    source_url: string;
  };
  generated_at: string;
}

export interface IpGeoProviderResults {
  ip: string;
  kind: 'ipv4' | 'ipv6';
  ipwhois: IpWhoIsResponse | null;
  abuseipdb: {
    status?: string;
    score?: number;
    verdict?: string;
    raw_summary?: Record<string, unknown>;
    error?: string;
  } | null;
  spur: { status?: string; raw_summary?: Record<string, unknown> } | null;
  ipinfo: { status?: string; raw_summary?: Record<string, unknown> } | null;
}

export function buildIpGeoResponse(params: IpGeoProviderResults): IpGeoResponse {
  const { ip, kind, ipwhois, abuseipdb, spur, ipinfo } = params;
  const now = new Date().toISOString();

  const geoOk = !!ipwhois && ipwhois.success === true;
  const repRaw = abuseipdb;
  const repOk = !!repRaw && repRaw.status === 'ok';

  const asStr =
    ipwhois?.connection?.asn !== undefined
      ? `AS${ipwhois.connection.asn}${ipwhois.connection.org ? ` ${ipwhois.connection.org}` : ''}`
      : undefined;

  const usageType = (repRaw?.raw_summary as { usageType?: string } | undefined)?.usageType ?? '';
  const usageLower = usageType.toLowerCase();
  const isHosting = /(hosting|data\s*center|cdn)/.test(usageLower);
  const isProxy = /(vpn|proxy|anonymizer|tor)/.test(usageLower);
  const isMobile = /(mobile|cellular)/.test(usageLower);

  const body: IpGeoResponse = {
    ip,
    detected_kind: kind,
    geo: geoOk
      ? {
          ok: true,
          country: ipwhois!.country,
          country_code: ipwhois!.country_code,
          region: ipwhois!.region,
          city: ipwhois!.city,
          zip: ipwhois!.postal || undefined,
          lat: ipwhois!.latitude,
          lon: ipwhois!.longitude,
          timezone: ipwhois!.timezone?.id,
          isp: ipwhois!.connection?.isp,
          org: ipwhois!.connection?.org,
          asn: asStr,
          asname: ipwhois!.connection?.org,
          reverse_dns: undefined,
          is_proxy: repOk ? isProxy : undefined,
          is_hosting: repOk ? isHosting : undefined,
          is_mobile: repOk ? isMobile : undefined,
          source: 'ipwho.is',
          source_url: `https://ipwho.is/${encodeURIComponent(ip)}`,
        }
      : {
          ok: false,
          error: ipwhois?.message ?? 'ipwho.is unreachable or no data',
          source: 'ipwho.is',
          source_url: 'https://ipwho.is',
        },
    reputation:
      repRaw && repRaw.status === 'ok'
        ? {
            ok: true,
            confidence: typeof repRaw.score === 'number' ? repRaw.score : undefined,
            total_reports: (repRaw.raw_summary as { totalReports?: number }).totalReports,
            usage_type: (repRaw.raw_summary as { usageType?: string }).usageType,
            verdict: repRaw.verdict as 'malicious' | 'suspicious' | 'clean' | 'unknown' | undefined,
            source: 'AbuseIPDB',
            source_url: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
          }
        : {
            ok: false,
            error: repRaw?.error ?? 'AbuseIPDB unavailable (key may be unset or rate-limited)',
            source: 'AbuseIPDB',
            source_url: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
          },
    generated_at: now,
  };

  // Privacy detection
  const spurOk = !!spur && spur.status === 'ok';
  const ipinfoOk = !!ipinfo && ipinfo.status === 'ok';

  if (spurOk || ipinfoOk) {
    const spurSummary = spurOk
      ? (spur!.raw_summary as {
          vpn?: boolean;
          proxy?: boolean;
          tor?: boolean;
          relay?: boolean;
          hosting?: boolean;
          service?: string;
        })
      : {};
    const ipinfoSummary = ipinfoOk
      ? (ipinfo!.raw_summary as {
          privacy?: {
            vpn?: boolean;
            proxy?: boolean;
            tor?: boolean;
            relay?: boolean;
            hosting?: boolean;
            service?: string;
          };
        })
      : {};
    const ipinfoPrivacy = ipinfoSummary.privacy ?? {};

    body.privacy = {
      ok: true,
      vpn: spurSummary.vpn ?? ipinfoPrivacy.vpn ?? false,
      proxy: spurSummary.proxy ?? ipinfoPrivacy.proxy ?? false,
      tor: spurSummary.tor ?? ipinfoPrivacy.tor ?? false,
      relay: spurSummary.relay ?? ipinfoPrivacy.relay ?? false,
      hosting: spurSummary.hosting ?? ipinfoPrivacy.hosting ?? false,
      service: spurSummary.service ?? ipinfoPrivacy.service ?? undefined,
      source: spurOk ? 'Spur.us' : 'IPinfo',
      source_url: spurOk
        ? `https://spur.us/context/${encodeURIComponent(ip)}`
        : `https://ipinfo.io/${encodeURIComponent(ip)}`,
    };
  } else {
    body.privacy = {
      ok: false,
      error: 'Privacy detection unavailable (Spur.us and IPinfo both failed or are rate-limited)',
      source: 'none',
      source_url: '',
    };
  }

  // Enrich geo with IPinfo fallback
  if (!geoOk && ipinfoOk) {
    const ipinfoSummary = ipinfo!.raw_summary as {
      country?: string;
      city?: string;
      region?: string;
      asn?: { asn?: string; name?: string };
      company?: { name?: string };
      hostname?: string;
    };
    body.geo = {
      ok: true,
      country: ipinfoSummary.country,
      city: ipinfoSummary.city,
      region: ipinfoSummary.region,
      asn: ipinfoSummary.asn?.asn ? `${ipinfoSummary.asn.asn} ${ipinfoSummary.asn.name ?? ''}`.trim() : undefined,
      asname: ipinfoSummary.asn?.name,
      org: ipinfoSummary.company?.name ?? ipinfoSummary.asn?.name,
      reverse_dns: ipinfoSummary.hostname,
      is_proxy: body.privacy.vpn || body.privacy.proxy,
      is_hosting: body.privacy.hosting,
      source: 'IPinfo',
      source_url: `https://ipinfo.io/${encodeURIComponent(ip)}`,
    };
  }

  return body;
}
