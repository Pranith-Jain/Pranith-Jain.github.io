import type { Context } from 'hono';
import type { Env } from '../env';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { safeNullLog } from '../lib/safe-catch';

// ── Types ────────────────────────────────────────────────────────────────

interface ProviderHit {
  source: string;
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  score: number;
  description: string;
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

// ── IOC provider checks ──────────────────────────────────────────────────

const UA = 'pranithjain-hunt-v2/1.0 (https://pranithjain.qzz.io)';

async function checkThreatfox(value: string): Promise<ProviderHit | null> {
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ query: 'search_ioc', search_term: value }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { query_status: string; data?: unknown[] };
    if (data.query_status === 'no_result' || !data.data?.length) return null;
    return { source: 'ThreatFox', verdict: 'malicious', score: 90, description: 'IOC listed in ThreatFox' };
  } catch {
    return null;
  }
}

async function checkUrlhaus(value: string): Promise<ProviderHit | null> {
  try {
    const res = await fetch(`https://urlhaus-api.abuse.ch/v1/url/`, {
      method: 'POST',
      body: new URLSearchParams({ url: value }),
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { query_status?: string };
    if (data.query_status === 'no_results' || data.query_status === 'invalid_url') return null;
    return { source: 'URLhaus', verdict: 'malicious', score: 90, description: 'URL listed in URLhaus' };
  } catch {
    return null;
  }
}

async function checkPhishingArmy(value: string): Promise<ProviderHit | null> {
  try {
    const res = await fetch(`https://phishing.army/download/phishing_army_blocklist.txt`, {
      headers: { 'user-agent': UA },
      cf: { cacheTtl: 600, cacheEverything: true },
      // The blocklist is cached at the CF edge (cacheTtl: 600) but the
      // cold-cache miss can stall on a slow egress. 8s matches the
      // other abuse.ch calls in this file.
      signal: AbortSignal.timeout(8_000),
    } as RequestInit);
    if (!res.ok) return null;
    const list = await res.text();
    if (list.split('\n').some((l) => l.trim().toLowerCase() === value.toLowerCase())) {
      return { source: 'Phishing Army', verdict: 'malicious', score: 85, description: 'Domain in phishing blocklist' };
    }
    return null;
  } catch {
    return null;
  }
}

async function checkGraphDB(db: D1Database, value: string, type: string): Promise<ProviderHit | null> {
  try {
    const nodeType =
      type === 'email' ? 'domain' : type === 'ip' ? 'ip' : type === 'hash' ? 'hash' : type === 'url' ? 'url' : 'domain';
    const lookupValue = type === 'email' ? value.split('@')[1] : value;
    const row = await db
      .prepare('SELECT confidence, sources FROM graph_nodes WHERE type = ? AND value = ? LIMIT 1')
      .bind(nodeType, lookupValue)
      .first<{ confidence: number; sources: string }>();
    if (!row) return null;
    const sources = JSON.parse(row.sources) as string[];
    return {
      source: `Graph DB (${sources.join(', ')})`,
      verdict: row.confidence >= 70 ? 'malicious' : 'suspicious',
      score: row.confidence,
      description: `Known IOC in graph database (confidence: ${row.confidence})`,
    };
  } catch {
    return null;
  }
}

async function checkProviders(db: D1Database | undefined, value: string, type: string): Promise<ProviderHit[]> {
  const checks: Promise<ProviderHit | null>[] = [checkThreatfox(value)];
  if (type === 'url') checks.push(checkUrlhaus(value));
  if (type === 'domain') checks.push(checkPhishingArmy(value));
  if (db) checks.push(checkGraphDB(db, value, type));
  const results = await Promise.allSettled(checks);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter((h): h is ProviderHit => h !== null);
}

// ── Telegram leaks ───────────────────────────────────────────────────────

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
  const maxProviderScore = providers.length ? Math.max(...providers.map((p) => p.score)) : 0;

  let score = maxProviderScore;
  let verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown' = 'unknown';
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (providers.length > 0) {
    summary.push(`${providers.length} IOC provider(s) returned hits (max score: ${maxProviderScore})`);
    score = Math.max(score, 40);
  }
  if (malProviders.length > 0) {
    summary.push(`${malProviders.length} provider(s) gave a malicious verdict`);
    score = Math.max(score, 75);
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

// ── Type detection ───────────────────────────────────────────────────────

function detectType(value: string): string {
  const lower = value.toLowerCase().trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return 'email';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(lower)) return 'ip';
  if (/^[a-f0-9]{32}$/i.test(lower) || /^[a-f0-9]{40}$/i.test(lower) || /^[a-f0-9]{64}$/i.test(lower)) return 'hash';
  if (/^(https?:\/\/)/i.test(lower)) return 'url';
  if (/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(lower)) return 'domain';
  return 'unknown';
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function huntV2Handler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (!q || q.length < 3) return c.json({ error: 'query too short' }, 400);

  const type = detectType(q);

  try {
    const [providers, telegram, breaches, whois, certs] = await Promise.all([
      checkProviders(db, q, type),
      db ? checkTelegramLeaks(db, q, type) : Promise.resolve([] as TelegramHit[]),
      checkBreaches(q, type),
      type === 'domain' ? safeNullLog('rdap-lookup', rdapLookup(q)) : Promise.resolve(null),
      type === 'domain' ? ctLogs(q).catch(() => []) : Promise.resolve([]),
    ]);

    const composite = computeScore(providers, telegram.length, breaches.length);
    const certSubjects = [...new Set(certs.flatMap((c) => c.subjects))].slice(0, 10);

    const response: HuntV2Response = {
      q,
      type,
      ioc_providers: {
        hits: providers,
        malicious_count: providers.filter((p) => p.verdict === 'malicious').length,
        max_score: providers.length ? Math.max(...providers.map((p) => p.score)) : 0,
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
