import type { Context } from 'hono';
import type { Env } from '../env';

export async function privacyInspectHandler(c: Context<{ Bindings: Env }>) {
  // Cloudflare populates request.cf in production
  const cf = (c.req.raw as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';

  return c.json({
    ip,
    country: typeof cf.country === 'string' ? cf.country : undefined,
    city: typeof cf.city === 'string' ? cf.city : undefined,
    region: typeof cf.region === 'string' ? cf.region : undefined,
    timezone: typeof cf.timezone === 'string' ? cf.timezone : undefined,
    asn: typeof cf.asn === 'number' ? cf.asn : undefined,
    asOrganization: typeof cf.asOrganization === 'string' ? cf.asOrganization : undefined,
    httpProtocol: typeof cf.httpProtocol === 'string' ? cf.httpProtocol : undefined,
    tlsVersion: typeof cf.tlsVersion === 'string' ? cf.tlsVersion : undefined,
  });
}
