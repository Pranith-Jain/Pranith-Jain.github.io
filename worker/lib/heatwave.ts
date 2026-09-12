/**
 * Validity Heatwave Domain Blocklist lookup (lookup.validity.tools).
 *
 * Heatwave flags *sending domains* seen on synthetic reputation warming or
 * active cold outreach (Validity Intelligence Network trap signals). There is
 * NO keyless API and the public DNS resolver is retired (partner-only rsync);
 * the free web Lookup page (100 lookups/day/IP) is server-rendered and stable
 * enough to parse — same approach as the MythreatIntel/Telegram scrapers.
 *
 * Semantics that MUST survive into every consumer (from /listing-policy):
 *   - exact-match only: never inherit parent ↔ subdomain.
 *   - the 3rd-octet score is a RELATIVE band (recomputed hourly) — store it,
 *     never threshold on it.
 *   - "not currently listed" is NOT a clean verdict (not certified legitimate).
 *   - warming-only (stage 2) means observed warming, not an attack — surface
 *     as suspicious/informational, never malicious. Only stage 3 (graduated
 *     to live cold outreach) is actively abusive.
 *   - scope is sending-domain reputation — never apply to URL/content/DKIM.
 */

export type HeatwaveStage = 2 | 3 | 4;
export type HeatwaveStatus = 'warming' | 'active' | 'pre-warming' | 'not-listed';

export interface HeatwaveRelated {
  domain: string;
  classification: 'Warming' | 'Active';
  score: number;
  listed: string;
}

export interface HeatwaveResult {
  domain: string;
  listed: boolean;
  status: HeatwaveStatus;
  /** DNS stage octet when known (2 warming-only, 3 active outreach, 4 pre-warming). */
  stage: HeatwaveStage | null;
  /** Relative severity band 0–100 (display only — see module doc). */
  score: number | null;
  observation_age: string | null;
  first_observed: string | null;
  last_observed: string | null;
  listed_since: string | null;
  dns_answer: string | null;
  related: HeatwaveRelated[];
  checked_at: string;
}

export interface HeatwaveVerdict {
  verdict: 'suspicious' | 'unknown';
  score: number;
  tags: string[];
}

const LOOKUP_BASE = 'https://lookup.validity.tools/';
const FETCH_TIMEOUT_MS = 15_000;

/** Normalize user input to a bare domain, or null when it isn't one. */
export function normalizeHeatwaveDomain(input: string): string | null {
  const v = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^mailto:/, '')
    .replace(/\/.*$/, '')
    .replace(/^.*@/, '')
    .replace(/\.$/, '');
  if (!v || v.length > 253) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v) || v.includes(':')) return null; // IPs aren't listable
  if (!/^(?!-)[a-z0-9-]{1,63}(\.(?!-)[a-z0-9-]{1,63})*\.[a-z]{2,}$/.test(v)) return null;
  return v;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse lookup-page text into a HeatwaveResult. Exported for unit tests —
 * the fixtures are trimmed page snapshots, not live fetches.
 */
