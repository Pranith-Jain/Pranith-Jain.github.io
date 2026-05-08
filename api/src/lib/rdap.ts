export interface RdapResult {
  registrar?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameservers: string[];
  status: string[];
  error?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, string]>];
}
interface RdapNameserver {
  ldhName: string;
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
}

// Authoritative RDAP base URLs by TLD. Covers the most common TLDs we'll see.
// Source: IANA RDAP bootstrap registry (data.iana.org/rdap/dns.json)
// Each base ends with a slash; the path is "domain/<name>".
const TLD_RDAP_BASE: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
  org: 'https://rdap.publicinterestregistry.org/rdap/',
  info: 'https://rdap.afilias.net/rdap/info/',
  biz: 'https://rdap.nic.biz/',
  io: 'https://rdap.identitydigital.services/rdap/',
  dev: 'https://pubapi.registry.google/rdap/',
  app: 'https://pubapi.registry.google/rdap/',
  page: 'https://pubapi.registry.google/rdap/',
  cloud: 'https://rdap.nic.cloud/',
  tech: 'https://rdap.identitydigital.services/rdap/',
  capital: 'https://rdap.identitydigital.services/rdap/',
  xyz: 'https://rdap.centralnic.com/xyz/',
  online: 'https://rdap.centralnic.com/online/',
  co: 'https://rdap.nic.co/',
  ai: 'https://rdap.identitydigital.services/rdap/',
  me: 'https://rdap.nic.me/',
  tv: 'https://rdap.nic.tv/',
  uk: 'https://rdap.nominet.uk/uk/',
  us: 'https://rdap.nic.us/',
  in: 'https://rdap.registry.in/rdap/',
  de: 'https://rdap.denic.de/',
  fr: 'https://rdap.nic.fr/',
  eu: 'https://rdap.eu.org/',
};

// User-agent that's more likely to be honored than the default fetch UA
const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';

function vcardName(entity: RdapEntity): string | undefined {
  const arr = entity.vcardArray?.[1] ?? [];
  const fn = arr.find((p) => p[0] === 'fn');
  return fn ? fn[3] : undefined;
}

function tldOf(domain: string): string | undefined {
  const parts = domain.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : undefined;
}

async function tryRdap(
  url: string
): Promise<{ ok: true; json: RdapResponse } | { ok: false; status: number; statusText: string }> {
  // Identity Digital (.ai, .capital, .io, .tech) rate-limits shared CF Worker IPs;
  // edge-cache successful responses for 24h to absorb 429 storms after the first hit lands.
  const res = await fetch(url, {
    headers: { accept: 'application/rdap+json', 'user-agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(5000),
    cf: {
      cacheTtlByStatus: { '200-299': 86400, '400-499': 0, '500-599': 0 },
      cacheEverything: true,
    },
  } as RequestInit);
  if (!res.ok) return { ok: false, status: res.status, statusText: res.statusText };
  const json = (await res.json()) as RdapResponse;
  return { ok: true, json };
}

export async function rdapLookup(domain: string): Promise<RdapResult> {
  const empty: RdapResult = { nameservers: [], status: [] };
  const lower = domain.trim().toLowerCase();
  const tld = tldOf(lower);

  // Try authoritative TLD endpoint first (more reliable, no rdap.org middleman)
  const candidates: string[] = [];
  if (tld && TLD_RDAP_BASE[tld]) {
    candidates.push(`${TLD_RDAP_BASE[tld]}domain/${encodeURIComponent(lower)}`);
  }
  // Always include rdap.org as a fallback for unknown TLDs
  candidates.push(`https://rdap.org/domain/${encodeURIComponent(lower)}`);

  let lastError = '';
  let rateLimited = false;
  for (const url of candidates) {
    try {
      const result = await tryRdap(url);
      if (result.ok) {
        const j = result.json;
        const eventBy = (action: string) => j.events?.find((e) => e.eventAction === action)?.eventDate;
        const registrarEntity = j.entities?.find((e) => e.roles?.includes('registrar'));
        return {
          registrar: registrarEntity ? vcardName(registrarEntity) : undefined,
          created: eventBy('registration'),
          expires: eventBy('expiration'),
          updated: eventBy('last changed'),
          nameservers: (j.nameservers ?? []).map((n) => n.ldhName),
          status: j.status ?? [],
        };
      }
      if (result.status === 429) rateLimited = true;
      lastError = `${result.status} ${result.statusText}`.trim();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  // Identity Digital (.ai/.capital/.io/.tech) and a few others rate-limit shared
  // CF Worker IPs. Surface a friendlier message so users know to retry.
  if (rateLimited) {
    return { ...empty, error: 'registry rate-limited — try again in a few minutes' };
  }
  return { ...empty, error: lastError || 'rdap unavailable' };
}
