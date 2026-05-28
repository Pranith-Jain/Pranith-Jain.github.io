export interface RdapResult {
  registrar?: string;
  registrar_url?: string;
  registrar_iana_id?: string;
  registrar_abuse_email?: string;
  registrar_abuse_phone?: string;
  registry_domain_id?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameservers: string[];
  status: string[];
  dnssec?: string;
  error?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  handle?: string;
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, string]>];
  publicIds?: Array<{ type: string; identifier: string }>;
}
interface RdapNameserver {
  ldhName: string;
}
interface RdapSecureDNS {
  delegationSigned?: boolean;
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
  handle?: string;
  secureDNS?: RdapSecureDNS;
  ldhName?: string;
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

function vcardEmail(entity: RdapEntity): string | undefined {
  const arr = entity.vcardArray?.[1] ?? [];
  const email = arr.find((p) => p[0] === 'email');
  return email ? email[3] : undefined;
}

function vcardPhone(entity: RdapEntity): string | undefined {
  const arr = entity.vcardArray?.[1] ?? [];
  const tel = arr.find((p) => p[0] === 'tel');
  if (!tel) return undefined;
  const value = tel[3];
  // Handle tel URIs like "tel:+86.95187"
  if (typeof value === 'string' && value.startsWith('tel:')) return value.slice(4);
  return typeof value === 'string' ? value : undefined;
}

function tldOf(domain: string): string | undefined {
  const parts = domain.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tryRdap(
  url: string
): Promise<{ ok: true; json: RdapResponse } | { ok: false; status: number; statusText: string }> {
  // Identity Digital (.ai, .capital, .io, .tech) and Verisign rate-limit the
  // shared CF Worker IP pool. A single 429 used to fail the whole lookup —
  // but these per-IP buckets clear in seconds, so a couple of short backed-off
  // retries (honoring Retry-After, capped) recover most "rate-limited" cases
  // before we fall through to the rdap.org mirror / port-43 WHOIS.
  // Successful responses are edge-cached 24h to absorb repeat lookups.
  const MAX_ATTEMPTS = 3;
  let last: { status: number; statusText: string } = { status: 0, statusText: 'no response' };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/rdap+json', 'user-agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        cf: {
          cacheTtlByStatus: { '200-299': 86400, '400-499': 0, '500-599': 0 },
          cacheEverything: true,
        },
      } as RequestInit);
      if (res.ok) {
        const json = (await res.json()) as RdapResponse;
        return { ok: true, json };
      }
      last = { status: res.status, statusText: res.statusText };
      // Only 429/503 are worth retrying; 404/400/etc. won't change.
      if (res.status !== 429 && res.status !== 503) return { ok: false, ...last };
      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
        const wait = Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1000, 3000)
          : 900 * attempt + Math.random() * 400;
        await sleep(wait);
      }
    } catch (err) {
      last = { status: 0, statusText: err instanceof Error ? err.message : String(err) };
      if (attempt < MAX_ATTEMPTS) await sleep(700 * attempt);
    }
  }
  return { ok: false, ...last };
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

        // Extract registrar details
        const registrarName = registrarEntity ? vcardName(registrarEntity) : undefined;
        const registrarEmail = registrarEntity ? vcardEmail(registrarEntity) : undefined;
        const registrarPhone = registrarEntity ? vcardPhone(registrarEntity) : undefined;
        const registrarIanaId = registrarEntity?.publicIds?.find((p) => p.type === 'IANA Registrar ID')?.identifier;

        // Extract registry domain ID from the domain handle or publicIds
        const registryDomainId = j.handle;

        // DNSSEC status
        const dnssec = j.secureDNS?.delegationSigned ? 'signed' : 'unsigned';

        return {
          registrar: registrarName,
          registrar_url: registrarIanaId
            ? `https://www.internic.net/registrars/registrar-${registrarIanaId}.html`
            : undefined,
          registrar_iana_id: registrarIanaId,
          registrar_abuse_email: registrarEmail,
          registrar_abuse_phone: registrarPhone,
          registry_domain_id: registryDomainId,
          created: eventBy('registration'),
          expires: eventBy('expiration'),
          updated: eventBy('last changed'),
          nameservers: (j.nameservers ?? []).map((n) => n.ldhName),
          status: j.status ?? [],
          dnssec,
        };
      }
      if (result.status === 429) rateLimited = true;
      lastError = `${result.status} ${result.statusText}`.trim();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  // RDAP failed across all candidates — try raw TCP/43 WHOIS as a last resort.
  // Critical for Identity Digital TLDs (.ai/.capital/.io/.tech) which 429 the
  // CF Worker IP pool on RDAP but answer port-43 from the same IPs.
  try {
    const { whoisTcpLookup } = await import('./whois-tcp');
    const tcp = await whoisTcpLookup(lower);
    if (tcp) return tcp;
  } catch {
    /* fall through to surface the original error */
  }

  if (rateLimited) {
    return { ...empty, error: 'registry rate-limited — try again in a few minutes' };
  }
  return { ...empty, error: lastError || 'rdap unavailable' };
}
