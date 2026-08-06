/**
 * IOC + infrastructure filtering and extraction.
 *
 * Two problems this solves:
 * 1. The LLM's action-card `iocs` array and the prose IOC table often contain
 *    non-attacker infrastructure scraped from tool results: citation URLs
 *    (ransomlook.io), email domains (duck.com from xenoz84@duck.com), victim
 *    domains (elumax.com), and blog-post hashes (ransomlook post IDs). These
 *    pollute the "Indicators" panel with false IOCs.
 * 2. Real attacker infrastructure (leak-site .onion URLs, payment addresses,
 *    C2 IPs/domains, name servers) is buried in tool results but never
 *    surfaced as a structured "infrastructure" list.
 *
 * This module provides:
 *   - filterIocs(): drop known source/citation/victim domains + non-malware hashes
 *   - extractInfrastructure(): pull real attacker infra from tool step results
 */

import type { InfrastructureArtifact } from './types';

/** Domains that appear in IOC tables as context but are NOT attacker
 *  infrastructure — reputation feeds, ransom trackers, OSINT platforms,
 *  vendor sites, documentation. An IOC matching one of these is dropped. */
export const SOURCE_DOMAINS = new Set([
  // Reputation feeds / OSINT platforms
  'virustotal.com',
  'abuse.ch',
  'urlscan.io',
  'shodan.io',
  'censys.io',
  'greynoise.io',
  'threatfox.io',
  'malwarebazaar.com',
  'bazaar.abuse.ch',
  // Ransom trackers
  'ransomlook.io',
  'ransomware.live',
  'ransomwatch.telemetry.lol',
  'ransomfeed.it',
  // Vendor / reference
  'github.com',
  'mitre.org',
  'attack.mitre.org',
  'nvd.nist.gov',
  'cve.mitre.org',
  'cloudflare.com',
  'microsoft.com',
  'google.com',
  'wikipedia.org',
  'example.com',
  'example.org',
  'example.net',
  // Webamon / intel platforms
  'intel.webamon.com',
  'webamon.com',
  // Common email/webmail domains that leak from attribution text
  'duck.com',
  'gmail.com',
  'outlook.com',
  'protonmail.com',
  'proton.me',
  'mail.ru',
  'yahoo.com',
  'hotmail.com',
  // Code/doc hosting that appears in references
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'docs.microsoft.com',
  'learn.microsoft.com',
]);

/** Domains that are almost always VICTIMS (leak-site post URLs), not attacker
 *  infrastructure. Heuristic: if the domain appears in a ransomlook/ransomware.live
 *  post URL path, it's a victim. We can't know all victim domains, but we can
 *  drop the tracker domains themselves. */

/**
 * Extract victim domains from ransomware activity / victim-releak tool results.
 * These are VICTIM organizations' domains (elumax.com, lasevillanita.com),
 * NOT attacker infrastructure. The IOC filter uses this blocklist to drop
 * victim domains that the LLM mistakenly puts in the IOC table.
 *
 * Pulls domains from: victim field, source_url host, description, post_url.
 */
export function extractVictimDomains(steps: { tool: string; data?: unknown }[]): Set<string> {
  const victims = new Set<string>();
  for (const step of steps) {
    if (!step.data) continue;
    const tool = step.tool;
    // Only extract from ransomware victim tools — not from IOC enrichment tools
    // (which return attacker infrastructure, not victims).
    if (!/ransomware|victim|releak|leak/i.test(tool)) continue;
    const json = JSON.stringify(step.data);
    // Domains in victim fields, source_urls, post_urls, descriptions
    for (const m of json.matchAll(
      /"(?:victim|source_url|post_url|url|domain|website|company_url)"\s*:\s*"[^"]*([a-z0-9-]+\.[a-z]{2,})[^"]*"/gi
    )) {
      const d = (m[1] ?? '').toLowerCase();
      if (d && !SOURCE_DOMAINS.has(d) && d.length > 4) victims.add(d);
    }
    // Bare domains in victim name fields (e.g. "victim": "elumax.com")
    for (const m of json.matchAll(/"victim"\s*:\s*"([^"]+)"/gi)) {
      const v = (m[1] ?? '').toLowerCase();
      // If the victim field IS a domain, add it
      const domainMatch = v.match(/([a-z0-9-]+\.[a-z]{2,})$/);
      if (domainMatch && !SOURCE_DOMAINS.has(domainMatch[1]!)) victims.add(domainMatch[1]!);
    }
  }
  return victims;
}

