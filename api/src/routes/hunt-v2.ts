/**
 * Hunt v2 handler — deep-dive investigation across the full IOC provider
 * suite, Telegram leaks, breach databases, WHOIS, and certificate logs.
 *
 * Runs the same provider adapters as /api/v1/ioc/check but without the
 * SSE streaming layer — collects all results and returns a single JSON.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { safeNullLog } from '../lib/safe-catch';
import { detectType } from '../lib/indicator';
import type { Indicator } from '../providers/types';
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from '../lib/circuit-breaker';
import type { ProviderResult, ProviderId } from '../providers/types';
import { ADAPTERS, buildProviderEnv, PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from '../providers';

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

// ── Provider fan-out (no cache — avoids Cache API issues) ────────────────

const PROVIDER_CHUNK_SIZE = 10;

async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>, size: number): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.allSettled(chunk.map(fn));
  }
}

async function runProviders(indicator: Indicator, env: Env): Promise<ProviderResult[]> {
  const eligible = (Object.keys(ADAPTERS) as ProviderId[]).filter((p) => PROVIDER_SUPPORT[p].includes(indicator.type));
  const providerEnv = buildProviderEnv(env);
  const collected: ProviderResult[] = [];

  await runChunked(
    eligible,
    async (p) => {
      if (isCircuitOpen(p)) {
        collected.push({
          source: p,
          status: 'unsupported',
          score: 0,
          verdict: 'unknown',
          raw_summary: {},
          tags: ['circuit-open'],
          fetched_at: new Date().toISOString(),
          cached: false,
        });
        return;
      }
      const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
      try {
        const r = await ADAPTERS[p](indicator, providerEnv, signal);
        collected.push(r);
        if (r.status === 'ok') await recordProviderSuccess(p);
        else recordProviderFailure(p);
      } catch (err) {
        recordProviderFailure(p);
        collected.push({
          source: p,
          status: 'error',
          score: 0,
          verdict: 'unknown',
          raw_summary: {},
          tags: [],
          error: err instanceof Error ? err.message : String(err),
          fetched_at: new Date().toISOString(),
          cached: false,
        });
      }
    },
    PROVIDER_CHUNK_SIZE
  );

  return collected;
}

// ── Provider results → HuntV2Response hits ───────────────────────────────

function providerResultsToHits(collected: ProviderResult[]): ProviderHit[] {
  return collected
    .filter((r) => r.status === 'ok' && (r.verdict !== 'unknown' || r.score > 0))
    .map((r) => ({
      source: r.source,
      verdict: r.verdict,
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

  const indicator: Indicator = { type, value: q };

  try {
    const [collected, telegram, breaches, whois, certs] = await Promise.all([
      runProviders(indicator, c.env).catch(() => [] as ProviderResult[]),
      db ? checkTelegramLeaks(db, q, type).catch(() => [] as TelegramHit[]) : Promise.resolve([] as TelegramHit[]),
      checkBreaches(q, type).catch(() => [] as BreachHit[]),
      type === 'domain' ? safeNullLog('rdap-lookup', rdapLookup(q)).catch(() => null) : Promise.resolve(null),
      type === 'domain' ? ctLogs(q).catch(() => []) : Promise.resolve([]),
    ]);

    const hits = providerResultsToHits(collected);
    const composite = computeScore(hits, telegram.length, breaches.length);
    const certSubjects = [...new Set(certs.flatMap((c) => c.subjects))].slice(0, 10);

    const response: HuntV2Response = {
      q,
      type,
      ioc_providers: {
        hits,
        malicious_count: hits.filter((p) => p.verdict === 'malicious').length,
        max_score: hits.length ? Math.max(...hits.map((p) => p.score)) : 0,
        total_checked: collected.length,
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
