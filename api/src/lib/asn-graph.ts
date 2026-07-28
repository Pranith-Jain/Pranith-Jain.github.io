/**
 * ASN/IP/CIDR graph pivot — keyless alternative to commercial IP-intel APIs
 * (ZerN.io, IPinfo, IPQualityScore, etc.).
 *
 * For an investigator the most actionable first question on any IP isn't
 * "where is it?" — it's "what network am I looking at, and who's running it?"
 * ASN + prefix + abuse contact answers that. Three free, no-auth sources are
 * fused:
 *
 *   - bgp.tools (`bgp.tools/api/v1/...`)
 *       ground-truth BGP state. For an IP returns the announcing prefix +
 *       ASN; for an ASN returns name, country, prefix count, peer count.
 *       Self-described "best effort" — runs on a single rack, sometimes
 *       throttles the shared CF Worker IP pool, hence the resilient fetch +
 *       edge cache.
 *
 *   - RIPE Stat (`stat.ripe.net/data/<widget>/data.json?resource=...`)
 *       covers all 5 RIRs (keyless for the widgets we use). `as-overview`
 *       adds descriptive name + country; `abuse-contact-finder` adds the
 *       authoritative abuse email; `network-info` gives RIR + parent block
 *       for an IP; `prefix-overview` for a CIDR. Anonymous quota ~2k/day
 *       per IP — fine for a public CTI tool.
 *
 *   - RDAP IP (`rdap.org/ip/<ip|cidr>`)
 *       IANA bootstrap registry; the canonical allocation record (start,
 *       end, handle, parent, RIR entity).
 *
 * No API keys. Every external call is bounded by `fetchResilient`
 * (3 attempts, jittered backoff, per-call timeout). Any source failing
 * silently degrades the result — the function still returns whatever the
 * others said. The route layer wraps it in edge cache (5–15 min, BGP state
 * moves fast enough that a stale ASN is worse than a fresh one).
 *
 * For a *zero-API-key* ASN-pivot this gets you:
 *   - IP → ASN + announcing prefix + abuse contact + RIR
 *   - ASN → name + country + prefix/peer count + abuse contact
 *   - CIDR → registry handle + parent + abuse contact
 * That is roughly what ZerN.io, IPinfo, and IPAPI all sell at the free
 * tier. We deliberately do NOT try to compete on WHOIS history, geolocation
 * accuracy, or hosting-provider tags — those need paid feeds.
 */

import { fetchResilient } from './fetch-resilient';

const UA = 'pranithjain.qzz.io asn-graph';
const TIMEOUT_MS = 6000;

export interface IpGraph {
  ip: string;
  /** Announcing prefix in CIDR notation, e.g. "198.51.100.0/24". */
  prefix?: string;
  /** 32-bit ASN as a number, e.g. 13335. */
  asn?: number;
  /** AS holder name (e.g. "Cloudflare, Inc."). */
  asn_name?: string;
  /** ISO-2 country of the AS holder, e.g. "US". */
  asn_country?: string;
  /** Regional Internet Registry that allocated the prefix. */
  rir?: string;
  /** Authoritative abuse contact email for the prefix or AS. */
  abuse_contact?: string;
  /** Which sources contributed. Useful for showing provenance in the UI. */
  sources: string[];
}

export interface AsGraph {
  asn: number;
  /** Short holder name, e.g. "CLOUDFLARENET". */
  name?: string;
  /** Longer description from bgp.tools, when available. */
  descr?: string;
  /** ISO-2 country, e.g. "US". */
  country?: string;
  /** Number of announced v4 prefixes (live BGP state). */
  prefix_count?: number;
  /** Number of visible BGP peers. */
  peer_count?: number;
  /** Authoritative abuse contact email. */
  abuse_contact?: string;
  /** Regional Internet Registry that allocated the AS number itself. */
  rir?: string;
  sources: string[];
}

export interface PrefixGraph {
  /** Normalised CIDR, e.g. "198.51.100.0/24". */
  prefix: string;
  /** RIR for the allocation, e.g. "ARIN". */
  rir?: string;
  /** RDAP handle (e.g. "NET-198-51-100-0-1") for the registration. */
  registry_handle?: string;
  /** Parent allocation CIDR (e.g. the /16 for a /24). */
  parent?: string;
  /** Authoritative abuse contact email. */
  abuse_contact?: string;
  /** Related RDAP object URIs (self link, parent, upriver, downriver). */
  rdap_links: string[];
  /** Announcing ASN, if available from bgp.tools. */
  asn?: number;
  sources: string[];
}

