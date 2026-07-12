/**
 * Threat Landscape-style STIX Bundles API.
 *
 * PostgREST-style endpoint for querying STIX 2.1 intelligence bundles.
 *
 * GET /api/v1/stix_bundles
 *   ?select=bundle_id,source_type,threat_actors,malware_names,api_created_at
 *   &source_type=eq.osint
 *   &threat_actors=cs.{APT29}
 *   &sectors=cs.{Healthcare}
 *   &stix_latest_at=gte.2026-01-01T00:00:00Z
 *   &order=api_created_at.desc
 *   &limit=10
 *   &offset=0
 *
 * Range header: Range: 0-9
 *
 * Returns JSON array of matching bundles with Content-Range header.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { parsePostgrestQuery } from '../lib/postgrest-filter';

const STIX_BUNDLES_TABLE = 'intel_bundles';

/** Map from API column names to D1 column names. */
const COLUMN_MAP: Record<string, string> = {
  bundle_id: 'id',
  source_type: 'source_type',
  seq_id: 'id',
  title: 'title',
  summary: 'title',
  api_created_at: 'created_at',
  stix_created_at: 'created_at',
  stix_published_at: 'published_at',
  stix_latest_at: 'updated_at',
  threat_actors: 'threat_actor_names',
  malware_names: 'malware_names',
  campaigns: 'campaign_names',
  sectors: 'sector_names',
  countries_target: 'country_targets',
  countries_source: 'country_sources',
  vulnerabilities: 'vulnerability_ids',
  indicators_ipv4: 'indicator_ipv4',
  indicators_ipv6: 'indicator_ipv6',
  indicators_domain: 'indicator_domain',
  indicators_url: 'indicator_url',
  indicators_hash_sha256: 'indicator_sha256',
  victims: 'title',
  attack_patterns: 'title',
  identities: 'source_id',
  intrusion_sets: 'source_id',
  locations: 'country_targets',
};

const DEFAULT_SELECT = [
  'id AS bundle_id',
  'source_id',
  'item_ref',
  'source_type',
  'title',
  'published_at AS stix_published_at',
  'created_at AS api_created_at',
  'updated_at AS stix_latest_at',
  'ioc_count',
  'actor_count',
  'malware_count',
];

/** Build a SELECT expression for requested columns. */
function buildSelectExpression(select?: string[]): string {
  if (!select?.length) return DEFAULT_SELECT.join(', ');
  return select
    .map((col) => {
      const dbCol = COLUMN_MAP[col] ?? col;
      return col === dbCol ? dbCol : `${dbCol} AS ${col}`;
    })
    .join(', ');
}

export async function stixBundlesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ error: 'database_unavailable' }, 503);

  const query = parsePostgrestQuery(
    new URLSearchParams(c.req.query() as Record<string, string>),
    c.req.header('Range')
  );
  const selectExpr = buildSelectExpression(query.select);

  let sql = `SELECT ${selectExpr} FROM ${STIX_BUNDLES_TABLE} b`;
  const bindings: unknown[] = [];

  // Build WHERE from filters
  if (query.filters.length > 0) {
    const whereClauses: string[] = [];
    for (const f of query.filters) {
      const col = COLUMN_MAP[f.column] ?? f.column;
      switch (f.op) {
        case 'eq':
          whereClauses.push(`b.${col} = ?`);
          bindings.push(f.value);
          break;
        case 'neq':
          whereClauses.push(`b.${col} != ?`);
          bindings.push(f.value);
          break;
        case 'gt':
          whereClauses.push(`b.${col} > ?`);
          bindings.push(f.value);
          break;
        case 'gte':
          whereClauses.push(`b.${col} >= ?`);
          bindings.push(f.value);
          break;
        case 'lt':
          whereClauses.push(`b.${col} < ?`);
          bindings.push(f.value);
          break;
        case 'lte':
          whereClauses.push(`b.${col} <= ?`);
          bindings.push(f.value);
          break;
        case 'like':
          whereClauses.push(`b.${col} LIKE ?`);
          bindings.push(f.value);
          break;
        case 'ilike':
          whereClauses.push(`LOWER(b.${col}) LIKE LOWER(?)`);
          bindings.push(f.value);
          break;
        case 'is': {
          const v = f.value;
          if (v === null) whereClauses.push(`b.${col} IS NULL`);
          else if (String(v).toLowerCase() === 'not.null') whereClauses.push(`b.${col} IS NOT NULL`);
          else {
            whereClauses.push(`b.${col} = ?`);
            bindings.push(v);
          }
          break;
        }
        case 'in': {
          const arr = f.value as unknown[];
          whereClauses.push(`b.${col} IN (${arr.map(() => '?').join(',')})`);
          bindings.push(...arr);
          break;
        }
        case 'cs': {
          // Array contains: JSON array column (stored as TEXT, e.g. '["APT29"]')
          const arr = f.value as string[];
          const subClauses = arr.map(() => `b.${col} LIKE ?`);
          whereClauses.push(`(${subClauses.join(' AND ')})`);
          for (const v of arr) bindings.push(`%"${escapeJsonString(v)}"%`);
          break;
        }
        case 'cd': {
          const arr = f.value as string[];
          whereClauses.push(`b.${col} IS NOT NULL`);
          bindings.push(arr);
          break;
        }
      }
    }
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
  }

  // Count query for Content-Range
  const countSql = `SELECT COUNT(*) as total FROM ${STIX_BUNDLES_TABLE} ${sql.includes('WHERE') ? sql.slice(sql.indexOf('WHERE')) : ''}`;
  const countRow = await db
    .prepare(countSql)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = countRow?.total ?? 0;

  // ORDER
  if (query.order) {
    const col = COLUMN_MAP[query.order.column] ?? query.order.column;
    sql += ` ORDER BY b.${col} ${query.order.dir.toUpperCase()}`;
  } else {
    sql += ' ORDER BY b.created_at DESC';
  }

  // LIMIT / OFFSET
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  const rows = await db
    .prepare(sql)
    .bind(...bindings)
    .all();
  const response = c.json(rows.results, 200, {
    'Content-Range': `${offset}-${offset + rows.results.length - 1}/${total}`,
    'Range-Unit': 'items',
  });
  return response;
}

function escapeJsonString(s: string): string {
  return s.replace(/[\\"]/g, '\\$&');
}
