import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError } from '../lib/api-error';
import { fullDnsLookup, batchDnsLookup, wildcardProbe } from '../lib/dns-lookup';

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export const dnsLookupRouter = new Hono<{ Bindings: Env }>();

dnsLookupRouter.get('/dns/lookup', async (c) => {
  const hostname = c.req.query('hostname')?.trim().toLowerCase();
  if (!hostname || hostname.length > 253 || !HOSTNAME_RE.test(hostname)) {
    return badRequest(c, 'invalid hostname');
  }
  try {
    const result = await fullDnsLookup(hostname);
    return c.json(result, 200, { 'cache-control': 'public, max-age=300' });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
});

dnsLookupRouter.post('/dns/batch', async (c) => {
  let body: { hostnames?: string[] };
  try {
    body = await c.req.json();
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return badRequest(c, 'invalid JSON body');
  }
  const hostnames = body.hostnames;
  if (!Array.isArray(hostnames) || hostnames.length === 0 || hostnames.length > 25) {
    return badRequest(c, 'hostnames must be an array of 1-25 items');
  }
  const invalid = hostnames.filter(
    (h) => typeof h !== 'string' || h.length > 253 || !HOSTNAME_RE.test(h.toLowerCase())
  );
  if (invalid.length > 0) {
    return badRequest(c, `invalid hostnames: ${invalid.slice(0, 5).join(', ')}`);
  }
  try {
    const results = await batchDnsLookup(hostnames.map((h) => h.toLowerCase()));
    return c.json({ results, count: results.length });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
});

dnsLookupRouter.get('/dns/wildcard-probe', async (c) => {
  const domain = c.req.query('domain')?.trim().toLowerCase();
  if (!domain || domain.length > 253 || !HOSTNAME_RE.test(domain)) {
    return badRequest(c, 'invalid domain');
  }
  try {
    const result = await wildcardProbe(domain);
    return c.json(result, 200, { 'cache-control': 'public, max-age=600' });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
});
