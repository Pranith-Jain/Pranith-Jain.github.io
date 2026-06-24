/**
 * Dark web intelligence tools — Tor .onion access, CIRCL AIL metadata,
 * ChainAbuse BTC abuse reports.
 *
 * Ported from badchars/darknet-mcp-server (MIT) and adapted for
 * Cloudflare Workers. Instead of a local Tor SOCKS5 daemon, .onion
 * fetching uses tor2web gateways (clearnet proxies to the Tor network).
 * For full Tor-native access, pair this with a sidecar Tor daemon.
 *
 * API sources (all clearnet):
 *   - Ahmia.fi       — .onion search (https://ahmia.fi)
 *   - Tor Project    — exit node lists (https://check.torproject.org)
 *   - CIRCL AIL      — .onion metadata (https://onion.ail-project.org)
 *   - ChainAbuse     — BTC abuse reports (https://api.chainabuse.com)
 */

// ─── Constants ────────────────────────────────────────────────────────────

const TOR2WEB_GATEWAYS = ['tor2web.io', 'onion.ws', 'onion.sh', 'tor2web.org'] as const;

const TOR_BULK_EXIT_URL = 'https://check.torproject.org/torbulkexitlist';
const TOR_EXIT_ADDRESSES_URL = 'https://check.torproject.org/exit-addresses';
const AHMIA_SEARCH_URL = 'https://ahmia.fi/search/';
const CIRCL_BASE = 'https://onion.ail-project.org';
const CHAINABUSE_API = 'https://api.chainabuse.com/v0/reports';

const UA = 'pranithjain-threatintel-mcp/1.0';

// ─── Tor: Types ───────────────────────────────────────────────────────────

export interface TorStatusResult {
  ok: boolean;
  method: 'tor2web';
  gateways: string[];
  note: string;
}

export interface ScrapedPage {
  url: string;
  title: string;
  links: Array<{ text: string; href: string }>;
  body_text: string;
  status_code: number;
  fetched_via: string;
}

export interface AhmiaResult {
  title: string;
  url: string;
  description: string;
}

export interface TorExitNode {
  fingerprint: string;
  published: string;
  lastStatus: string;
  exitAddress: string;
  exitAddressTimestamp: string;
}

export interface TorExitCheckResult {
  isTorExit: boolean;
  ip: string;
}

// ─── CIRCL: Types ─────────────────────────────────────────────────────────

export interface OnionLookupResult {
  address: string;
  first_seen: string | null;
  last_seen: string | null;
  last_check: string | null;
  status: string | null;
  tags: string[];
  pgp: string[];
  certificates: string[];
  ports: number[];
  title: string | null;
  bitcoin_addresses: string[];
}

// ─── ChainAbuse: Types ────────────────────────────────────────────────────

export interface ChainAbuseReport {
  id: string;
  address: string;
  chain: string;
  description: string;
  category: string;
  createdAt: string;
  scamType: string;
}

export interface ChainAbuseResult {
  address: string;
  reports: ChainAbuseReport[];
  count: number;
}

// ─── Tor ──────────────────────────────────────────────────────────────────

export function tor2webUrl(onionUrl: string, gateway: string): string {
  let clean = onionUrl.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    clean = clean.replace(/^https?:\/\//, '');
  }
  clean = clean.replace(/\/+$/, '');
  return `https://${clean}/${gateway}`;
}

export function parseHtmlBasic(html: string): {
  title: string;
  links: Array<{ text: string; href: string }>;
  bodyText: string;
} {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch?.[1]?.trim() ?? '';

  const links: Array<{ text: string; href: string }> = [];
  const linkRe = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = (m[1] ?? '').trim();
    const text = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
    if (href && !href.startsWith('javascript:')) {
      links.push({ text: text || href, href });
    }
  }

  const bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000);

  return { title, links, bodyText };
}

export function isValidOnionAddress(address: string): boolean {
  return /^[a-z2-7]{16}\.onion$/i.test(address) || /^[a-z2-7]{56}\.onion$/i.test(address);
}

export function extractOnionHostname(input: string): string | null {
  let clean = input.trim().toLowerCase();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      return null;
    }
  }
  clean = clean.replace(/\/+$/, '');
  if (isValidOnionAddress(clean)) return clean;
  return null;
}

export async function torStatus(): Promise<TorStatusResult> {
  return {
    ok: true,
    method: 'tor2web',
    gateways: [...TOR2WEB_GATEWAYS],
    note: 'Using public tor2web gateways to access .onion sites. For true Tor anonymity, run a local Tor daemon (port 9050) and use socks5h://127.0.0.1:9050.',
  };
}

export async function torFetchOnion(
  onionUrl: string,
  gatewayIndex = 0
): Promise<{ html: string; statusCode: number; fetchedVia: string }> {
  const hostname = extractOnionHostname(onionUrl);
  if (!hostname) throw new Error(`Invalid .onion address: ${onionUrl}`);
  const gw = TOR2WEB_GATEWAYS[gatewayIndex] ?? TOR2WEB_GATEWAYS[0];
  const url = tor2webUrl(hostname, gw);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    redirect: 'follow',
  });
  const html = await res.text();
  return { html, statusCode: res.status, fetchedVia: `${hostname}.${gw}` };
}

