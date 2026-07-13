import type { Context } from 'hono';
import type { Env } from '../env';

interface HuntTarget {
  value: string;
  type: 'ip' | 'domain' | 'hash' | 'email' | 'url';
  context?: string;
  source?: string;
}

export async function threatHuntHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (!q || q.length < 3) return c.json({ error: 'query too short' }, 400);

  try {
    // Auto-detect type
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    const isDomain = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(q) && !isEmail;
    const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q);

    // Check Telegram leaks for domains/emails
    let telegramLeakHits = 0;
    const breachHits = 0;

    if (db) {
      if (isEmail) {
        const domain = q.split('@')[1];
        const [leakResult] = await Promise.allSettled([
          db
            .prepare('SELECT COUNT(*) as n FROM telegram_leak_entries WHERE domains_found LIKE ?')
            .bind(`%${domain}%`)
            .first<{ n: number }>(),
        ]);
        if (leakResult.status === 'fulfilled') telegramLeakHits = leakResult.value?.n ?? 0;
      } else if (isDomain) {
        const [leakResult] = await Promise.allSettled([
          db
            .prepare('SELECT COUNT(*) as n FROM telegram_leak_entries WHERE domains_found LIKE ?')
            .bind(`%${q}%`)
            .first<{ n: number }>(),
        ]);
        if (leakResult.status === 'fulfilled') telegramLeakHits = leakResult.value?.n ?? 0;
      }
    }

    const type: HuntTarget['type'] = isEmail ? 'email' : isDomain ? 'domain' : isIP ? 'ip' : 'domain';

    return c.json(
      {
        q,
        type,
        telegram_leak_hits: telegramLeakHits,
        breach_hits: breachHits,
        ioc_link: `/api/v1/ioc/check?indicator=${encodeURIComponent(q)}`,
        hunt_link: `/dfir/ioc-check?indicator=${encodeURIComponent(q)}`,
      },
      200,
      { 'Cache-Control': 'public, max-age=30' }
    );
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'hunt failed' }, 500);
  }
}
