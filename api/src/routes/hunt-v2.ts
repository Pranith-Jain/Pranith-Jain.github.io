/**
 * Hunt v2 handler — deep-dive investigation across the full IOC provider
 * suite, Telegram leaks, breach databases, WHOIS, and certificate logs.
 *
 * Provider results come from the same fan-out as /api/v1/ioc/check (called
 * internally via SELF.fetch to avoid duplicate code paths and ensure the
 * same provider set/caching/circuit-breaking behavior).
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { safeNullLog } from '../lib/safe-catch';
import { detectType } from '../lib/indicator';
import { signInternalToken } from '../lib/internal-token';

// ── Types ────────────────────────────────────────────────────────────────

interface ProviderHit {
  source: string;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  score: number;
  description: string;
  tags: string[];
}

interface TelegramHit {
  channel: string;
  message: string;
  date: string;
}

interface BreachHit {
  name: string;
  source: string;
  breach_date?: string;
  data_classes?: string[];
  description?: string;
}

interface HuntV2Response {
  q: string;
  type: string;
  ioc_providers: {
    hits: ProviderHit[];
    malicious_count: number;
    max_score: number;
    total_checked: number;
  };
  telegram_leaks: {
    hits: TelegramHit[];
    count: number;
  };
  breach_data: {
    hits: BreachHit[];
    count: number;
  };
  whois: Record<string, unknown> | null;
  cert_logs: {
    count: number;
    recent: string[];
  };
  composite: {
    score: number;
    verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
    confidence: 'low' | 'medium' | 'high';
    summary: string[];
  };
}

// ── Internal IOC check via SELF.fetch ────────────────────────────────────

interface IocProviderResult {
  source: string;
  status: string;
  score: number;
  verdict: string;
  raw_summary: Record<string, unknown>;
  tags: string[];
  error?: string;
}

interface IocDoneEvent {
  score: number;
  verdict: string;
  confidence: string;
  contributing: number;
  total?: number;
}

/**
 * Call the IOC check endpoint internally (same Worker, via SELF.fetch) and
 * parse the SSE stream into provider results + composite score. This
 * reuses the exact same provider fan-out, caching, circuit-breaking, and
 * scoring as the streaming IOC checker — no code duplication.
 */
async function selfFetchIocCheck(
  indicator: string,
  env: Env
): Promise<{
  providers: IocProviderResult[];
  done: IocDoneEvent | null;
  eligible: string[];
}> {
  const url = `/api/v1/ioc/check?indicator=${encodeURIComponent(indicator)}`;
  const token = await signInternalToken('hunt-v2', env.INTERNAL_TOKEN_SECRET);
  const res = await env.SELF.fetch(url, {
    headers: { 'x-internal-token': token },
  });
  if (!res.ok) return { providers: [], done: null, eligible: [] };

  const text = await res.text();
  const providers: IocProviderResult[] = [];
  let done: IocDoneEvent | null = null;
  let eligible: string[] = [];

  // SSE format: "event: X\ndata: {...}\n\n" — split on double-newline for events
  const events = text.split('\n\n');
  for (const evt of events) {
    let eventType = '';
    let eventData = '';
    for (const line of evt.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7);
      else if (line.startsWith('data: ')) eventData = line.slice(6);
    }
    if (!eventData) continue;
    try {
      const data = JSON.parse(eventData);
      if (eventType === 'meta' || data.providers) {
        eligible = data.providers ?? eligible;
      } else if (eventType === 'result' || data.source) {
        providers.push(data as IocProviderResult);
      } else if (eventType === 'done' || (data.verdict && data.contributing !== undefined)) {
        done = data as IocDoneEvent;
      }
    } catch {
      /* skip malformed frame */
    }
  }

  return { providers, done, eligible };
}

// ── Telegram leaks ───────────────────────────────────────────────────────

const UA = 'pranithjain-hunt-v2/1.0 (https://pranithjain.qzz.io)';

