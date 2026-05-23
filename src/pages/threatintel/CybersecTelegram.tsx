import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Send } from 'lucide-react';
import { TelegramFeedPanel } from '../dfir/DarkWeb';
import { FeedAggregateCard } from '../../components/intel/FeedAggregateCard';

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
 * /threatintel/darkweb view — same data (curated public Telegram channels
 * via /api/v1/telegram-feed), presented standalone so the
 * LiveSnapshotPanel "full feed" link lands somewhere focused.
 */
export default function CybersecTelegram(): JSX.Element {
  // Lightweight side-fetch just for the aggregate card. TelegramFeedPanel
  // already owns its own fetch; the edge cache will dedupe.
  const [items, setItems] = useState<TelegramAggItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/telegram-feed')
      .then((r) => (r.ok ? (r.json() as Promise<TelegramAggResponse>) : null))
      .then((d) => {
        if (cancelled || !d?.items) return;
        setItems(d.items);
      })
      .catch(() => {
        /* aggregate card is non-essential — never block the page */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Send size={28} className="text-brand-600 dark:text-brand-400" /> Cybersec Telegram firehose
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Curated stream from active public cybersec Telegram channels. IOC drops, threat-intel commentary, leak
          announcements, and security-news mirrors. Channel set is liveness-probed; see the catalogue at{' '}
          <Link to="/threatintel/telegram-watch" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel/telegram-watch
          </Link>{' '}
          for descriptions of each channel.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Server-side aggregation of public Telegram channel previews.
        </p>
      </div>

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

      <TelegramFeedPanel />
    </div>
  );
}
