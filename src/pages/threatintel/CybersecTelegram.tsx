import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Send } from 'lucide-react';
import { DataPageLayout, useInsideDataPageLayout } from '../../components/DataPageLayout';
import { TelegramFeedPanel } from '../dfir/DarkWeb';
import { FeedAggregateCard } from '../../components/intel/FeedAggregateCard';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';

interface TelegramAggItem {
  text: string;
  channel_name?: string;
}
interface TelegramAggResponse {
  items?: TelegramAggItem[];
}

/**
 * Cybersec Telegram firehose page. Thin wrapper around the
 * `TelegramFeedPanel` widget that also lives on the unified
 * /threatintel/darkweb view - same data (curated public Telegram channels
 * via /api/v1/telegram-feed), presented standalone so the
 * LiveSnapshotPanel "full feed" link lands somewhere focused.
 */
export default function CybersecTelegram(): JSX.Element {
  const insideLayout = useInsideDataPageLayout();
  // Lightweight side-fetch just for the aggregate card. TelegramFeedPanel
  // already owns its own fetch; the edge cache will dedupe.
  const [items, setItems] = useState<TelegramAggItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    fetch('/api/v1/telegram-feed', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? (r.json() as Promise<TelegramAggResponse>) : null))
      .then((d) => {
        if (cancelled || !d?.items) return;
        setItems(d.items);
      })
      .catch(() => {
        /* aggregate card is non-essential - never block the page */
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      hideBack={insideLayout}
      icon={<Send size={28} />}
      title="Cybersec Telegram firehose"
      headerExtra={
        <>
          <p className="text-muted mb-2 max-w-3xl leading-relaxed">
            Curated stream from active public cybersec Telegram channels. IOC drops, threat-intel commentary, leak
            announcements, and security-news mirrors. Channel set is liveness-probed; see the catalogue at{' '}
            <Link to="/threatintel/telegram" className="text-rose-600 dark:text-rose-400 hover:underline">
              /threatintel/telegram-watch
            </Link>{' '}
            for descriptions of each channel.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1"
              aria-label="Refresh Telegram firehose"
            >
              <RefreshCw size={11} /> refresh
            </button>
            <Link
              to="/threatintel/telegram-monitor"
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1.5"
            >
              Leak monitor
            </Link>
            <Link
              to="/threatintel/telegram-monitor?tab=channels"
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1.5"
            >
              Discovered channels
            </Link>
            <Link
              to="/threatintel/telegram-monitor?tab=stats"
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1.5"
            >
              Stats
            </Link>
            <Link
              to="/threatintel/telegram-monitor?tab=settings"
              className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1.5"
            >
              Settings
            </Link>
          </div>
        </>
      }
    >
      {/* Page-level AI summary across the visible Telegram messages.
          Mirrors the XFirehose / RedditFirehose / CyberPulse pattern: a single
          LLM pass over the top ~30 messages, cached per (surface, date) on
          the edge. Public (requireAdmin={false}) so every visitor sees it. */}
      {items.length > 0 && (
        <AiSummaryCard
          surface="Cybersec Telegram firehose"
          items={items.slice(0, 30).map((it) => ({
            title: it.channel_name ?? '(unnamed channel)',
            body: it.text,
            source: it.channel_name ?? '',
          }))}
          requireAdmin={false}
        />
      )}

      {/* Aggregate STIX 2.1 view across the visible Telegram messages.
          Telegram messages individually are too short to extract from; pooling
          the top ~40 captures the actors / malware / CVEs / IoCs of the day. */}
      {items.length > 0 && (
        <FeedAggregateCard
          sourceId="telegram"
          sourceName="Cybersec Telegram firehose"
          title="Telegram firehose · today"
          items={items.map((it) => ({
            title: it.channel_name,
            body: it.text,
          }))}
        />
      )}

      <TelegramFeedPanel key={refreshKey} />
    </DataPageLayout>
  );
}
