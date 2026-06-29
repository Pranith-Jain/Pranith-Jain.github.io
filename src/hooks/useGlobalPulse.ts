import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

interface PulseSnapshot {
  id: string;
  kind: string;
  title: string;
  severity: string;
  timestamp: string;
}

type GlobalPulseMessage =
  | { type: 'connected' }
  | { type: 'snapshot'; events: PulseSnapshot[]; generated_at: string }
  | {
      type: 'update';
      added: PulseSnapshot[];
      removed: string[];
      total: number;
      generated_at: string;
    };

export interface GlobalPulseState {
  connected: boolean;
  events: PulseSnapshot[];
  generatedAt: string;
}

export function useGlobalPulse(): GlobalPulseState {
  const [events, setEvents] = useState<PulseSnapshot[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const protocol = typeof window !== 'undefined' ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:') : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
  const url = `${protocol}//${host}/api/v1/ws/global-pulse`;

  const { connected } = useWebSocket<GlobalPulseMessage>(url, {
    onMessage: useCallback((msg: GlobalPulseMessage) => {
      if (msg.type === 'snapshot') {
        setEvents(msg.events);
        setGeneratedAt(msg.generated_at);
      } else if (msg.type === 'update') {
        setEvents((prev) => {
          const next = prev.filter((e) => !msg.removed.includes(e.id));
          const existingIds = new Set(next.map((e) => e.id));
          for (const added of msg.added) {
            if (!existingIds.has(added.id)) {
              next.push(added);
            }
          }
          return next;
        });
        setGeneratedAt(msg.generated_at);
      }
    }, []),
    reconnect: true,
    maxReconnectAttempts: 10,
  });

  return { connected, events, generatedAt };
}
