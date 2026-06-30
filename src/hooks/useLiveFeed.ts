import { useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';

interface FeedSnapshot {
  feed: string;
  total: number;
  generated_at: string;
}

type LiveFeedMessage =
  | { type: 'connected'; feeds: string[] }
  | { type: 'snapshot'; feed: string; total: number; generated_at: string }
  | {
      type: 'update';
      feed: string;
      total: number;
      delta: number;
      generated_at: string;
      previous_total: number;
      new_total: number;
    };

export interface LiveFeedState {
  feeds: Map<string, FeedSnapshot>;
  connected: boolean;
  totalAcrossFeeds: number;
}

function buildWsUrl(path: string): string {
  const protocol = typeof window !== 'undefined' ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:') : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
  return `${protocol}//${host}${path}`;
}

export function useLiveFeed(): LiveFeedState {
  const [feeds, setFeeds] = useState<Map<string, FeedSnapshot>>(new Map());

  const url = useMemo(() => buildWsUrl('/api/v1/ws/live-feed'), []);

  const { connected } = useWebSocket<LiveFeedMessage>(url, {
    onMessage: useCallback((msg: LiveFeedMessage) => {
      if (msg.type === 'snapshot' || msg.type === 'update') {
        setFeeds((prev) => {
          const next = new Map(prev);
          next.set(msg.feed, { feed: msg.feed, total: msg.total, generated_at: msg.generated_at });
          return next;
        });
      }
    }, []),
    reconnect: true,
    maxReconnectAttempts: 10,
  });

  let totalAcrossFeeds = 0;
  for (const snapshot of feeds.values()) {
    totalAcrossFeeds += snapshot.total;
  }

  return { feeds, connected, totalAcrossFeeds };
}
