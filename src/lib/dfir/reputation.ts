export interface BlacklistCheck {
  name: string;
  listed: boolean;
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

export async function queryDoh(name: string, type = 'A'): Promise<string[]> {
  try {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
    const r = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!r.ok) return [];
    const j = (await r.json()) as { Answer?: Array<{ data: string }> };
    return (j.Answer ?? []).map((a) => a.data);
  } catch (e) {
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
  },
  {
    id: 'uribl-black',
    name: 'URIBL black',
    zone: 'black.uribl.com',
    type: 'domain',
    description: 'Confirmed spam domains.',
  },
  {
    id: 'uribl-grey',
    name: 'URIBL grey',
    zone: 'grey.uribl.com',
    type: 'domain',
    description: 'Suspicious — monitor if volume increases.',
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

export async function checkIpBlacklists(ip: string): Promise<BlacklistCheck[]> {
  const reversed = reverseIp(ip);
  const results: BlacklistCheck[] = [];
  for (const bl of IP_DNSBLS) {
    try {
      const answers = await queryDoh(`${reversed}.${bl.zone}`);
      results.push({
        name: bl.name,
        listed: answers.length > 0,
        detail: answers.length > 0 ? answers.join(', ') : undefined,
        source: `dnsbl:${bl.id}`,
      });
    } catch (e) {
      console.error(`DNSBL lookup failed for ${bl.id}:`, e);
      results.push({ name: bl.name, listed: false, source: `dnsbl:${bl.id}` });
    }
  }
  return results;
}

export async function checkDomainBlacklists(domain: string): Promise<BlacklistCheck[]> {
  const results: BlacklistCheck[] = [];
  for (const bl of DOMAIN_DNSBLS) {
    try {
      const answers = await queryDoh(`${domain}.${bl.zone}`);
      results.push({
        name: bl.name,
        listed: answers.length > 0,
        detail: answers.length > 0 ? answers.join(', ') : undefined,
        source: `dnsbl:${bl.id}`,
      });
    } catch (e) {
      console.error(`DNSBL lookup failed for ${bl.id}:`, e);
      results.push({ name: bl.name, listed: false, source: `dnsbl:${bl.id}` });
    }
  }
  return results;
}

function scoreFromListings(listed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((listed / total) * 100);
}

export function computeScore(blacklists: BlacklistCheck[]): {
  score: number;
  clean: number;
  listed: number;
  total: number;
} {
  const total = blacklists.length;
  const listed = blacklists.filter((b) => b.listed).length;
  const clean = total - listed;
  return { score: scoreFromListings(listed, total), clean, listed, total };
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