export async function torScrapeOnion(onionUrl: string, gatewayIndex = 0): Promise<ScrapedPage> {
  const hostname = extractOnionHostname(onionUrl);
  if (!hostname) throw new Error(`Invalid .onion address: ${onionUrl}`);
  const gw = TOR2WEB_GATEWAYS[gatewayIndex] ?? TOR2WEB_GATEWAYS[0];
  const url = tor2webUrl(hostname, gw);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    redirect: 'follow',
  });
  const html = await res.text();
  const { title, links, bodyText } = parseHtmlBasic(html);
  return {
    url: hostname,
    title,
    links,
    body_text: bodyText,
    status_code: res.status,
    fetched_via: `${hostname}.${gw}`,
  };
}

export async function torSearchOnion(query: string, limit = 20): Promise<AhmiaResult[]> {
  const searchUrl = `${AHMIA_SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
  if (!res.ok) throw new Error(`Ahmia search failed: HTTP ${res.status}`);
  const html = await res.text();

  const results: AhmiaResult[] = [];

  const liRe = /<li[^>]*class\s*=\s*["']result["'][^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liRe.exec(html)) !== null) {
    const li = liMatch[1] ?? '';
    const titleMatch = /<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(li);
    const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(li);

    if (titleMatch) {
      let href = (titleMatch[1] ?? '').trim();
      const title = (titleMatch[2] ?? '').replace(/<[^>]+>/g, '').trim();
      const description = descMatch ? (descMatch[1] ?? '').replace(/<[^>]+>/g, '').trim() : '';

      if (href.includes('redirect_url=')) {
        try {
          const parsed = new URL(href, 'https://ahmia.fi');
          href = parsed.searchParams.get('redirect_url') ?? href;
        } catch {
          /* keep as-is */
        }
      }

      if (title && href) {
        results.push({ title, url: href, description });
      }
    }
  }

  return results.slice(0, limit);
}

export async function torExitNodes(limit?: number): Promise<string[]> {
  const res = await fetch(TOR_BULK_EXIT_URL, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Tor exit list failed: HTTP ${res.status}`);
  const text = await res.text();
  const ips = [
    ...new Set(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
    ),
  ];
  return limit ? ips.slice(0, limit) : ips;
}

export async function torExitCheck(ip: string): Promise<TorExitCheckResult> {
  const ipv4Ok = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  const ipv6Ok = /^[0-9a-fA-F:]+$/.test(ip);
  if (!ipv4Ok && !ipv6Ok) throw new Error(`Invalid IP address format: ${ip}`);
  const exitIps = await torExitNodes();
  return { isTorExit: exitIps.includes(ip), ip };
}

export async function torExitDetails(limit?: number): Promise<TorExitNode[]> {
  const res = await fetch(TOR_EXIT_ADDRESSES_URL, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Tor exit addresses failed: HTTP ${res.status}`);
  const text = await res.text();
  const nodes: TorExitNode[] = [];

  let fingerprint = '';
  let published = '';
  let lastStatus = '';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('ExitNode ')) {
      fingerprint = trimmed.slice(9).trim();
      published = '';
      lastStatus = '';
    } else if (trimmed.startsWith('Published ')) {
      published = trimmed.slice(10).trim();
    } else if (trimmed.startsWith('LastStatus ')) {
      lastStatus = trimmed.slice(11).trim();
    } else if (trimmed.startsWith('ExitAddress ')) {
      const parts = trimmed.slice(12).trim().split(/\s+/);
      const exitIp = parts[0] ?? '';
      const exitTs = parts.slice(1).join(' ');
      if (fingerprint && exitIp) {
        nodes.push({ fingerprint, published, lastStatus, exitAddress: exitIp, exitAddressTimestamp: exitTs });
      }
    }
  }

  return limit ? nodes.slice(0, limit) : nodes;
}

// ─── CIRCL AIL Onion Lookup ───────────────────────────────────────────────

export async function onionLookup(address: string): Promise<OnionLookupResult> {
  const hostname = extractOnionHostname(address);
  if (!hostname) throw new Error(`Invalid .onion address: ${address}`);
  const res = await fetch(`${CIRCL_BASE}/api/v1/onion/${encodeURIComponent(hostname)}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) {
    return {
      address: hostname,
      first_seen: null,
      last_seen: null,
      last_check: null,
      status: 'not_found',
      tags: [],
      pgp: [],
      certificates: [],
      ports: [],
      title: null,
      bitcoin_addresses: [],
    };
  }
  if (!res.ok) throw new Error(`CIRCL Onion Lookup error: HTTP ${res.status}`);
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    address: hostname,
    first_seen: (raw.first_seen as string) ?? null,
    last_seen: (raw.last_seen as string) ?? null,
    last_check: (raw.last_check as string) ?? null,
    status: (raw.status as string) ?? null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    pgp: Array.isArray(raw.pgp) ? (raw.pgp as string[]) : [],
    certificates: Array.isArray(raw.certificates) ? (raw.certificates as string[]) : [],
    ports: Array.isArray(raw.ports) ? (raw.ports as number[]) : [],
    title: (raw.title as string) ?? null,
    bitcoin_addresses: Array.isArray(raw.bitcoin_addresses) ? (raw.bitcoin_addresses as string[]) : [],
  };
}

// ─── ChainAbuse BTC Abuse Check ───────────────────────────────────────────

export async function btcAbuseCheck(address: string): Promise<ChainAbuseResult> {
  const params = new URLSearchParams({ address });
  const res = await fetch(`${CHAINABUSE_API}?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) {
    return { address, reports: [], count: 0 };
  }
  if (!res.ok) throw new Error(`ChainAbuse API error: HTTP ${res.status}`);
  const data = (await res.json()) as { reports?: ChainAbuseReport[]; count?: number };
  return {
    address,
    reports: data.reports ?? [],
    count: data.count ?? 0,
  };
}
