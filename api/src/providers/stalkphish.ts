import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

/**
 * StalkPhish.io — phishing URL intel with kit attribution + Telegram
 * exfiltration tracking (https://stalkphish.io).
 *
 * **Requires `STALKPHISH_API_KEY` as a Worker secret**
 * (`wrangler secret put STALKPHISH_API_KEY`). Auth is
 * `Authorization: Token <key>` against
 * `https://api.stalkphish.io/api/v1/`. Without a key we return
 * `unsupported` so the composite isn't polluted.
 *
 * Quota awareness: the Free plan is 50 req/day over a fixed 4h window;
 * Professional is 5000/day over 180d with kit/brand/Telegram fields.
 * We deliberately send NO temporal params (Free ignores them) and make
 * exactly ONE upstream request per check — recall depth follows the
 * key's plan. The IOC route's Cache API fronting absorbs repeat checks.
 *
 * Match semantics:
 *   - non-empty result array → malicious (85). Tags carry the kit family,
 *     targeted brand, and Telegram-exfil flag when the plan returns them.
 *   - empty array → unknown (NOT clean — the plan window may simply not
 *     cover the indicator).
 *   - 401/403/429 → typed error via classifyResponseError.
 */

const supports = new Set(['url', 'domain', 'ipv4']);

const BASE = 'https://api.stalkphish.io/api/v1';

interface StalkPhishEntry {
  siteurl?: string;
  sitedomain?: string;
  pagetitle?: string;
  firstseentime?: string;
  lastseentime?: string;
  firstseencode?: string;
  ipaddress?: string;
  asn?: string;
  asndesc?: string;
  asnreg?: string;
  GoogleSafebrowsing?: string;
  phishing_score?: number;
  page_hash?: string;
  zipfilename?: string;
  zipfilehash?: string;
  extracted_emails?: string;
  extracted_telegram?: string;
  phishingkit_family?: string;
  favicon_mmh3?: string;
  targeted_brand?: string;
}

function tagify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const stalkphish: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'stalkphish',
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

  const key = (env as { STALKPHISH_API_KEY?: string }).STALKPHISH_API_KEY;
  if (!key) return base('unsupported');

  const value = indicator.value.trim();
  if (!value) return base('unsupported');

  // URL search matches against the stored site URL text. For `domain`
  // indicators we search the bare domain (matches sitedomain + any URL
  // under it); IPv4 uses the exact-match endpoint.
  let path: string;
  if (indicator.type === 'ipv4') {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return base('unsupported');
    path = `/search/ipv4/${encodeURIComponent(value)}`;
  } else if (indicator.type === 'domain') {
    path = `/search/url/${encodeURIComponent(value.toLowerCase())}`;
  } else {
    path = `/search/url/${encodeURIComponent(value)}`;
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${key}`,
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit',
      },
      signal,
    });

    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const data = (await res.json()) as StalkPhishEntry[] | { results?: StalkPhishEntry[] };
    const entries = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
    if (entries.length === 0) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['stalkphish'],
        raw_summary: { in_feed: false, note: 'no StalkPhish hits in plan window — not a clean verdict' },
      });
    }

    const first = entries[0]!;
    const kit = (first.phishingkit_family ?? '').trim();
    const brand = (first.targeted_brand ?? '').trim();
    const telegram = (first.extracted_telegram ?? '').trim();
    const score = typeof first.phishing_score === 'number' ? first.phishing_score : null;

    const tags = ['stalkphish', 'phishing'];
    if (kit && kit.toLowerCase() !== 'generic') tags.push(`kit:${tagify(kit)}`);
    else if (kit) tags.push('kit:generic');
    if (brand) tags.push(`brand:${tagify(brand)}`);
    if (telegram) tags.push('telegram-exfil');
    if (first.zipfilehash) tags.push('kit-hash');

    let finalScore = 85;
    const verdict: Verdict = 'malicious';
    // A bare listing without kit/brand/score context is still a confirmed
    // phishing-DB hit, but score it one notch lower when the plan gave us
    // no enrichment fields at all.
    if (!kit && !brand && score === null && !telegram) finalScore = 75;

    return base('ok', {
      score: finalScore,
      verdict,
      tags,
      raw_summary: {
        in_feed: true,
        match_count: entries.length,
        siteurl: first.siteurl ?? '',
        sitedomain: first.sitedomain ?? '',
        pagetitle: first.pagetitle ?? '',
        first_seen: first.firstseentime ?? '',
        last_seen: first.lastseentime ?? '',
        ipaddress: first.ipaddress ?? '',
        asn: first.asn ?? '',
        asn_desc: first.asndesc ?? '',
        phishing_score: score,
        kit_family: kit || null,
        targeted_brand: brand || null,
        telegram: telegram || null,
        kit_hash: first.zipfilehash ?? null,
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