/**
 * Filter IOC entries, dropping victim domains extracted from the step results.
 * Use this in the synthesizer (which has access to steps) to drop victim
 * domains the LLM mistakenly put in the action-card IOC list.
 */
export function filterIocEntriesWithVictims<T extends { value: string }>(
  entries: T[],
  steps: { tool: string; data?: unknown }[]
): T[] {
  const victimDomains = extractVictimDomains(steps);
  if (victimDomains.size === 0) return filterIocEntries(entries);
  return filterIocEntries(entries).filter((e) => {
    const v = e.value.trim().toLowerCase();
    // Drop if the IOC value is a victim domain or a subdomain of one
    if (victimDomains.has(v)) return false;
    for (const vd of victimDomains) {
      if (v.endsWith('.' + vd) || v === vd) return false;
    }
    return true;
  });
}

/**
 * Filter a list of IOC values (strings) to drop non-attacker infrastructure.
 * Removes:
 *   - source/citation domains (SOURCE_DOMAINS)
 *   - email domains (extracted from foo@bar.com)
 *   - private/reserved IP ranges (already filtered upstream, but defense-in-depth)
 *   - non-malware hashes (ransomlook blog post IDs are 64-hex but not SHA-256
 *     of a malware sample — we can't tell, so we keep all 64-hex but drop
 *     known blog-post patterns)
 *
 * Returns the filtered list (deduplicated).
 */
export function filterIocs(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);

    // Drop source/citation domains — also drop any subdomain of a source
    // domain (www.ransomlook.io → root ransomlook.io is in SOURCE_DOMAINS).
    if (SOURCE_DOMAINS.has(v)) continue;
    const lastTwoLabels = v.split('.').slice(-2).join('.');
    if (lastTwoLabels && SOURCE_DOMAINS.has(lastTwoLabels)) continue;
    const lastThreeLabels = v.split('.').slice(-3).join('.');
    if (lastThreeLabels && SOURCE_DOMAINS.has(lastThreeLabels)) continue;

    // Drop bare TLDs or overly-short values
    if (v.length < 4) continue;

    // Drop email addresses (keep the domain if it's not a source domain —
    // but the email itself is not an IOC). foo@bar.com → drop the whole thing.
    if (/^[^@\s]+@[^@\s]+$/.test(v)) continue;

    // Drop IPs in private/reserved ranges
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
      const first = Number(v.split('.')[0]);
      if (first === 0 || first === 127 || first === 10 || first >= 224) continue;
      const parts = v.split('.').map(Number);
      if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) continue;
      if (parts[0] === 192 && parts[1] === 168) continue;
    }

    out.push(raw.trim()); // preserve original case for hashes
  }
  return out;
}

/**
 * Filter an action-card IOC entry list (typed objects) the same way — drop
 * entries whose value is a source/citation domain, email, or private IP.
 */
export function filterIocEntries<T extends { value: string }>(entries: T[]): T[] {
  const allowed = new Set(filterIocs(entries.map((e) => e.value)));
  return entries.filter((e) => allowed.has(e.value.trim()));
}

/**
 * Extract real attacker infrastructure from the investigation's tool step
 * results. Pulls leak-site .onion URLs, payment addresses (bitcoin/monero),
 * C2 IPs/domains, and name servers from the raw tool JSON — these are the
 * "Detailed Analysis" infrastructure details the NamrataSonii-style report
 * surfaces (subdomains, C2 IP, contacted IPs, name servers).
 *
 * Returns a structured list grouped by type.
 */
