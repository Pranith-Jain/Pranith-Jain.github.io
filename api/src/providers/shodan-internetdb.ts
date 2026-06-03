import type { ProviderAdapter, ProviderResult, Verdict } from './types';

/**
 * Shodan InternetDB — KEYLESS, FREE, UNLIMITED.
 *
 * This is Shodan's free public API that provides basic intel on any IP
 * without requiring an API key. It returns:
 *   - ports: list of open ports
 *   - cpes: Common Platform Enumeration identifiers
 *   - hostnames: associated hostnames
 *   - vulns: known CVEs
 *   - tags: Shodan tags (e.g., "cloud", "cdn", "vpn")
 *
 * Rate limits: generous (thousands of requests/day per IP).
 * Use alongside the full Shodan provider (which requires a key) to get
 * coverage even when no API key is configured.
 *
 * @see https://internetdb.shodan.io/
 */

const supports = new Set(['ipv4', 'ipv6']);

interface InternetDBResponse {
  ports: number[];
  cpes: string[];
  hostnames: string[];
  vulns: string[];
  tags: string[];
}

/** Ports commonly associated with insecure/exposed services. */
const RISKY_PORTS = new Set([
  21, // FTP
  23, // Telnet
  25, // SMTP
  110, // POP3
  135, // MSRPC
  139, // NetBIOS
  143, // IMAP
  445, // SMB
  1433, // MSSQL
  1521, // Oracle
  2049, // NFS
  3306, // MySQL
  3389, // RDP
  5432, // PostgreSQL
  5900, // VNC
  6379, // Redis
  8080, // HTTP Proxy
  8443, // HTTPS Alt
  9200, // Elasticsearch
  27017, // MongoDB
]);

/** CVEs that are actively exploited in the wild (high-priority). */
const ACTIVELY_EXPLOITED_CVES = new Set([
  'CVE-2021-44228', // Log4Shell
  'CVE-2021-45046', // Log4Shell follow-up
  'CVE-2021-45105', // Log4Shell follow-up
  'CVE-2021-44832', // Log4Shell follow-up
  'CVE-2023-44487', // HTTP/2 Rapid Reset
  'CVE-2023-46747', // BIG-IP
  'CVE-2023-4966', // Citrix Bleed
  'CVE-2023-20198', // Cisco IOS XE
  'CVE-2023-22515', // Confluence
  'CVE-2024-3094', // XZ Utils
  'CVE-2024-21762', // FortiOS
  'CVE-2024-23897', // Jenkins
  'CVE-2024-23917', // JetBrains TeamCity
  'CVE-2024-27198', // JetBrains TeamCity
  'CVE-2024-1709', // ConnectWise ScreenConnect
]);

export const shodanInternetDB: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'shodan-internetdb',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  try {
    const url = `https://internetdb.shodan.io/${encodeURIComponent(indicator.value)}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    // 404 = IP not in Shodan's index
    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['not-indexed'],
        raw_summary: { reason: 'IP not found in Shodan InternetDB' },
      });
    }

    if (res.status === 429) return base('error', { error: 'rate_limited' });
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as InternetDBResponse;

    const ports = json.ports ?? [];
    const vulns = json.vulns ?? [];
    const tags = json.tags ?? [];
    const hostnames = json.hostnames ?? [];
    const cpes = json.cpes ?? [];

    // ── Scoring ─────────────────────────────────────────────────────────
    let score = 0;

    // CVE scoring: each vuln adds points, actively exploited ones add more
    const activelyExploited = vulns.filter((v) => ACTIVELY_EXPLOITED_CVES.has(v));
    const otherVulns = vulns.length - activelyExploited.length;
    score += activelyExploited.length * 25; // high priority
    score += otherVulns * 8;

    // Risky port scoring
    const riskyPortCount = ports.filter((p) => RISKY_PORTS.has(p)).length;
    score += riskyPortCount * 5;

    // Many open ports = larger attack surface
    if (ports.length > 50) score += 15;
    else if (ports.length > 20) score += 8;

    score = Math.min(100, score);

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: Verdict;
    if (score >= 70) verdict = 'malicious';
    else if (score >= 40) verdict = 'suspicious';
    else if (score > 0) verdict = 'suspicious';
    else verdict = 'clean';

    // Override: if only benign tags (cloud, cdn), lower the verdict
    const benignTags = ['cloud', 'cdn', 'proxy', 'vpn', '托管'];
    const hasBenignOnly = tags.length > 0 && tags.every((t) => benignTags.some((bt) => t.toLowerCase().includes(bt)));
    if (hasBenignOnly && score < 50) {
      verdict = 'clean';
      score = Math.min(score, 15);
    }

    // ── Tags ────────────────────────────────────────────────────────────
    const resultTags: string[] = [];
    if (activelyExploited.length > 0) resultTags.push(`actively-exploited:${activelyExploited.length}`);
    if (vulns.length > 0) resultTags.push(`cves:${vulns.length}`);
    if (ports.length > 0) resultTags.push(`ports:${ports.length}`);
    tags.slice(0, 5).forEach((t) => resultTags.push(t));
    if (hostnames.length > 0) resultTags.push(`hostnames:${hostnames.length}`);

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(resultTags)].slice(0, 8),
      raw_summary: {
        ports: ports.slice(0, 15),
        vulns: vulns.slice(0, 10),
        actively_exploited: activelyExploited.slice(0, 5),
        hostnames: hostnames.slice(0, 5),
        cpes: cpes.slice(0, 5),
        tags: tags.slice(0, 10),
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
