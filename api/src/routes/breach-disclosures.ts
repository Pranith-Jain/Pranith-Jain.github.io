import type { Context } from 'hono';
import type { Env } from '../env';

const FETCH_TIMEOUT_MS = 20_000;
const HIBP_URL = 'https://haveibeenpwned.com/api/v3/breaches';
/**
 * Cap on the breach list returned. Was 50, which surfaced only the most
 * recent month of HIBP additions. 250 covers roughly the last year of
 * disclosures at typical HIBP-add pace and matches the depth expected by
 * the /threatintel/breach-disclosures page, which now also surfaces an
 * MTI leaks panel beside this HIBP corpus.
 */
const MAX_ITEMS = 250;
const CACHE_TTL = 3600;
// Cache key bumped (v6) so the post-bump payload doesn't get masked by a
// pre-bump 50-item entry that's still inside its 1-hour TTL.
const CACHE_KEY = 'https://breach-cache.internal/v6-hibp-only';

interface HibpBreach {
  Name: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  PwnCount?: number;
  Description?: string;
  DataClasses?: string[];
  IsVerified?: boolean;
  IsSensitive?: boolean;
  IsRetired?: boolean;
  IsSpamList?: boolean;
}

export interface BreachDisclosure {
  name: string;
  title: string;
  domain?: string;
  breach_date?: string;
  added_date?: string;
  pwn_count?: number;
  description?: string;
  data_classes?: string[];
  verified: boolean;
  sensitive: boolean;
  /** Provenance tag — e.g. 'andreafortuna' for AF-sourced entries; HIBP omits it. */
  origin?: string;
}

function strip(html?: string): string | undefined {
  if (!html) return undefined;
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
  // Try cache first
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(new Request(CACHE_KEY));
  if (cached) return new Response(cached.body, cached);

  let breaches: BreachDisclosure[] = [];
  let upstreamOk = false;

  try {
    const res = await fetch(HIBP_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io DFIR toolkit' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.ok) {
      upstreamOk = true;
      const raw = (await res.json()) as HibpBreach[];
      const seen = new Set<string>();
      for (const b of raw) {
        if (b.IsRetired || b.IsSpamList) continue;
        const key = b.Name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        breaches.push({
          name: b.Name,
          title: b.Title ?? b.Name,
          domain: b.Domain || undefined,
          breach_date: b.BreachDate,
          added_date: b.AddedDate,
          pwn_count: b.PwnCount,
          description: strip(b.Description),
          data_classes: b.DataClasses,
          verified: !!b.IsVerified,
          sensitive: !!b.IsSensitive,
        });
      }
      breaches.sort((a, b) => (b.added_date ?? '').localeCompare(a.added_date ?? ''));
      breaches = breaches.slice(0, MAX_ITEMS);
    }
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* HIBP unreachable - return what we have */
  }

  const body = {
    generated_at: new Date().toISOString(),
    source: 'haveibeenpwned.com /api/v3/breaches',
    count: breaches.length,
    breaches,
  };

  // Only persist a long-lived cache entry on a genuine upstream success.
  // If HIBP timed out / 5xx'd, `breaches` is empty — caching that under a
  // 200 for an hour would lock an empty list in even after HIBP recovers.
  // Serve it with a short TTL and don't poison the shared edge cache.
  if (!upstreamOk || breaches.length === 0) {
    return c.json(body, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(new Request(CACHE_KEY), response.clone()));
  return response;
}
