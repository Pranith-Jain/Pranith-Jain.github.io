/**
 * ASN graph pivot — etugen.io/ZerN-style ASN + prefix + abuse lookup
 * for an IP, ASN, or CIDR.
 *
 * Route:
 *   GET /api/v1/asn-graph?ip=1.2.3.4
 *   GET /api/v1/asn-graph?asn=13335
 *   GET /api/v1/asn-graph?cidr=198.51.100.0/24
 *
 * All three inputs are validated up front. The `ip` path also rejects
 * private/reserved ranges via the shared SSRF guards (consistent with
 * `/exposed-host` and the rest of the DFIR stack) — analysts who need to
 * look up internal infra should be on a VPN, not pinging a public route.
 *
 * Caching: 10 minutes at the edge. BGP state moves in minutes-to-hours
 * and RIR allocations move in days, but a stale ASN answer is worse than
 * a fresh one and a 10-min cache still cuts 80%+ of upstream load.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { PRIVATE_IPV4 } from '../lib/ssrf-guard';
import { badRequest, forbidden } from '../lib/api-error';
import { trackEvent, visitorCountry } from '../lib/analytics';
import {
  asnToAsGraph,
  cidrToPrefixGraph,
  ipToAsnGraph,
  type AsGraph,
  type IpGraph,
  type PrefixGraph,
} from '../lib/asn-graph';

const CACHE_TTL_SECONDS = 600; // 10 min — BGP state moves fast

type IpResponseBody = { kind: 'ip'; input: { ip: string }; data: IpGraph; generated_at: string };
type AsnResponseBody = { kind: 'asn'; input: { asn: number }; data: AsGraph; generated_at: string };
type PrefixResponseBody = { kind: 'cidr'; input: { cidr: string }; data: PrefixGraph; generated_at: string };

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isValidIpv4Shape(s: string): boolean {
  if (!IPV4_RE.test(s)) return false;
  return s.split('.').every((o) => {
    const n = Number(o);
    return n >= 0 && n <= 255;
  });
}

function isValidCidrShape(s: string): boolean {
  const parts = s.split('/');
  if (parts.length !== 2) return false;
  const [ip, mask] = parts;
  if (!ip || !mask) return false;
  if (!isValidIpv4Shape(ip)) return false;
  const n = Number(mask);
  return n >= 0 && n <= 32;
}

function parseAsn(s: string): number | null {
  const m = /^AS?(\d+)$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 4294967295) return null;
  return n;
}

export async function asnGraphHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ip = c.req.query('ip')?.trim();
  const asn = c.req.query('asn')?.trim();
  const cidr = c.req.query('cidr')?.trim();
  const provided = [ip, asn, cidr].filter((v): v is string => !!v);

  if (provided.length === 0) {
    return badRequest(c, 'one of ip, asn, or cidr is required');
  }
  if (provided.length > 1) {
    return badRequest(c, 'pass exactly one of ip, asn, or cidr — not multiple');
  }

  // Edge cache. The cache key encodes both the lookup kind AND the
  // normalised value so `/asn-graph?ip=1.2.3.4` and `/asn-graph?asn=1234`
  // can't collide on the same numeric/string value, and so a trailing
  // space on the same query collapses to the same key. The kind prefix
  // is critical — without it, the first request to populate the cache
  // would be served to a different-kind second request, returning
  // e.g. an AsGraph body to a user who asked for kind=ip.
  const lookupKind = ip ? 'ip' : asn ? 'asn' : 'cidr';
  const cacheKey = new Request(`https://asn-graph.internal/${lookupKind}/${provided[0]!.toLowerCase()}`);
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      const cached = (await hit.json()) as IpResponseBody | AsnResponseBody | PrefixResponseBody;
      return c.json(cached, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
    }
  } catch (_catchErr) {
    console.error('asnGraphHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* cache miss is fine; fall through */
  }

  let body: IpResponseBody | AsnResponseBody | PrefixResponseBody;
  let event: string;
  let blocked = false;

  if (ip) {
    event = 'asn_graph_ip';
    if (!isValidIpv4Shape(ip)) {
      return badRequest(c, 'invalid IPv4 address');
    }
    if (PRIVATE_IPV4.test(ip)) {
      blocked = true;
      return forbidden(c, 'private/reserved IP — refusing to perform external lookup');
    }
    const data = await ipToAsnGraph(ip);
    body = { kind: 'ip', input: { ip }, data, generated_at: new Date().toISOString() };
  } else if (asn) {
    event = 'asn_graph_asn';
    const n = parseAsn(asn);
    if (n === null) return badRequest(c, 'invalid ASN — use "13335" or "AS13335"');
    const data = await asnToAsGraph(n);
    body = { kind: 'asn', input: { asn: n }, data, generated_at: new Date().toISOString() };
  } else {
    event = 'asn_graph_cidr';
    if (!cidr || !isValidCidrShape(cidr)) {
      return badRequest(c, 'invalid CIDR — expected "198.51.100.0/24"');
    }
    const data = await cidrToPrefixGraph(cidr);
    body = { kind: 'cidr', input: { cidr }, data, generated_at: new Date().toISOString() };
  }

  if (!blocked) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          trackEvent(c.env, event, {
            indexes: [visitorCountry(c.req.raw)],
          });
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* telemetry is best-effort */
        }
      })()
    );
  }

  // Populate edge cache (best-effort; never block the response).
  c.executionCtx.waitUntil(
    (async () => {
      try {
        await caches.default.put(
          cacheKey,
          new Response(JSON.stringify(body), {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
            },
          })
        );
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* cache writes are non-fatal */
      }
    })()
  );

  return c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
}