export function parseHeatwavePage(domain: string, text: string): HeatwaveResult | null {
  const checked_at = new Date().toISOString();
  const empty: HeatwaveResult = {
    domain,
    listed: false,
    status: 'not-listed',
    stage: null,
    score: null,
    observation_age: null,
    first_observed: null,
    last_observed: null,
    listed_since: null,
    dns_answer: null,
    related: [],
    checked_at,
  };

  // Result header echoes the queried domain: "Listed Warming <domain> …".
  // Require the echo so homepage-style tables can't false-positive.
  const listedRe = new RegExp(`Listed\\s+(Warming|Active|Pre-warming)\\s+${domain.replace(/\./g, '\\.')}\\b`, 'i');
  const listedMatch = listedRe.exec(text);
  const notListed = /Not currently listed/i.test(text) && /not on the Heatwave Domain Blocklist/i.test(text);

  const related = parseRelated(text);

  if (!listedMatch) {
    if (!notListed) return null; // unrecognized page (bot-wall / redesign) — caller degrades
    return { ...empty, related };
  }

  const kind = listedMatch[1]!.toLowerCase();
  const status: HeatwaveStatus = kind === 'active' ? 'active' : kind === 'pre-warming' ? 'pre-warming' : 'warming';

  const scoreMatch = /Listing score\s+(\d{1,3})\s*\/\s*100/.exec(text);
  const ageMatch = /Observation age\s+(.+?)\s+Listing score/i.exec(text);
  const firstMatch = /First observed\s+(\d{4}-\d{2}-\d{2})/.exec(text);
  const lastMatch = /Last observed\s+(\d{4}-\d{2}-\d{2})/.exec(text);
  const sinceMatch = /Listed since\s+(\d{4}-\d{2}-\d{2})/.exec(text);
  const dnsMatch = /(\S+\.bl\.validity\.tools)\s*→\s*(127\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(text);

  let stage: HeatwaveStage | null = status === 'active' ? 3 : status === 'pre-warming' ? 4 : 2;
  let dns_answer: string | null = null;
  if (dnsMatch) {
    dns_answer = `${dnsMatch[1]} → ${dnsMatch[2]}`;
    const stageOctet = Number(dnsMatch[2]!.split('.')[3]);
    if (stageOctet === 2 || stageOctet === 3 || stageOctet === 4) stage = stageOctet;
  }

  return {
    domain,
    listed: true,
    status,
    stage,
    score: scoreMatch ? Number(scoreMatch[1]) : null,
    observation_age: ageMatch ? ageMatch[1]!.replace(/\s+since first observation$/i, '').trim() || null : null,
    first_observed: firstMatch ? firstMatch[1]! : null,
    last_observed: lastMatch ? lastMatch[1]! : null,
    listed_since: sinceMatch ? sinceMatch[1]! : null,
    dns_answer,
    related,
    checked_at,
  };
}

/** "Related listed domains" table rows live after that section marker. */
function parseRelated(text: string): HeatwaveRelated[] {
  const marker = text.search(/Related listed domains/i);
  const scope = marker >= 0 ? text.slice(marker) : text;
  const out: HeatwaveRelated[] = [];
  const re = /(\S+)\s+(Warming|Active)\s+(\d{1,3})\s*\/\s*100\s+(\d{4}-\d{2}-\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null && out.length < 25) {
    out.push({
      domain: m[1]!,
      classification: m[2] as 'Warming' | 'Active',
      score: Number(m[3]),
      listed: m[4]!,
    });
  }
  return out;
}

/** Conservative verdict mapping — see module doc for why warming ≠ malicious. */
export function heatwaveVerdict(r: HeatwaveResult): HeatwaveVerdict {
  const base = [`heatwave`, r.status];
  if (r.stage !== null) base.push(`stage:${r.stage}`);
  if (r.listed) {
    if (r.status === 'active') return { verdict: 'suspicious', score: 65, tags: [...base, 'cold-outreach'] };
    if (r.status === 'warming') return { verdict: 'suspicious', score: 40, tags: [...base, 'reputation-warming'] };
    return { verdict: 'unknown', score: 20, tags: [...base, 'advisory', 'not-observed-sending'] };
  }
  return { verdict: 'unknown', score: 0, tags: ['heatwave', 'not-listed'] };
}

export async function heatwaveLookup(input: string): Promise<HeatwaveResult | null> {
  const domain = normalizeHeatwaveDomain(input);
  if (!domain) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${LOOKUP_BASE}?domain=${encodeURIComponent(domain)}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'pranithjain.qzz.io heatwave lookup (free, read-only)',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseHeatwavePage(domain, stripHtml(html));
  } catch {
    return null; // upstream flap / rate-limit — caller serves cache/last-good
  } finally {
    clearTimeout(timer);
  }
}
