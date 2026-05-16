/**
 * Client for /api/v1/feeds/ioc-summary
 */

export type IocType = 'url' | 'domain' | 'ipv4' | 'hash' | 'cve';
export type SourceId =
  | 'urlhaus'
  | 'malwarebazaar'
  | 'threatfox'
  | 'openphish'
  | 'cisa-kev'
  | 'blocklist-de'
  | 'binary-defense'
  | 'ipsum'
  | 'phishing-army'
  | 'tweetfeed'
  | 'bitwire'
  | 'malwareworld';

export interface IocEntry {
  type: IocType;
  value: string;
  context?: string;
  timestamp?: string;
}

export interface IocFeedSummary {
  source: SourceId;
  source_name: string;
  fetched_at: string;
  count: number;
  total_in_feed?: number;
  entries: IocEntry[];
  cache_control_seconds: number;
}

export interface FeedSourceMeta {
  id: SourceId;
  label: string;
  iocType: string;
}

export const FEED_SOURCES: FeedSourceMeta[] = [
  { id: 'urlhaus', label: 'URLhaus', iocType: 'url' },
  { id: 'malwarebazaar', label: 'MalwareBazaar', iocType: 'hash' },
  { id: 'threatfox', label: 'ThreatFox', iocType: 'mixed' },
  { id: 'openphish', label: 'OpenPhish', iocType: 'url' },
  { id: 'cisa-kev', label: 'CISA KEV', iocType: 'cve' },
  { id: 'blocklist-de', label: 'Blocklist.de', iocType: 'ipv4' },
  { id: 'binary-defense', label: 'Binary Defense', iocType: 'ipv4' },
  { id: 'ipsum', label: 'Ipsum (consensus)', iocType: 'ipv4' },
  { id: 'phishing-army', label: 'Phishing Army', iocType: 'domain' },
  { id: 'tweetfeed', label: 'TweetFeed', iocType: 'mixed' },
  { id: 'bitwire', label: 'Bitwire Blocklist', iocType: 'ipv4' },
  { id: 'malwareworld', label: 'MalwareWorld', iocType: 'ipv4' },
];

export async function fetchIocFeed(source: SourceId): Promise<IocFeedSummary> {
  const url = `/api/v1/feeds/ioc-summary?source=${encodeURIComponent(source)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<IocFeedSummary>;
}
