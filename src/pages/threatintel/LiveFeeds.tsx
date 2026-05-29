import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Radio, Activity, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface FeedUpdate {
  type: 'connected' | 'snapshot' | 'update';
  feed?: string;
  total?: number;
  delta?: number;
  generated_at?: string;
  feeds?: string[];
  previous_total?: number;
  new_total?: number;
}

const FEED_LABELS: Record<string, string> = {
  ransomware: 'Ransomware Victims',
  iocs: 'Live IOCs',
  cves: 'Recent CVEs',
  malware: 'Malware Samples',
  breaches: 'Breach Disclosures',
  actors: 'Actor Activity',
};

const FEED_COLORS: Record<string, string> = {
  ransomware: 'text-red-500 border-red-300 dark:border-red-700',
  iocs: 'text-blue-500 border-blue-300 dark:border-blue-700',
  cves: 'text-amber-500 border-amber-300 dark:border-amber-700',
  malware: 'text-purple-500 border-purple-300 dark:border-purple-700',
  breaches: 'text-orange-500 border-orange-300 dark:border-orange-700',
  actors: 'text-violet-500 border-violet-300 dark:border-violet-700',
};

export default function LiveFeeds(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [feeds, setFeeds] = useState<Record<string, { total: number; generated_at: string }>>({});
  const [events, setEvents] = useState<FeedUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsRef = useRef<FeedUpdate[]>([]);

  const addEvent = useCallback((evt: FeedUpdate) => {
    eventsRef.current = [evt, ...eventsRef.current].slice(0, 100);
    setEvents([...eventsRef.current]);
  }, []);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/v1/ws/live-feed`);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };
    ws.onclose = () => {
      setConnected(false);
      setError('Disconnected');
    };
    ws.onerror = () => {
      setConnected(false);
      setError('WebSocket error');
    };

    ws.onmessage = (msg) => {
      try {
        const data: FeedUpdate = JSON.parse(msg.data);

        if (data.type === 'connected') {
          addEvent(data);
        } else if (data.type === 'snapshot' && data.feed) {
          setFeeds((prev) => ({
            ...prev,
            [data.feed!]: { total: data.total ?? 0, generated_at: data.generated_at ?? '' },
          }));
          addEvent(data);
        } else if (data.type === 'update' && data.feed) {
          setFeeds((prev) => ({
            ...prev,
            [data.feed!]: { total: data.total ?? 0, generated_at: data.generated_at ?? '' },
          }));
          addEvent(data);
        }
      } catch {
        /* ignore parse errors */
      }
    };

    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [addEvent]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
            <Radio className="text-brand-600 dark:text-brand-400" size={28} />
            Live Feeds
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            Real-time feed of threat intelligence updates via WebSocket.
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono ${connected ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}
        >
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {error && !connected && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 p-4 mb-6"
        >
          <div className="text-sm font-mono text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {Object.entries(FEED_LABELS).map(([key, label]) => {
          const feed = feeds[key];
          const color = FEED_COLORS[key] ?? '';
          return (
            <div
              key={key}
              className={`p-4 rounded-xl bg-white dark:bg-slate-800/50 border-2 ${color.split(' ').slice(1).join(' ')} shadow-sm`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${color.split(' ')[0]}`}>
                  <Activity size={12} className="inline mr-1" />
                  {label}
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{feed?.total ?? '—'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {feed?.generated_at ? new Date(feed.generated_at).toLocaleTimeString() : 'waiting...'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Activity log */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity size={14} className="text-slate-400" />
          Activity Stream
          <span className="text-xs font-normal text-slate-400">({events.length} events)</span>
        </h2>
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-xs text-slate-400 italic font-mono">Waiting for data...</p>
          ) : (
            events.map((evt, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-800/30"
              >
                {evt.type === 'connected' && <span className="text-emerald-500 font-semibold">CONNECTED</span>}
                {evt.type === 'snapshot' && (
                  <>
                    <span className="text-slate-400">SNAPSHOT</span>
                    <span className="font-medium">{evt.feed}</span>
                    <span className="text-slate-500">{evt.total?.toLocaleString()} items</span>
                  </>
                )}
                {evt.type === 'update' && (
                  <>
                    <span className="text-blue-500 font-semibold">UPDATE</span>
                    <span className="font-medium">{evt.feed}</span>
                    <span className="text-emerald-500">+{evt.delta ?? '?'}</span>
                    <span className="text-slate-500">
                      ({evt.previous_total?.toLocaleString()} → {evt.new_total?.toLocaleString()})
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
