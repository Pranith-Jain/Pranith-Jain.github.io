export interface BlacklistCheck {
  name: string;
  listed: boolean;
  /** True when the DNSBL responded with a sentinel/blocked-resolver code
   *  (`127.255.x.y`) instead of a real listing. Spamhaus, URIBL, SURBL and
   *  most major DNSBLs block queries from public DNS resolvers (Cloudflare
   *  DoH, Google DNS, Quad9). Those responses MUST NOT be counted as
   *  "listed" — they mean "we refused to answer your query", not "your
   *  IP/domain is on our list".
   *  Real listings live in `127.0.0.x` (and a handful of vendor-specific
   *  `127.x` sublists); the sentinel namespace `127.255.0.0/16` is
   *  reserved by industry convention for resolver-level error codes. */
  blocked?: boolean;
  detail?: string;
  source: string;
}

export interface ReputationResult {
  domain: string;
  ip?: string;
  blacklists: BlacklistCheck[];
  score: number;
  sources: number;
  clean: number;
  listed: number;
}

export const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export async function queryDoh(name: string, type = 'A', signal?: AbortSignal): Promise<string[]> {
  try {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
    const r = await fetch(url, { headers: { accept: 'application/dns-json' }, signal });
    if (!r.ok) return [];
    const j = (await r.json()) as { Answer?: Array<{ data: string }> };
    return (j.Answer ?? []).map((a) => a.data);
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    console.error('DoH query failed for', name, ':', e);
    return [];
  }
}

function reverseIp(ip: string): string {
  return ip.split('.').reverse().join('.');
}

export interface DnsblSource {
  id: string;
  name: string;
  zone: string;
  type: 'ip' | 'domain';
  description: string;
  /** Per-zone codes that signal "we refused your query" rather than a real
   *  listing. The generic classifier already filters `127.255.x.x`; this
   *  field is for zones that overload codes inside the normal `127.0.0.x`
   *  namespace as a blocked-resolver indicator. URIBL is the canonical
   *  case — `127.0.0.1` on URIBL means "public resolver / over quota",
   *  but the same code on SURBL would be a real jp/job-spam listing, so
   *  this must be per-zone, not global. */
  blockedCodes?: string[];
}

export const IP_DNSBLS: DnsblSource[] = [
  {
    id: 'spamhaus-zen',
    name: 'Spamhaus ZEN',
    zone: 'zen.spamhaus.org',
    type: 'ip',
    description: 'Composite blocklist covering SBL, XBL, and PBL. Most widely used DNSBL.',
  },
  {
    id: 'spamhaus-xbl',
    name: 'Spamhaus XBL',
    zone: 'xbl.spamhaus.org',
    type: 'ip',
    description: 'Exploits blocklist — hijacked PCs, bots, open proxies.',
  },
  {
    id: 'spamhaus-pbl',
    name: 'Spamhaus PBL',
    zone: 'pbl.spamhaus.org',
    type: 'ip',
    description: 'Policy blocklist — end-user IP ranges that should not send mail.',
  },
  {
    id: 'cbl',
    name: 'CBL (Composite Blocking List)',
    zone: 'cbl.abuseat.org',
    type: 'ip',
    description: 'IPs with open relays/proxies or trojan-configured hosts. Operated by AbuseAT.',
  },
  {
    id: 'psbl',
    name: 'PSBL (Passive Spam Block List)',
    zone: 'psbl.surriel.com',
    type: 'ip',
    description: 'Passively-collected spam source IPs.',
  },
  {
    id: 'uceprotect',
    name: 'UCEPROTECT Level 1',
    zone: 'dnsbl-1.uceprotect.net',
    type: 'ip',
    description: 'IPs that sent mail to UCEPROTECT honeypots. Free tier.',
  },
  {
    id: 'spamcop',
    name: 'SpamCop Blocking List',
    zone: 'bl.spamcop.net',
    type: 'ip',
    description: 'IPs reported to SpamCop for sending spam.',
  },
  {
    id: 'barracuda',
    name: 'Barracuda BRBL',
    zone: 'b.barracudacentral.org',
    type: 'ip',
    description: 'Barracuda Reputation Block List.',
  },
  {
    id: 'sorbs-duhl',
    name: 'SORBS DUHL',
    zone: 'dnsbl.sorbs.net',
    type: 'ip',
    description: 'Dynamic IP / DHCP host blocklist.',
  },
  {
    id: 'sorbs-spam',
    name: 'SORBS SPAM',
    zone: 'spam.dnsbl.sorbs.net',
    type: 'ip',
    description: 'Spam-sending host blocklist.',
  },
  {
    id: 'sem-fresh',
    name: 'Spam Eating Monkey FRESH',
    zone: 'fresh.spameatingmonkey.net',
    type: 'ip',
    description: 'Recently-seen spam sources. Freshness-based blocklist.',
  },
  {
    id: 'hostkarma',
    name: 'Hostkarma JunkEmailFilter',
    zone: 'black.junkemailfilter.com',
    type: 'ip',
    description: 'Community-driven IP reputation with black/white/yellow listings.',
  },
  {
    id: 'spfbl',
    name: 'SPFBL.net',
    zone: 'dnsbl.spfbl.net',
    type: 'ip',
    description: 'SPF-based blocklist — IPs with invalid or abusive SPF records.',
  },
];

