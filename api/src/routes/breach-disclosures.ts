import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchAFDataleaks } from '../lib/andreafortuna-feeds';

/**
 * Recent breach disclosures from the Have I Been Pwned public breach corpus.
 *
 * HIBP exposes /api/v3/breaches without authentication for read-only access
 * to the full breach list. We cache the response for 6 h and surface the
 * 50 most recent disclosures in `AddedDate` order. Fields preserved:
 *   - Name, Title, Domain, BreachDate, AddedDate, ModifiedDate, PwnCount,
 *     Description, DataClasses, IsVerified, IsSensitive, LogoPath.
 *
 * No PII / lookup-by-email — that's handled separately by the breach
 * checker route, which uses the k-anonymity API.
 */

const CACHE_KEY = 'https://breach-disclosures-cache.internal/v2-af-source';
const CACHE_TTL_SECONDS = 6 * 3600;
const FETCH_TIMEOUT_MS = 15_000;
const HIBP_URL = 'https://haveibeenpwned.com/api/v3/breaches';
const MAX_ITEMS = 50;

interface HibpBreach {
  Name: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  ModifiedDate?: string;
  PwnCount?: number;
  Description?: string;
  DataClasses?: string[];
  IsVerified?: boolean;
  IsSensitive?: boolean;
  IsRetired?: boolean;
  IsSpamList?: boolean;
  LogoPath?: string;
}

export interface BreachDisclosure {
  name: string;
  title: string;
  domain?: string;
  breach_date?: string;
  added_date?: string;
  modified_date?: string;
  pwn_count?: number;
  description?: string;
  data_classes?: string[];
  verified: boolean;
  sensitive: boolean;
  logo_path?: string;
  /** Which corpus surfaced this entry. Absent ⇒ HIBP (back-compat). */
  origin?: 'hibp' | 'andreafortuna';
}

interface DisclosuresResponse {
  generated_at: string;
  source: string;
  count: number;
  breaches: BreachDisclosure[];
}

function strip(html?: string): string | undefined {
  if (!html) return undefined;
  // HIBP returns lightly-marked-up HTML in Description. Convert to plain text.
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function breachDisclosuresHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let breaches: BreachDisclosure[] = [];
  let upstreamOk = false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(HIBP_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pranithjain.qzz.io DFIR toolkit (read-only public breach list)',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') ?? '60';
      return c.json({ error: 'upstream_rate_limited', upstream: 'haveibeenpwned.com', upstream_status: 429 }, 429, {
        'retry-after': retryAfter,
        'cache-control': 'no-store',
      });
    }

    if (res.ok) {
      const raw = (await res.json()) as HibpBreach[];
      upstreamOk = true;
      breaches = raw
        .filter((b) => !b.IsRetired && !b.IsSpamList)
        .sort((a, b) => (b.AddedDate ?? '').localeCompare(a.AddedDate ?? ''))
        .slice(0, MAX_ITEMS)
        .map((b) => ({
          name: b.Name,
          title: b.Title ?? b.Name,
          domain: b.Domain || undefined,
          breach_date: b.BreachDate,
          added_date: b.AddedDate,
          modified_date: b.ModifiedDate,
          pwn_count: b.PwnCount,
          description: strip(b.Description),
          data_classes: b.DataClasses,
          verified: !!b.IsVerified,
          sensitive: !!b.IsSensitive,
          logo_path: b.LogoPath,
          origin: 'hibp' as const,
        }));
    }
  } catch {
    /* fall through with empty list */
  }

  // Andrea Fortuna dataleaks feed — a HIBP re-aggregation. Dedupe by breach
  // name (HIBP entry wins, it carries richer fields); AF only fills in
  // disclosures HIBP's window dropped or hasn't surfaced yet.
  const afBreaches = await fetchAFDataleaks().catch(() => []);
  if (afBreaches.length > 0) {
    if (!upstreamOk && breaches.length === 0) upstreamOk = true;
    const seen = new Set(breaches.map((b) => b.name.toLowerCase()));
    for (const af of afBreaches) {
      const k = af.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      breaches.push(af);
    }
    breaches.sort((a, b) => (b.added_date ?? '').localeCompare(a.added_date ?? '')).splice(MAX_ITEMS);
  }

  const body: DisclosuresResponse = {
    generated_at: new Date().toISOString(),
    source: 'haveibeenpwned.com /api/v3/breaches + andreafortuna.org/dataleaks',
    count: breaches.length,
    breaches,
  };

  const response = c.json(body, 200, {
    'Cache-Control': upstreamOk ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
  });
  if (upstreamOk) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