export interface AsGraphOptions {
  fetch?: typeof globalThis.fetch;
  /** Skip the edge cache (used by tests + the first hop of a cache miss). */
  useCache?: boolean;
  signal?: AbortSignal;
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const CIDR_RE = /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const ASN_RE = /^(?:AS)?\d+$/i;

function isValidIpv4(s: string): boolean {
  if (!IPV4_RE.test(s)) return false;
  return s.split('.').every((oct) => {
    const n = Number(oct);
    return n >= 0 && n <= 255;
  });
}

function isValidCidr(s: string): boolean {
  if (!CIDR_RE.test(s)) return false;
  const parts = s.split('/');
  if (parts.length !== 2) return false;
  const [ip, mask] = parts;
  if (!ip || !mask) return false;
  if (!isValidIpv4(ip)) return false;
  const m = Number(mask);
  return m >= 0 && m <= 32;
}

function isValidAsn(s: string): number | null {
  const trimmed = s.trim();
  if (!ASN_RE.test(trimmed)) return null;
  const n = Number(trimmed.replace(/^AS/i, ''));
  if (!Number.isFinite(n) || n < 0 || n > 4294967295) return null;
  return n;
}

async function safeJson<T>(url: string, opts: AsGraphOptions = {}): Promise<T | null> {
  try {
    const res = await fetchResilient(
      url,
      {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      },
      { attempts: 3, baseDelayMs: 400, maxDelayMs: 1500, timeoutMs: TIMEOUT_MS, fetch: opts.fetch }
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** RIPE Stat widget response envelopes — every widget wraps `data` in
 *  the same outer `{ data, query_time, ... }` shape. */
interface RipeEnvelope<T> {
  data?: T;
  messages?: Array<{ severity?: string; text?: string }>;
}

interface RipeAsOverview {
  asn?: number;
  holder?: string;
  description?: string;
  country?: string;
  block?: string;
  resource?: string;
}

interface RipeAbuseContact {
  abuse_contacts?: string[];
  authoritative_rir?: string;
}

interface RipeNetworkInfo {
  block?: { resource?: string; name?: string; description?: string; country?: string };
  parent_block?: { resource?: string };
  rir?: string;
  inetnum?: { country?: string };
}

interface RipePrefixOverview {
  resource?: string;
  asns?: Array<{ asn?: number; holder?: string }>;
  prefix?: string;
  rir?: string;
}

interface BgpToolsPreview {
  asn?: number;
  prefix?: string;
  ip?: string;
  country?: string;
  registry?: string;
  name?: string;
}

interface BgpToolsAs {
  asn?: number;
  name?: string;
  descr?: string;
  country?: string;
  peers?: number;
  prefixes?: number;
  registry?: string;
  source?: string;
}

interface RdapIp {
  handle?: string;
  startAddress?: string;
  endAddress?: string;
  ipVersion?: string;
  name?: string;
  type?: string;
  country?: string;
  parentHandle?: string;
  links?: Array<{ href?: string; rel?: string; type?: string }>;
  entities?: Array<{
    handle?: string;
    roles?: string[];
    contact?: { email?: string; name?: string };
    vcardArray?: unknown[];
    links?: Array<{ href?: string }>;
  }>;
  rdapConformance?: string[];
  objectClassName?: string;
}

function firstEmail(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.find((e) => /@/.test(e));
  return /@/.test(value) ? value : undefined;
}

function extractRdapEmails(entities: RdapIp['entities']): string | undefined {
  if (!entities) return undefined;
  for (const e of entities) {
    if (e.contact?.email) return e.contact.email;
    // vCardArray: ["vcard", [["fn", {}, "text", "Name"], ["email", {}, "text", "x@y"]], ...]
    const arr = Array.isArray(e.vcardArray) ? (e.vcardArray as unknown[]) : null;
    if (arr && Array.isArray(arr[1])) {
      const pairs = arr[1] as unknown[][];
      for (const p of pairs) {
        if (Array.isArray(p) && p[0] === 'email') {
          const v = p[3];
          if (typeof v === 'string' && /@/.test(v)) return v;
        }
      }
    }
  }
  return undefined;
}

async function getBgpIpPreview(ip: string, opts: AsGraphOptions): Promise<BgpToolsPreview | null> {
  const url = `https://bgp.tools/api/v1/preview/${encodeURIComponent(ip)}`;
  return (await safeJson<BgpToolsPreview>(url, opts)) ?? null;
}

async function getBgpAs(asn: number, opts: AsGraphOptions): Promise<BgpToolsAs | null> {
  const url = `https://bgp.tools/api/v1/as/${asn}`;
  return (await safeJson<BgpToolsAs>(url, opts)) ?? null;
}

async function getRipeAsOverview(asn: number, opts: AsGraphOptions): Promise<RipeAsOverview | null> {
  const url = `https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`;
  const env = await safeJson<RipeEnvelope<RipeAsOverview>>(url, opts);
  return env?.data ?? null;
}

async function getRipeAbuseContact(resource: string, opts: AsGraphOptions): Promise<RipeAbuseContact | null> {
  const url = `https://stat.ripe.net/data/abuse-contact-finder/data.json?resource=${encodeURIComponent(resource)}`;
  const env = await safeJson<RipeEnvelope<RipeAbuseContact>>(url, opts);
  return env?.data ?? null;
}

async function getRipeNetworkInfo(ip: string, opts: AsGraphOptions): Promise<RipeNetworkInfo | null> {
  const url = `https://stat.ripe.net/data/network-info/data.json?resource=${encodeURIComponent(ip)}`;
  const env = await safeJson<RipeEnvelope<RipeNetworkInfo>>(url, opts);
  return env?.data ?? null;
}

async function getRipePrefixOverview(prefix: string, opts: AsGraphOptions): Promise<RipePrefixOverview | null> {
  const url = `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(prefix)}`;
  const env = await safeJson<RipeEnvelope<RipePrefixOverview>>(url, opts);
  return env?.data ?? null;
}

async function getRdapIp(resource: string, opts: AsGraphOptions): Promise<RdapIp | null> {
  const url = `https://rdap.org/ip/${encodeURIComponent(resource)}`;
  return (await safeJson<RdapIp>(url, opts)) ?? null;
}

function rdapLinks(rdap: RdapIp | null): string[] {
  if (!rdap?.links) return [];
  return rdap.links.map((l) => l.href).filter((h): h is string => typeof h === 'string' && h.length > 0);
}

/**
 * IP → ASN graph. Fuses bgp.tools (BGP truth) + RIPE Stat (holder/country/
 * abuse) + RDAP (allocation record). Fails open — any source dropping
 * out is reflected in the absent field, not an exception.
 */
export async function ipToAsnGraph(rawIp: string, opts: AsGraphOptions = {}): Promise<IpGraph> {
  const ip = rawIp.trim();
  const out: IpGraph = { ip, sources: [] };
  if (!isValidIpv4(ip)) {
    return { ...out, sources: ['invalid_ip'] };
  }

  // Wave 1: bgp.tools, RIPE network-info, and IP-scoped abuse contact. Run
  // in parallel; each fills different fields and they don't read each
  // other's outputs. After this wave `out.prefix` and `out.asn` are stable
  // (or known absent) and the second wave can use them.
  // We deliberately DON'T take `name` from bgp.tools here: it's often a
  // short, sometimes-outdated AS tag (e.g. "CLOUDFLARENET", "GOOGLE")
  // rather than the legal holder name. RIPE's `as-overview` gives the
  // holder (e.g. "Cloudflare, Inc.") and that's what an analyst wants.
  await Promise.allSettled([
    (async () => {
      const b = await getBgpIpPreview(ip, opts);
      if (!b) return;
      if (typeof b.prefix === 'string') out.prefix = b.prefix;
      if (typeof b.asn === 'number') out.asn = b.asn;
      if (typeof b.country === 'string' && !out.asn_country) out.asn_country = b.country;
      if (typeof b.registry === 'string' && !out.rir) out.rir = b.registry;
      out.sources.push('bgp.tools');
    })(),
    (async () => {
      const ni = await getRipeNetworkInfo(ip, opts);
      if (!ni) return;
      if (typeof ni.block?.country === 'string' && !out.asn_country) {
        out.asn_country = ni.block.country;
      }
      if (typeof ni.rir === 'string' && !out.rir) out.rir = ni.rir;
      if (ni.block?.resource && !out.prefix) out.prefix = ni.block.resource;
      out.sources.push('ripe-network-info');
    })(),
    (async () => {
      const ac = await getRipeAbuseContact(ip, opts);
      const email = firstEmail(ac?.abuse_contacts);
      if (!email) return;
      out.abuse_contact = email;
      out.sources.push('ripe-abuse-contact-finder');
    })(),
  ]);

  // Wave 2: RDAP, scoped to the announcing prefix when we have one. RDAP
  // is the slowest source and we use its record to backfill the
  // allocation CIDR / abuse contact / country only if wave 1 missed them.
  const rdapResource = out.prefix ?? ip;
  const rdap = await getRdapIp(rdapResource, opts);
  if (rdap) {
    if (typeof rdap.country === 'string' && !out.asn_country) out.asn_country = rdap.country;
    const email = extractRdapEmails(rdap.entities);
    if (email && !out.abuse_contact) out.abuse_contact = email;
    if (!out.prefix && rdap.startAddress && rdap.endAddress) {
      out.prefix = `${rdap.startAddress}/${maskOfBlock(rdap.startAddress, rdap.endAddress)}`;
    }
    out.sources.push('rdap-ip');
  }

  // Wave 3: if we know the ASN but bgp.tools didn't fill name/country,
  // ask RIPE for the as-overview and an AS-scoped abuse contact. This is
  // the common gap (some /24s are in RIR blocks RIPE doesn't have a
  // direct as-overview for, but their AS does have one).
  if (out.asn && (!out.asn_name || !out.asn_country)) {
    const a = await getRipeAsOverview(out.asn, opts);
    if (a) {
      if (typeof a.holder === 'string' && !out.asn_name) out.asn_name = a.holder;
      if (typeof a.country === 'string' && !out.asn_country) out.asn_country = a.country;
      if (typeof a.block === 'string' && !out.rir) out.rir = rirFromBlock(a.block);
      out.sources.push('ripe-as-overview');
    }
    if (!out.abuse_contact) {
      const ac = await getRipeAbuseContact(`AS${out.asn}`, opts);
      const email = firstEmail(ac?.abuse_contacts);
      if (email) {
        out.abuse_contact = email;
        out.sources.push('ripe-as-abuse');
      }
    }
  }

  // Dedupe + sort sources for stable UI display.
  out.sources = Array.from(new Set(out.sources)).sort();
  return out;
}

/**
 * ASN → AS graph. Primary source: bgp.tools (live peer + prefix counts).
 * Fallback for name/country/abuse: RIPE Stat.
 */
export async function asnToAsGraph(rawAsn: string | number, opts: AsGraphOptions = {}): Promise<AsGraph> {
  const parsed = typeof rawAsn === 'number' ? rawAsn : isValidAsn(String(rawAsn));
  if (parsed === null) {
    return { asn: NaN, sources: ['invalid_asn'] };
  }
  const asn = parsed;
  const out: AsGraph = { asn, sources: [] };

  const [b, a] = await Promise.all([getBgpAs(asn, opts), getRipeAsOverview(asn, opts)]);

  if (b) {
    if (typeof b.name === 'string') out.name = b.name;
    if (typeof b.descr === 'string' && b.descr.length > 0) out.descr = b.descr;
    if (typeof b.country === 'string') out.country = b.country;
    if (typeof b.peers === 'number') out.peer_count = b.peers;
    if (typeof b.prefixes === 'number') out.prefix_count = b.prefixes;
    if (typeof b.registry === 'string') out.rir = b.registry;
    out.sources.push('bgp.tools');
  }
  if (a) {
    if (typeof a.holder === 'string' && !out.name) out.name = a.holder;
    if (typeof a.country === 'string' && !out.country) out.country = a.country;
    if (typeof a.block === 'string' && !out.rir) out.rir = rirFromBlock(a.block);
    out.sources.push('ripe-as-overview');
  }

  // Abuse contact for the AS. Try the AS itself, then a representative
  // prefix (RIPE's finder needs a concrete resource).
  const ac = await getRipeAbuseContact(`AS${asn}`, opts);
  const acEmail = firstEmail(ac?.abuse_contacts);
  if (acEmail) {
    out.abuse_contact = acEmail;
    out.sources.push('ripe-as-abuse');
  }

  out.sources = Array.from(new Set(out.sources)).sort();
  return out;
}

/**
 * CIDR → prefix graph. RIPE prefix-overview gives announcing ASNs +
 * registry; RDAP gives the allocation record (handle, parent, abuse
 * contact). bgp.tools is included when the prefix has a concrete
 * announcement.
 */
export async function cidrToPrefixGraph(rawCidr: string, opts: AsGraphOptions = {}): Promise<PrefixGraph> {
  const cidr = rawCidr.trim();
  const out: PrefixGraph = { prefix: cidr, rdap_links: [], sources: [] };
  if (!isValidCidr(cidr)) {
    out.sources.push('invalid_cidr');
    return out;
  }

  const tasks: Array<Promise<void>> = [];
  tasks.push(
    (async () => {
      const p = await getRipePrefixOverview(cidr, opts);
      if (p) {
        if (typeof p.rir === 'string') out.rir = p.rir;
        if (typeof p.asns?.[0]?.asn === 'number') out.asn = p.asns[0].asn;
        out.sources.push('ripe-prefix-overview');
      }
    })()
  );
  tasks.push(
    (async () => {
      const ac = await getRipeAbuseContact(cidr, opts);
      const email = firstEmail(ac?.abuse_contacts);
      if (email) {
        out.abuse_contact = email;
        out.sources.push('ripe-abuse-contact-finder');
      }
    })()
  );
  tasks.push(
    (async () => {
      const rdap = await getRdapIp(cidr, opts);
      if (rdap) {
        if (typeof rdap.handle === 'string' && !out.registry_handle) {
          out.registry_handle = rdap.handle;
        }
        if (typeof rdap.parentHandle === 'string' && !out.parent) {
          out.parent = rdap.parentHandle;
        }
        const links = rdapLinks(rdap);
        if (links.length) out.rdap_links = links;
        const email = extractRdapEmails(rdap.entities);
        if (email && !out.abuse_contact) out.abuse_contact = email;
        if (!out.rir && typeof rdap.country === 'string') {
          out.rir = 'allocated';
        }
        out.sources.push('rdap-ip');
      }
    })()
  );

  // bgp.tools IP preview against a representative host in the CIDR is
  // usually a no-op for /0 or huge blocks. Only attempt when we can pick
  // a sane sample address (mask ≤ /24).
  const mask = Number(cidr.split('/')[1]);
  if (mask >= 16 && mask <= 24) {
    const sample = cidrToSampleIp(cidr);
    if (sample) {
      tasks.push(
        (async () => {
          const b = await getBgpIpPreview(sample, opts);
          if (b) {
            if (typeof b.asn === 'number' && !out.asn) out.asn = b.asn;
            if (typeof b.registry === 'string' && !out.rir) out.rir = b.registry;
            out.sources.push('bgp.tools');
          }
        })()
      );
    }
  }

  await Promise.allSettled(tasks);
  out.sources = Array.from(new Set(out.sources)).sort();
  return out;
}

/**
 * Tiny mask-length estimator. The RDAP IP record gives start/end addresses
 * but not the prefix length directly; derive the smallest CIDR that fits.
 * For /24 blocks this returns "24" deterministically.
 */
function maskOfBlock(start: string, end: string): number {
  if (!isValidIpv4(start) || !isValidIpv4(end)) return 32;
  const a = ipToInt(start);
  const b = ipToInt(end);
  if (a === null || b === null || b < a) return 32;
  const span = b - a + 1;
  // Highest power of two >= span, but capped to 32.
  let mask = 32;
  let size = 1;
  for (let i = 0; i < 32; i++) {
    if (size >= span) {
      mask = 32 - i;
      break;
    }
    size <<= 1;
  }
  // Align start to mask boundary.
  const block = ((1 << (32 - mask)) - 1) ^ 0xffffffff;
  if ((a & block) === a) return mask;
  return 32;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isFinite(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  // JS bitwise ops are 32-bit signed; ensure we stay in unsigned range.
  return n >>> 0;
}

/**
 * Pick a representative host inside a CIDR. Naive (network address) for
 * very large blocks, network+1 for /31 and up. /32 returns the address
 * itself.
 */
function cidrToSampleIp(cidr: string): string | null {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  const [ip, m] = parts;
  if (!ip || !m) return null;
  if (!isValidIpv4(ip)) return null;
  const mask = Number(m);
  if (mask > 32 || mask < 0) return null;
  const n = ipToInt(ip);
  if (n === null) return null;
  const block = mask === 0 ? 0 : ((1 << (32 - mask)) - 1) ^ 0xffffffff;
  const network = n & block;
  // Avoid the network and broadcast addresses when they exist.
  const sample = mask >= 31 ? network : network + 1;
  return intToIp(sample >>> 0);
}

function intToIp(n: number): string {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

function rirFromBlock(block: string): string {
  // RIPE's as-overview `block` is a 1-3-octet prefix; map heuristically to
  // an RIR. This is best-effort and only used to label the AS card.
  const first = Number(block.split('.')[0]);
  if (first === undefined || !Number.isFinite(first)) return '';
  if (first >= 1 && first <= 126) return 'ARIN';
  if (first === 127) return 'IETF';
  if (first >= 128 && first <= 175) return 'ARIN';
  if (first >= 176 && first <= 191) return 'LACNIC';
  if (first >= 192 && first <= 207) return 'ARIN';
  if (first >= 208 && first <= 223) return 'RIPE';
  if (first >= 224) return 'IETF';
  return '';
}

// Re-export the validators so the route can pre-flight input without
// duplicating the regexes.
export const __validators = { isValidIpv4, isValidCidr, isValidAsn };