export const DOMAIN_DNSBLS: DnsblSource[] = [
  {
    id: 'spamhaus-dbl',
    name: 'Spamhaus DBL',
    zone: 'dbl.spamhaus.org',
    type: 'domain',
    description: 'Domain blocklist — domains in spam or malicious emails.',
  },
  {
    id: 'uribl-multi',
    name: 'URIBL multi',
    zone: 'multi.uribl.com',
    type: 'domain',
    description: 'Domains/URLs found in spam. Composite of several sub-lists.',
    blockedCodes: ['127.0.0.1'],
  },
  {
    id: 'uribl-black',
    name: 'URIBL black',
    zone: 'black.uribl.com',
    type: 'domain',
    description: 'Confirmed spam domains.',
    blockedCodes: ['127.0.0.1'],
  },
  {
    id: 'uribl-grey',
    name: 'URIBL grey',
    zone: 'grey.uribl.com',
    type: 'domain',
    description: 'Suspicious — monitor if volume increases.',
    blockedCodes: ['127.0.0.1'],
  },
  {
    id: 'surbl',
    name: 'SURBL',
    zone: 'multi.surbl.org',
    type: 'domain',
    description: 'Spam URI Realtime Blocklists — domains in spam message bodies.',
  },
  {
    id: 'ipl-reputation',
    name: 'Invaluement IPR',
    zone: 'dnsbl.invaluement.com',
    type: 'domain',
    description: 'Domain reputation from Invaluement.',
  },
];

/**
 * Classify a raw DNSBL response into a real listing vs. a sentinel/blocked
 * answer. See `BlacklistCheck.blocked` for the rationale.
 *
 * The generic sentinel namespace is `127.255.x.x` (Spamhaus, SURBL, several
 * SORBS lists). Per-zone overrides via `extraBlockedCodes` capture lists
 * that overload codes inside `127.0.0.x` for the same purpose — URIBL
 * returns `127.0.0.1` to public resolvers, for example.
 *
 * Examples handled:
 *   - `[]`                       → not listed
 *   - `["127.0.0.2"]`            → listed (real Spamhaus SBL)
 *   - `["127.255.255.254"]`      → blocked (Spamhaus refused public resolver)
 *   - `["127.0.0.1"]` + URIBL    → blocked (URIBL refused; with extraBlockedCodes=['127.0.0.1'])
 *   - `["127.0.0.2", "127.255…"]` → listed (real result wins over sentinel)
 */
function classifyDnsbl(
  answers: string[],
  extraBlockedCodes?: string[]
): { listed: boolean; blocked: boolean; detail?: string } {
  if (answers.length === 0) return { listed: false, blocked: false };
  const extra = new Set(extraBlockedCodes ?? []);
  const real: string[] = [];
  const sentinels: string[] = [];
  for (const a of answers) {
    if (a.startsWith('127.255.') || extra.has(a)) sentinels.push(a);
    else real.push(a);
  }
  if (real.length === 0) {
    return {
      listed: false,
      blocked: true,
      detail: `public-resolver blocked (${sentinels.join(', ')})`,
    };
  }
  return { listed: true, blocked: false, detail: real.join(', ') };
}

