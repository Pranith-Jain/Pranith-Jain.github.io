/**
 * Client for /api/v1/feeds/ioc-summary
 */

export type IocType = 'url' | 'domain' | 'ipv4' | 'hash' | 'cve';
export type SourceId = 'urlhaus' | 'malwarebazaar' | 'threatfox' | 'feodo' | 'openphish' | 'cisa-kev';

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
  { id: 'feodo', label: 'Feodo Tracker', iocType: 'ipv4' },
  { id: 'openphish', label: 'OpenPhish', iocType: 'url' },
  { id: 'cisa-kev', label: 'CISA KEV', iocType: 'cve' },
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