async function checkTelegramLeaks(db: D1Database, value: string, type: string): Promise<TelegramHit[]> {
  try {
    if (type === 'email') {
      const domain = value.split('@')[1];
      const rows = await db
        .prepare(
          'SELECT channel_name, message_text, collected_at FROM telegram_leak_entries WHERE domains_found LIKE ? LIMIT 20'
        )
        .bind(`%${domain}%`)
        .all();
      return (rows.results ?? []).map((r) => ({
        channel: (r as Record<string, unknown>).channel_name as string,
        message: (((r as Record<string, unknown>).message_text as string) ?? '').slice(0, 200),
        date: (r as Record<string, unknown>).collected_at as string,
      }));
    }
    if (type === 'domain' || type === 'ip') {
      const like = `%${value}%`;
      const rows = await db
        .prepare(
          'SELECT channel_name, message_text, collected_at FROM telegram_leak_entries WHERE domains_found LIKE ? LIMIT 20'
        )
        .bind(like)
        .all();
      return (rows.results ?? []).map((r) => ({
        channel: (r as Record<string, unknown>).channel_name as string,
        message: (((r as Record<string, unknown>).message_text as string) ?? '').slice(0, 200),
        date: (r as Record<string, unknown>).collected_at as string,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// ── Breach data ──────────────────────────────────────────────────────────

async function checkHudsonRock(value: string, isEmail: boolean): Promise<BreachHit[]> {
  if (!isEmail) return [];
  try {
    const res = await fetch(
      `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent(value)}`,
      {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[] };
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    if (count > 0) {
      return [
        {
          name: 'HudsonRock stealer logs',
          source: 'hudsonrock',
          description: `${count} stealer infections found`,
        },
      ];
    }
    return [];
  } catch {
    return [];
  }
}

async function checkBreaches(value: string, type: string): Promise<BreachHit[]> {
  const isEmail = type === 'email';
  const results = await Promise.allSettled([checkHudsonRock(value, isEmail)]);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// ── Provider results → HuntV2Response hits ───────────────────────────────

function providerResultsToHits(collected: IocProviderResult[]): ProviderHit[] {
  return collected
    .filter((r) => r.status === 'ok' && (r.verdict !== 'unknown' || r.score > 0))
    .map((r) => ({
      source: r.source,
      verdict: r.verdict as ProviderHit['verdict'],
      score: r.score,
      description:
        Object.entries(r.raw_summary)
          .filter(([, v]) => typeof v === 'string' && v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')
          .slice(0, 200) || `${r.source} check`,
      tags: r.tags,
    }));
}

// ── Composite scoring ────────────────────────────────────────────────────

function computeScore(
  providers: ProviderHit[],
  telegramCount: number,
  breachCount: number
): {
  score: number;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  summary: string[];
} {
  const summary: string[] = [];
  const malProviders = providers.filter((p) => p.verdict === 'malicious');
  const suspProviders = providers.filter((p) => p.verdict === 'suspicious');
  const maxProviderScore = providers.length ? Math.max(...providers.map((p) => p.score)) : 0;

  let score = maxProviderScore;
  let verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown' = 'unknown';
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (providers.length > 0) {
    summary.push(`${providers.length} IOC provider(s) returned data (max score: ${maxProviderScore})`);
    score = Math.max(score, 40);
  }
  if (malProviders.length > 0) {
    summary.push(`${malProviders.length} provider(s) gave a malicious verdict`);
    score = Math.max(score, 75);
  }
  if (suspProviders.length > 0) {
    summary.push(`${suspProviders.length} provider(s) flagged as suspicious`);
    score = Math.max(score, 45);
  }
  if (telegramCount > 0) {
    summary.push(`Found in ${telegramCount} Telegram leak entr${telegramCount === 1 ? 'y' : 'ies'}`);
    score = Math.max(score, 50);
  }
  if (breachCount > 0) {
    summary.push(`Appears in ${breachCount} breach databas${breachCount === 1 ? 'e' : 'es'}`);
    score = Math.max(score, 60);
  }

  if (score >= 70) verdict = 'malicious';
  else if (score >= 40) verdict = 'suspicious';
  else if (score < 20) verdict = 'clean';

  const dataPoints = providers.length + telegramCount + breachCount;
  if (dataPoints >= 5) confidence = 'high';
  else if (dataPoints >= 2) confidence = 'medium';

  if (!summary.length) summary.push('No threat intelligence hits found');

  return { score, verdict, confidence, summary };
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function huntV2Handler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (!q || q.length < 3) return c.json({ error: 'query too short' }, 400);

  const type = detectType(q);
  if (type === 'unknown') return c.json({ error: 'unrecognized indicator type' }, 400);

  try {
    const [iocCheck, telegram, breaches, whois, certs] = await Promise.all([
      selfFetchIocCheck(q, c.env).catch(() => ({
        providers: [] as IocProviderResult[],
        done: null,
        eligible: [] as string[],
      })),
      db ? checkTelegramLeaks(db, q, type).catch(() => [] as TelegramHit[]) : Promise.resolve([] as TelegramHit[]),
      checkBreaches(q, type).catch(() => [] as BreachHit[]),
      type === 'domain' ? safeNullLog('rdap-lookup', rdapLookup(q)).catch(() => null) : Promise.resolve(null),
      type === 'domain' ? ctLogs(q).catch(() => []) : Promise.resolve([]),
    ]);

    const hits = providerResultsToHits(iocCheck.providers);
    const composite = computeScore(hits, telegram.length, breaches.length);
    const certSubjects = [...new Set(certs.flatMap((c) => c.subjects))].slice(0, 10);

    const response: HuntV2Response = {
      q,
      type,
      ioc_providers: {
        hits,
        malicious_count: hits.filter((p) => p.verdict === 'malicious').length,
        max_score: hits.length ? Math.max(...hits.map((p) => p.score)) : 0,
        total_checked: iocCheck.eligible.length,
      },
      telegram_leaks: { hits: telegram.slice(0, 10), count: telegram.length },
      breach_data: { hits: breaches.slice(0, 10), count: breaches.length },
      whois: whois
        ? Object.fromEntries(
            Object.entries(whois).filter(([_, v]) => v != null && !(Array.isArray(v) && v.length === 0))
          )
        : null,
      cert_logs: { count: certs.length, recent: certSubjects },
      composite,
    };

    return c.json(response, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'hunt v2 failed' }, 500);
  }
}