async function checkOne(bl: DnsblSource, query: string, signal?: AbortSignal): Promise<BlacklistCheck> {
  try {
    const answers = await queryDoh(query, 'A', signal);
    const c = classifyDnsbl(answers, bl.blockedCodes);
    return {
      name: bl.name,
      listed: c.listed,
      blocked: c.blocked,
      detail: c.detail,
      source: `dnsbl:${bl.id}`,
    };
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    console.error(`DNSBL lookup failed for ${bl.id}:`, e);
    return { name: bl.name, listed: false, source: `dnsbl:${bl.id}` };
  }
}

/**
 * Parallel DNSBL fan-out. Sequential `for...of` + `await` stalled at 13
 * IP DNSBLs × ~250ms each = ~3s per IP; with two MX records that compounds
 * into 10–30s wall-clock. `Promise.all` cuts the whole batch to one
 * round-trip's worth of latency.
 */
export async function checkIpBlacklists(ip: string, signal?: AbortSignal): Promise<BlacklistCheck[]> {
  const reversed = reverseIp(ip);
  return Promise.all(IP_DNSBLS.map((bl) => checkOne(bl, `${reversed}.${bl.zone}`, signal)));
}

export async function checkDomainBlacklists(domain: string, signal?: AbortSignal): Promise<BlacklistCheck[]> {
  return Promise.all(DOMAIN_DNSBLS.map((bl) => checkOne(bl, `${domain}.${bl.zone}`, signal)));
}

function scoreFromListings(listed: number, reachable: number): number {
  if (reachable === 0) return 0;
  return Math.round((listed / reachable) * 100);
}

/**
 * Aggregate a list of DNSBL check results.
 *
 * `blocked` rows are sources that refused our public-resolver query — they
 * must NOT count as either listed OR clean. The `score` ratio is therefore
 * computed over `reachable = listed + clean` (excludes blocked) so a result
 * dominated by blocked rows doesn't get misclassified as "0% listed = clean".
 */
export function computeScore(blacklists: BlacklistCheck[]): {
  score: number;
  clean: number;
  listed: number;
  blocked: number;
  reachable: number;
  total: number;
} {
  const total = blacklists.length;
  const listed = blacklists.filter((b) => b.listed).length;
  const blocked = blacklists.filter((b) => b.blocked).length;
  const clean = total - listed - blocked;
  const reachable = listed + clean;
  return { score: scoreFromListings(listed, reachable), clean, listed, blocked, reachable, total };
}

export interface ExternalRepTool {
  name: string;
  url: string;
  description: string;
}

export const EXTERNAL_REP_TOOLS: ExternalRepTool[] = [
  {
    name: 'Talos Intelligence',
    url: 'https://talosintelligence.com/reputation_center/email_rep',
    description: 'Cisco Talos email & IP reputation — check sender reputation, volume, and blacklist status.',
  },
  {
    name: 'IPQualityScore',
    url: 'https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test',
    description: 'Free IP proxy/VPN detection, fraud score, and risk analysis. API key available for automated checks.',
  },
  {
    name: 'Scamalytics',
    url: 'https://scamalytics.com/ip',
    description: 'IP fraud risk scoring — checks IP against known fraud databases with confidence metrics.',
  },
  {
    name: 'MultiRBL Valli',
    url: 'https://multirbl.valli.org',
    description: 'Multi-RBL lookup — checks IP/domain against 100+ DNSBLs simultaneously with detailed results.',
  },
  {
    name: 'Blacklist Alert',
    url: 'https://www.blacklistalert.org',
    description: 'Real-time blacklist monitor — checks if your IP/domain is listed on major DNSBLs.',
  },
  {
    name: 'IP Chicken',
    url: 'https://www.ipchicken.com',
    description: 'Simple IP address and DNS lookup tool — shows your public IP, hostname, and ISP.',
  },
];
