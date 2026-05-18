import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchRlUpstream } from './ransomwarelive';

/**
 * Ransomware negotiations aggregator.
 *
 * The RL PRO `/negotiations` endpoint is a two-level directory:
 *   /negotiations            → { groups: [{ group, chats }] }
 *   /negotiations/{group}    → { chats: [{ id, message_count,
 *                                          initialransom, negotiatedransom,
 *                                          paid }] }
 * The bare endpoint carries NO chat records — fetching only that produced
 * the "no negotiation records" empty state. This route fans out across every
 * group server-side, flattens the chats into one sortable feed, and parses
 * the money strings into numbers for discount math. Cached 1h.
 *
 * Full transcripts are not exposed by this API tier (only `message_count`).
 * RL's negotiation corpus is itself built from the public Casualtek/
 * Ransomchats research repo, which DOES publish the message logs — so the
 * per-chat transcript endpoint below reads that second source on demand.
 */

export const NEGOTIATIONS_CACHE_KEY = 'https://negotiations-agg-cache.internal/v1';
const CACHE_TTL_SECONDS = 60 * 60;
const TRANSCRIPT_CACHE_TTL = 24 * 60 * 60;
const MAX_GROUPS = 40; // directory currently ~26; bound the fan-out regardless
const CASUALTEK_RAW = 'https://raw.githubusercontent.com/Casualtek/Ransomchats/main';

interface NegotiationRow {
  group: string;
  chat_id: string;
  /** YYYY-MM-DD when chat_id is an 8-digit date, else undefined. */
  date?: string;
  message_count: number;
  initial_ransom?: number;
  negotiated_ransom?: number;
  /** Settlement flag from upstream. */
  paid: boolean;
  /** 0–100, only when both ransom figures are known and initial > 0. */
  discount_pct?: number;
}

export interface NegotiationsResponse {
  generated_at: string;
  source: string;
  groups: { group: string; chats: number }[];
  negotiations: NegotiationRow[];
  totals: { groups: number; chats: number; settled: number; avg_discount: number | null };
  warnings: string[];
}

/** "$1,200,000" / "1.2M" / "N/A" → number | undefined. */
function parseMoney(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || /^n\/?a$/i.test(s)) return undefined;
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** "20211004" → "2021-10-04" (best-effort; passthrough otherwise). */
function idToDate(id: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(id);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function rec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function buildNegotiations(env: Env): Promise<NegotiationsResponse> {
  const warnings: string[] = [];
  const dir = await fetchRlUpstream(env, '/negotiations');
  const dirData = rec(dir) ? dir : {};
  const groupsRaw = Array.isArray((dirData as { groups?: unknown }).groups)
    ? ((dirData as { groups: unknown[] }).groups as unknown[])
    : [];

  const groups = groupsRaw
    .filter(rec)
    .map((g) => ({ group: String(g.group ?? ''), chats: Number(g.chats ?? 0) }))
    .filter((g) => g.group)
    .sort((a, b) => b.chats - a.chats)
    .slice(0, MAX_GROUPS);

  if (groups.length === 0) {
    warnings.push('RL /negotiations directory empty or unauthorized');
    return {
      generated_at: new Date().toISOString(),
      source: 'ransomware.live PRO /negotiations (per-group fan-out)',
      groups: [],
      negotiations: [],
      totals: { groups: 0, chats: 0, settled: 0, avg_discount: null },
      warnings,
    };
  }

  const perGroup = await Promise.all(
    groups.map(async (g) => {
      const data = await fetchRlUpstream(env, `/negotiations/${encodeURIComponent(g.group)}`);
      const chats =
        rec(data) && Array.isArray((data as { chats?: unknown }).chats)
          ? ((data as { chats: unknown[] }).chats as unknown[])
          : null;
      if (!chats) {
        warnings.push(`per-group fetch failed: ${g.group}`);
        return [] as NegotiationRow[];
      }
      return chats.filter(rec).map((c): NegotiationRow => {
        const id = String(c.id ?? '');
        const initial = parseMoney(c.initialransom);
        const negotiated = parseMoney(c.negotiatedransom);
        const discount =
          initial && initial > 0 && negotiated !== undefined
            ? Math.max(0, Math.min(100, Math.round((1 - negotiated / initial) * 100)))
            : undefined;
        return {
          group: g.group,
          chat_id: id,
          date: idToDate(id),
          message_count: Number(c.message_count ?? 0),
          initial_ransom: initial,
          negotiated_ransom: negotiated,
          paid: c.paid === true,
          discount_pct: discount,
        };
      });
    })
  );

  const negotiations = perGroup.flat().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const settled = negotiations.filter((n) => n.paid).length;
  const withDisc = negotiations.filter((n) => n.discount_pct !== undefined);
  const avg_discount = withDisc.length
    ? Math.round(withDisc.reduce((s, n) => s + (n.discount_pct ?? 0), 0) / withDisc.length)
    : null;

  return {
    generated_at: new Date().toISOString(),
    source: 'ransomware.live PRO /negotiations (per-group fan-out)',
    groups,
    negotiations,
    totals: { groups: groups.length, chats: negotiations.length, settled, avg_discount },
    warnings,
  };
}

export async function negotiationsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(NEGOTIATIONS_CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await buildNegotiations(c.env);
  const cacheable = body.negotiations.length > 0;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': cacheable ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store',
    },
  });
  if (cacheable) c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}

/**
 * Per-chat transcript from the public Casualtek/Ransomchats research repo.
 * `group` / `id` are validated and path-segment-encoded; we only ever read
 * `<group>/<id>.json` from that one repo. This is research-published
 * negotiation dialogue, not stolen credentials/data.
 */
export async function negotiationTranscriptHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const group = c.req.param('group') ?? '';
  const id = c.req.param('id') ?? '';
  if (!/^[\w .-]{1,64}$/.test(group) || !/^[\w.-]{1,64}$/.test(id)) {
    return c.json({ error: 'bad_params' }, 400, { 'cache-control': 'no-store' });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(`https://negotiation-transcript.internal/v1/${encodeURIComponent(group)}/${id}`);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  let upstream: Response;
  try {
    upstream = await fetch(`${CASUALTEK_RAW}/${encodeURIComponent(group)}/${encodeURIComponent(id)}.json`, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain.qzz.io CTI (read-only)' },
      signal: AbortSignal.timeout(12_000),
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
  } catch {
    return c.json({ error: 'upstream_unreachable' }, 502, { 'cache-control': 'no-store' });
  }
  if (!upstream.ok) {
    return c.json({ error: 'not_found' }, upstream.status === 404 ? 404 : 502, { 'cache-control': 'no-store' });
  }
  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return c.json({ error: 'upstream_not_json' }, 502, { 'cache-control': 'no-store' });
  }
  const response = c.json({ source: 'Casualtek/Ransomchats', group, ...(rec(json) ? json : { raw: json }) }, 200, {
    'cache-control': `public, max-age=${TRANSCRIPT_CACHE_TTL}`,
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