export function extractInfrastructure(steps: { tool: string; data?: unknown }[]): InfrastructureArtifact[] {
  const artifacts: InfrastructureArtifact[] = [];
  const seen = new Set<string>();

  const add = (type: InfrastructureArtifact['type'], value: string, context: string, source: string) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key) || !value) return;
    seen.add(key);
    artifacts.push({ type, value, context, source });
  };

  for (const step of steps) {
    if (!step.data) continue;
    const json = JSON.stringify(step.data);
    const source = step.tool;

    // .onion leak-site URLs (v3 onion addresses are 56 chars; v2 were 16)
    for (const m of json.matchAll(/https?:\/\/[a-z0-9]{16,62}\.onion[^\s"'`]*/gi)) {
      add('onion', m[0].replace(/[\\"]+$/, ''), 'Tor hidden service (leak site / C2)', source);
      add('leak_site', m[0].replace(/[\\"]+$/, ''), 'Ransomware leak site', source);
    }
    // Bare .onion addresses
    for (const m of json.matchAll(/\b[a-z0-9]{16,62}\.onion\b/gi)) {
      add('onion', m[0], 'Tor hidden service', source);
    }

    // Bitcoin payment addresses (bc1... legacy/bech32, 34/42-char base58)
    for (const m of json.matchAll(/\b(bc1[a-z0-9]{20,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})\b/gi)) {
      add('payment_address', m[0], 'Cryptocurrency payment address (ransom)', source);
    }
    // Monero addresses (95-char base58 starting with 4 or 8)
    for (const m of json.matchAll(/\b[48][0-9a-zA-Z]{94}\b/g)) {
      add('payment_address', m[0], 'Monero payment address (ransom)', source);
    }

    // Name servers (NS records)
    for (const m of json.matchAll(/"ns"\s*:\s*\[?([^\]]+)\]?/gi)) {
      const nsBlock = m[1] ?? '';
      for (const ns of nsBlock.matchAll(/([a-z0-9.-]+\.(?:com|org|net|io|co|de|eu|nl|uk|us|biz|info))/gi)) {
        add('nameserver', (ns[1] ?? '').toLowerCase(), 'Authoritative name server', source);
      }
    }
    for (const m of json.matchAll(/"name_servers"\s*:\s*\[([^\]]+)\]/gi)) {
      const block = m[1] ?? '';
      for (const ns of block.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/gi)) {
        add('nameserver', (ns[1] ?? '').toLowerCase(), 'Authoritative name server', source);
      }
    }

    // Resolved IPs (from DNS / passive DNS results) — public IPs only
    for (const m of json.matchAll(/"ip"?\s*:\s*"((?:\d{1,3}\.){3}\d{1,3})"/g)) {
      const ip = m[1] ?? '';
      if (!ip) continue;
      const first = Number(ip.split('.')[0]);
      if (first === 0 || first === 127 || first === 10 || first >= 224) continue;
      const parts = ip.split('.').map(Number);
      if (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) continue;
      if (parts[0] === 192 && parts[1] === 168) continue;
      add('resolved_ip', ip, 'DNS resolution', source);
    }

    // Subdomains (from passive DNS / domain lookup)
    for (const m of json.matchAll(/"subdomains"\s*:\s*\[([^\]]+)\]/gi)) {
      const block = m[1] ?? '';
      for (const sd of block.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/gi)) {
        const d = (sd[1] ?? '').toLowerCase();
        if (!d) continue;
        // Drop source/citation domains and their subdomains
        if (SOURCE_DOMAINS.has(d)) continue;
        const lastTwo = d.split('.').slice(-2).join('.');
        if (lastTwo && SOURCE_DOMAINS.has(lastTwo)) continue;
        add('subdomain', d, 'Passive DNS subdomain', source);
      }
    }
  }

  return artifacts.slice(0, 50);
}
