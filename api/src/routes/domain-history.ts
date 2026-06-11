/**
 * Domain WHOIS History API Routes
 *
 * Provides WHOIS history tracking, ownership change detection, and
 * domain pivoting capabilities inspired by etugen.io's WHOIS History Explorer.
 *
 * Routes:
 *   GET /api/v1/domain/history?domain=example.com
 *   GET /api/v1/domain/history/changes?domain=example.com
 *   GET /api/v1/domain/history/pivot?domain=example.com&type=email
 *   GET /api/v1/domain/history/stats?domain=example.com
 *   GET /api/v1/domain/history/search?email=registrant@example.com
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { rdapLookup } from '../lib/rdap';
import { whoisTcpLookup } from '../lib/whois-tcp';
import {
  storeWhoisSnapshot,
  getWhoisHistory,
  pivotDomains,
  getWhoisStats,
} from '../lib/whois-history';
import { badRequest, internalError } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';

/**
 * GET /api/v1/domain/history?domain=example.com
 *
 * Returns the full WHOIS history for a domain including:
 *   - All historical snapshots
 *   - Detected ownership/registrar/nameserver changes
 *   - Summary statistics
 */
export async function domainHistoryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter is required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    // Fetch current WHOIS and store snapshot.
    const rdap = await rdapLookup(domain);
    if (!rdap.error) {
      await storeWhoisSnapshot(db, domain, rdap, 'rdap');
    }

    // Get full history.
    const history = await getWhoisHistory(db, domain);

    return c.json({
      domain: history.domain,
      current: history.current,
      snapshots: history.snapshots,
      changes: history.changes,
      summary: {
        total_snapshots: history.snapshots.length,
        ownership_transfers: history.ownership_transfers,
        registrar_changes: history.registrar_changes,
        nameserver_changes: history.nameserver_changes,
        first_seen: history.first_seen,
        last_seen: history.last_seen,
      },
    }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/domain/history/changes?domain=example.com
 *
 * Returns only the ownership/infrastructure changes for a domain.
 */
export async function domainChangesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter is required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    const history = await getWhoisHistory(db, domain);

    return c.json({
      domain: history.domain,
      changes: history.changes,
      summary: {
        total_changes: history.changes.length,
        ownership_transfers: history.ownership_transfers,
        registrar_changes: history.registrar_changes,
        nameserver_changes: history.nameserver_changes,
      },
    }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/domain/history/pivot?domain=example.com&type=email
 *
 * Pivot across domains by shared registrant attributes.
 * Returns domains that share the same registrant email, organization,
 * nameservers, or registrar — useful for mapping attacker infrastructure.
 *
 * Pivot types:
 *   - email: Domains with the same registrant email
 *   - org: Domains with the same registrant organization
 *   - nameserver: Domains sharing nameservers
 *   - registrar: Domains with the same registrar
 *   - all: All pivot types combined (default)
 */
export async function domainPivotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter is required');

  const pivotType = (c.req.query('type') ?? 'all') as 'email' | 'org' | 'nameserver' | 'registrar' | 'all';
  if (!['email', 'org', 'nameserver', 'registrar', 'all'].includes(pivotType)) {
    return badRequest(c, 'type must be one of: email, org, nameserver, registrar, all');
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    // Ensure we have at least one snapshot.
    const history = await getWhoisHistory(db, domain);
    if (history.snapshots.length === 0) {
      // Fetch and store first snapshot.
      const rdap = await rdapLookup(domain);
      if (!rdap.error) {
        await storeWhoisSnapshot(db, domain, rdap, 'rdap');
      }
    }

    const pivot = await pivotDomains(db, domain, pivotType);

    return c.json({
      target: pivot.target,
      pivot_type: pivot.pivot_type,
      related_domains: pivot.related_domains,
      total_found: pivot.total_found,
      query_time_ms: pivot.query_time_ms,
    }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/domain/history/stats?domain=example.com
 *
 * Returns WHOIS history statistics for a domain.
 */
export async function domainHistoryStatsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) return badRequest(c, 'domain parameter is required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    const stats = await getWhoisStats(db, domain);

    return c.json({
      domain: domain.toLowerCase(),
      ...stats,
    }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/domain/history/search?email=registrant@example.com
 *
 * Search for domains by registrant email or organization.
 * Useful for finding all domains owned by a specific entity.
 */
export async function domainRegistrantSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email');
  const org = c.req.query('org');

  if (!email && !org) {
    return badRequest(c, 'email or org parameter is required');
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    let query: string;
    let param: string;

    if (email) {
      query = `SELECT domain, registrant_email, registrant_org, registrant_name, first_seen, last_seen, snapshot_count
               FROM domain_registrant_index WHERE registrant_email = ? ORDER BY last_seen DESC LIMIT 100`;
      param = email.toLowerCase();
    } else {
      query = `SELECT domain, registrant_email, registrant_org, registrant_name, first_seen, last_seen, snapshot_count
               FROM domain_registrant_index WHERE registrant_org LIKE ? ORDER BY last_seen DESC LIMIT 100`;
      param = `%${org!.toLowerCase()}%`;
    }

    const results = await db.prepare(query).bind(param).all();

    return c.json({
      query: { email, org },
      domains: results.results ?? [],
      total: (results.results ?? []).length,
    }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

/**
 * POST /api/v1/domain/history/snapshot
 *
 * Manually trigger a WHOIS snapshot for a domain.
 * Useful for pre-populating history or forcing a refresh.
 */
export async function domainSnapshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await safeNullLog('parse-body-domain-history', c.req.json());
  const domain = body?.domain;
  if (!domain) return badRequest(c, 'domain field is required');

  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database unavailable' }, 503);

  try {
    // Try RDAP first, fall back to WHOIS TCP.
    let rdap = await rdapLookup(domain);
    let source = 'rdap';

    if (rdap.error) {
      const tcp = await whoisTcpLookup(domain);
      if (tcp) {
        rdap = tcp;
        source = 'whois-tcp';
      }
    }

    if (rdap.error) {
      return c.json({ error: 'lookup_failed', message: rdap.error }, 502);
    }

    const result = await storeWhoisSnapshot(db, domain, rdap, source);

    return c.json({
      ok: true,
      domain: domain.toLowerCase(),
      source,
      snapshot_id: result.snapshotId,
      changes_detected: result.changesDetected,
    }, 200, {
      'Cache-Control': 'no-store',
    });
  } catch (e) {
    return internalError(c, e);
  }
}
