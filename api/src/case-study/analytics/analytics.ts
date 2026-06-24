import type { CaseStudyType } from '../types';

/** Engagement metrics for one post on one platform. All fields optional —
 *  different platforms expose different numbers, and manual entry may be
 *  partial. */
export interface SocialMetrics {
  impressions?: number;
  likes?: number;
  reposts?: number; // retweets / shares
  replies?: number; // comments
  clicks?: number;
}

export interface MetricsRecord {
  slug: string;
  platform: 'twitter' | 'linkedin' | 'instagram';
  type: CaseStudyType;
  postUrl?: string;
  metrics: SocialMetrics;
  fetchedAt: string; // ISO
}

export interface TypePerformance {
  type: CaseStudyType;
  posts: number;
  totalEngagement: number;
  avgEngagement: number;
  totalImpressions: number;
}

/**
 * Weighted engagement score. Interactions that take more effort signal more:
 * a reply > a repost > a like. Impressions are reach (counted separately), not
 * engagement, so they don't enter the score.
 */
export function engagementScore(m: SocialMetrics): number {
  return (m.likes ?? 0) + (m.reposts ?? 0) * 2 + (m.replies ?? 0) * 3 + (m.clicks ?? 0);
}

/**
 * Aggregate metrics by content type → the "what performs" signal that feeds
 * the iteration loop. Sorted by average engagement, best type first.
 */
export function computeTypePerformance(records: MetricsRecord[]): TypePerformance[] {
  const byType = new Map<CaseStudyType, { posts: number; eng: number; imp: number }>();
  for (const r of records) {
    const cur = byType.get(r.type) ?? { posts: 0, eng: 0, imp: 0 };
    cur.posts += 1;
    cur.eng += engagementScore(r.metrics);
    cur.imp += r.metrics.impressions ?? 0;
    byType.set(r.type, cur);
  }
  const out: TypePerformance[] = [];
  for (const [type, v] of byType) {
    out.push({
      type,
      posts: v.posts,
      totalEngagement: v.eng,
      avgEngagement: v.posts > 0 ? v.eng / v.posts : 0,
      totalImpressions: v.imp,
    });
  }
  out.sort((a, b) => b.avgEngagement - a.avgEngagement);
  return out;
}
