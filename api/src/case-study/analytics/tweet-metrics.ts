import type { SocialMetrics } from './analytics';

/** Extract the numeric tweet id from a status URL, or null. */
export function extractTweetId(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/status\/(\d+)/);
  return m ? m[1]! : null;
}

interface XPublicMetrics {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
  impression_count?: number;
}

/**
 * Fetch a tweet's public engagement metrics via X API v2 using an app-only
 * Bearer token (public_metrics is readable without user context). Best-effort:
 * returns null on any error so the analytics refresh never throws.
 */
export async function fetchTweetMetrics(
  tweetId: string,
  bearerToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<SocialMetrics | null> {
  try {
    const url = `https://api.twitter.com/2/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { public_metrics?: XPublicMetrics } };
    const pm = j.data?.public_metrics;
    if (!pm) return null;
    return {
      likes: pm.like_count ?? 0,
      reposts: (pm.retweet_count ?? 0) + (pm.quote_count ?? 0),
      replies: pm.reply_count ?? 0,
      impressions: pm.impression_count ?? 0,
    };
  } catch {
    return null;
  }
}
