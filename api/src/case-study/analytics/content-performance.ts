import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { TypePerformance } from './analytics';
import { computeTypePerformance } from './analytics';
import { getAllMetrics } from '../storage/social-metrics';

/** D1 row shape for content_performance table. */
export interface ContentPerformanceRow {
  type: string;
  posts: number;
  avg_engagement: number;
  total_impressions: number;
  top_hook_angle: string | null;
  updated_at: string;
}

/** Upsert performance aggregates for one content type. */
async function upsertPerformance(db: D1Database, row: TypePerformance): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content_performance (type, posts, avg_engagement, total_impressions, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(type) DO UPDATE SET
         posts = excluded.posts,
         avg_engagement = excluded.avg_engagement,
         total_impressions = excluded.total_impressions,
         updated_at = datetime('now')`
    )
    .bind(row.type, row.posts, row.avgEngagement, row.totalImpressions)
    .run();
}

/** Refresh the entire content_performance table from KV metrics blob. */
export async function refreshContentPerformance(db: D1Database, kv: KVNamespace): Promise<{ types: number }> {
  const records = await getAllMetrics(kv);
  const byType = computeTypePerformance(records);
  for (const row of byType) {
    await upsertPerformance(db, row);
  }
  return { types: byType.length };
}

/** Return top-performing content types (sorted by avg_engagement DESC). */
export async function getTopPerformingTypes(db: D1Database, limit = 3): Promise<ContentPerformanceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT type, posts, avg_engagement, total_impressions, top_hook_angle, updated_at
       FROM content_performance
       WHERE posts > 0
       ORDER BY avg_engagement DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<ContentPerformanceRow>();
  return results ?? [];
}

/** Build a human-readable performance note string for LLM prompt injection.
 *  Returns '' when there's no data to report. */
export function buildPerformanceNote(types: ContentPerformanceRow[]): string {
  if (types.length === 0) return '';
  const lines = types.map(
    (t) =>
      `  - "${t.type}" content averages ${t.avg_engagement.toFixed(1)} engagement across ${t.posts} posts` +
      (t.total_impressions > 0 ? ` (${t.total_impressions.toLocaleString()} total impressions)` : '')
  );
  return (
    `\n<audience_data from_previous_posts>\n` +
    `Top-performing content types by engagement:\n` +
    lines.join('\n') +
    `\nPrefer opening angles and framing that match the best-performing type when it aligns with this story. ` +
    `Do not force a type mismatch — performance data is directional, not prescriptive.\n` +
    `</audience_data>`
  );
}
