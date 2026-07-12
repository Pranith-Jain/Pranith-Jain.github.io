/**
 * Threat Landscape-style Actionable IOCs API.
 *
 * PostgREST-style endpoints for querying indicators of compromise.
 *
 * Full table:
 *   GET /api/v1/actionable_iocs
 *     ?select=ioc_value,ioc_type,valid_until,source_bundle_id
 *     &ioc_type=eq.ipv4
 *     &valid_until=gt.NOW()
 *     &order=seq_id.desc
 *     &limit=20
 *
 * Per-type active endpoints (automatically filtered to valid IOCs):
 *   GET /api/v1/iocs_ipv4?select=ioc,valid_until&order=valid_until.desc
 *   GET /api/v1/iocs_ipv6?select=ioc,valid_until
 *   GET /api/v1/iocs_domain
 *   GET /api/v1/iocs_url
 *   GET /api/v1/iocs_md5
 *   GET /api/v1/iocs_sha1
 *   GET /api/v1/iocs_sha256
 *
 * Each per-type endpoint returns: ioc, valid_until, source_bundle_id
 *
 * Incremental sync:
 *   GET /api/v1/actionable_iocs?seq_id=gt.12345&order=seq_id.asc
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { parsePostgrestQuery } from '../lib/postgrest-filter';

const ACTIONABLE_IOCS_TABLE = 'actionable_iocs';

/** Per-type view names for active IOC endpoints. */
const IOC_TYPE_VIEWS: Record<string, string> = {
  ipv4: 'iocs_ipv4',
  ipv6: 'iocs_ipv6',
  domain: 'iocs_domain',
  url: 'iocs_url',
  md5: 'iocs_md5',
  sha1: 'iocs_sha1',
  sha256: 'iocs_sha256',
};

// Allowed ioc_type values for validation
const VALID_IOC_TYPES = new Set(['ipv4', 'ipv6', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256']);

/** Column mapping for the main actionable_iocs table. */
const COLUMN_MAP: Record<string, string> = {
  ioc_value: 'ioc_value',
  ioc_type: 'ioc_type',
  valid_until: 'valid_until',
  source_bundle_id: 'source_bundle_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  seq_id: 'seq_id',
};

const DEFAULT_SELECT = ['ioc_value', 'ioc_type', 'valid_until', 'source_bundle_id', 'created_at', 'seq_id'];

async function queryIocs(
  db: D1Database,
  tableOrView: string,
  query: ReturnType<typeof parsePostgrestQuery>,
  columnMap: Record<string, string> = COLUMN_MAP
): Promise<Response> {
  const selectCols = query.select?.length
    ? query.select.map((c) => columnMap[c] ?? c).join(', ')
    : DEFAULT_SELECT.join(', ');

  let sql = `SELECT ${selectCols} FROM ${tableOrView}`;
  const bindings: unknown[] = [];

  // Build WHERE
  if (query.filters.length > 0) {
    const clauses: string[] = [];
    for (const f of query.filters) {
      const col = columnMap[f.column] ?? f.column;
      switch (f.op) {
        case 'eq':
          clauses.push(`${col} = ?`);
          bindings.push(f.value);
          break;
        case 'neq':
          clauses.push(`${col} != ?`);
          bindings.push(f.value);
          break;
        case 'gt':
          clauses.push(`${col} > ?`);
          bindings.push(f.value);
          break;
        case 'gte':
          clauses.push(`${col} >= ?`);
          bindings.push(f.value);
          break;
        case 'lt':
          clauses.push(`${col} < ?`);
          bindings.push(f.value);
          break;
        case 'lte':
          clauses.push(`${col} <= ?`);
          bindings.push(f.value);
          break;
        case 'is': {
          const v = f.value;
          if (v === null) clauses.push(`${col} IS NULL`);
          else if (String(v).toLowerCase() === 'not.null') clauses.push(`${col} IS NOT NULL`);
          else {
            clauses.push(`${col} = ?`);
            bindings.push(v);
          }
          break;
        }
        case 'in': {
          const arr = f.value as unknown[];
          clauses.push(`${col} IN (${arr.map(() => '?').join(',')})`);
          bindings.push(...arr);
          break;
        }
        case 'like':
          clauses.push(`${col} LIKE ?`);
          bindings.push(f.value);
          break;
        case 'ilike':
          clauses.push(`LOWER(${col}) LIKE LOWER(?)`);
          bindings.push(f.value);
          break;
      }
    }
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
  }

  // ORDER
  if (query.order) {
    const col = columnMap[query.order.column] ?? query.order.column;
    sql += ` ORDER BY ${col} ${query.order.dir.toUpperCase()}`;
  } else {
    sql += ' ORDER BY seq_id DESC';
  }

  // LIMIT / OFFSET
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  // Count
  let total = 0;
  try {
    const countSql = `SELECT COUNT(*) as total FROM ${tableOrView}${sql.includes('WHERE') ? ' ' + sql.slice(sql.indexOf('WHERE'), sql.indexOf('ORDER BY') > -1 ? sql.indexOf('ORDER BY') : undefined) : ''}`;
    const countRow = await db
      .prepare(countSql.replace(/ORDER BY.*$/, '').trim())
      .bind(...bindings)
      .first<{ total: number }>();
    total = countRow?.total ?? 0;
  } catch {
    /* best-effort count */
  }

  const rows = await db
    .prepare(sql)
    .bind(...bindings)
    .all();
  return new Response(JSON.stringify(rows.results), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': `${offset}-${offset + rows.results.length - 1}/${total}`,
      'Range-Unit': 'items',
    },
  });
}

