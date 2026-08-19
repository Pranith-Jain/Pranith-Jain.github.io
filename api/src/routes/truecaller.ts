import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, serviceUnavailable } from '../lib/api-error';

const TRUECALLER_BASE = 'https://api.truecaller.com';
const TIMEOUT_MS = 10_000;

export const truecallerRouter = new Hono<{ Bindings: Env }>();

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length <= 10) {
    return `1${digits}`;
  }
  return digits;
}

truecallerRouter.get('/truecaller/lookup', async (c) => {
  const phone = c.req.query('phone');
  if (!phone || !phone.trim()) {
    return badRequest(c, 'Provide ?phone=<phone number>');
  }

  const apiKey = c.env.TRUECALLER_API_KEY;
  if (!apiKey) {
    return serviceUnavailable(c, 'TRUECALLER_API_KEY not set (wrangler secret put TRUECALLER_API_KEY)');
  }

  const normalized = normalizePhone(phone.trim());

  try {
    const t0 = Date.now();
    const res = await fetch(`${TRUECALLER_BASE}/v2/phone/${normalized}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return c.json(
        {
          success: false,
          phone_number: normalized,
          error: `Truecaller returned ${res.status}: ${body.slice(0, 200)}`,
        },
        502
      );
    }

    const data = (await res.json()) as Record<string, unknown>;

    return c.json({
      success: true,
      phone_number: normalized,
      result: {
        phone_number: normalized,
        country_code: data.countryCode,
        carrier: data.carrier,
        number_type: data.numberType,
        name: data.name,
        alt_name: data.altName,
        spam_score: data.spamScore,
        spam_reports: data.spamReports,
        is_spam: data.isSpam,
        city: data.city,
        country: data.country,
        timezone: data.timezone,
        is_truecaller: data.isPresentOnTruecaller,
        last_updated: data.lastUpdated,
        source: 'truecaller',
        ...data,
      },
      provider: 'truecaller',
      generated_at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    return c.json(
      {
        success: false,
        phone_number: normalized,
        error: e instanceof Error ? e.message : String(e),
      },
      502
    );
  }
});