/** GET /api/v1/actionable_iocs */
export async function actionableIocsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database_unavailable' }, 503);

  const query = parsePostgrestQuery(
    new URLSearchParams(c.req.query() as Record<string, string>),
    c.req.header('Range')
  );
  return queryIocs(db, ACTIONABLE_IOCS_TABLE, query);
}

/** GET /api/v1/iocs_<type> for each IOC type. */
export function createIocTypeHandler(iocType: string) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    const db = c.env.BRIEFINGS_DB;
    if (!db) return c.json({ error: 'database_unavailable' }, 503);

    if (!VALID_IOC_TYPES.has(iocType)) {
      return c.json({ error: `unknown ioc_type "${iocType}"` }, 400);
    }

    const viewName = IOC_TYPE_VIEWS[iocType];
    if (!viewName) return c.json({ error: `no view for type "${iocType}"` }, 400);

    const query = parsePostgrestQuery(
      new URLSearchParams(c.req.query() as Record<string, string>),
      c.req.header('Range')
    );
    const perTypeColumnMap: Record<string, string> = {
      ioc: 'ioc',
      valid_until: 'valid_until',
      source_bundle_id: 'source_bundle_id',
    };

    const selectCols = (query.select?.length ? query.select : ['ioc', 'valid_until', 'source_bundle_id'])
      .map((c) => perTypeColumnMap[c] ?? c)
      .join(', ');

    let sql = `SELECT ${selectCols} FROM ${viewName}`;
    const bindings: unknown[] = [];

    if (query.filters.length > 0) {
      const clauses: string[] = [];
      for (const f of query.filters) {
        const col = perTypeColumnMap[f.column] ?? f.column;
        switch (f.op) {
          case 'eq':
            clauses.push(`${col} = ?`);
            bindings.push(f.value);
            break;
          case 'neq':
            clauses.push(`${col} != ?`);
            bindings.push(f.value);
            break;
          case 'gt':
            clauses.push(`${col} > ?`);
            bindings.push(f.value);
            break;
          case 'gte':
            clauses.push(`${col} >= ?`);
            bindings.push(f.value);
            break;
          case 'lt':
            clauses.push(`${col} < ?`);
            bindings.push(f.value);
            break;
          case 'lte':
            clauses.push(`${col} <= ?`);
            bindings.push(f.value);
            break;
          case 'is': {
            const v = f.value;
            if (v === null) clauses.push(`${col} IS NULL`);
            else if (String(v).toLowerCase() === 'not.null') clauses.push(`${col} IS NOT NULL`);
            else {
              clauses.push(`${col} = ?`);
              bindings.push(v);
            }
            break;
          }
        }
      }
      if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    }

    if (query.order) {
      sql += ` ORDER BY ${perTypeColumnMap[query.order.column] ?? query.order.column} ${query.order.dir.toUpperCase()}`;
    } else {
      sql += ' ORDER BY valid_until DESC';
    }

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const rows = await db
      .prepare(sql)
      .bind(...bindings)
      .all();
    return new Response(JSON.stringify(rows.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
