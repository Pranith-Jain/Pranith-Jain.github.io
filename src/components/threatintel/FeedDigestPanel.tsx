import { useState, useCallback } from 'react';
import { RefreshCw, X, FileText } from 'lucide-react';

interface TopStory {
  headline: string;
  summary: string;
  significance: string;
  category: string;
  urgency: string;
}

interface FeedDigest {
  date: string;
  executive_summary: string;
  top_stories: TopStory[];
  trending_threats: string[];
  iotd_ioc: string;
  iotd_rationale: string;
  watchlist: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  vulnerability: 'text-amber-400 bg-amber-500/10',
  campaign: 'text-rose-400 bg-rose-500/10',
  breach: 'text-rose-400 bg-rose-500/10',
  malware: 'text-orange-400 bg-orange-500/10',
  geopolitical: 'text-purple-400 bg-purple-500/10',
  policy: 'text-sky-400 bg-sky-500/10',
};

const URGENCY_COLORS: Record<string, string> = {
  critical: 'text-rose-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-emerald-400',
};

interface FeedDigestPanelProps {
  items: Array<{ title: string; description?: string; source: string; pubDate?: string }>;
  period?: 'daily' | 'weekly';
  onClose: () => void;
}

export function FeedDigestPanel({ items, period = 'daily', onClose }: FeedDigestPanelProps) {
  const [digest, setDigest] = useState<FeedDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const fetchDigest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/feed-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, period }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDigest(data.digest);
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [items, period]);

  useState(() => {
    fetchDigest();
  });

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15">
            <FileText size={16} className="text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {period === 'weekly' ? 'Weekly' : 'Daily'} Intelligence Digest
              </h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-500">AI-curated summary of {items.length} articles</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchDigest}
            disabled={loading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {loading && !digest && (
          <div className="flex items-center gap-2 justify-center py-6">
            <RefreshCw size={14} className="animate-spin text-brand-400" />
            <span className="text-xs text-slate-400">Generating digest…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}

        {digest && (
          <>
            <p className="text-sm text-slate-300 leading-relaxed">{digest.executive_summary}</p>

            {digest.top_stories?.length > 0 && (
              <div className="space-y-2">
                <span className="text-micro font-mono uppercase text-slate-500">Top Stories</span>
                {digest.top_stories.map((story, i) => (
                  <div key={i} className="rounded-xl bg-slate-800/50 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded ${CATEGORY_COLORS[story.category] || 'text-slate-400 bg-slate-500/10'}`}
                      >
                        {story.category}
                      </span>
                      <span className={`text-micro font-mono ${URGENCY_COLORS[story.urgency] || 'text-slate-400'}`}>
                        {story.urgency}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200">{story.headline}</p>
                    <p className="text-xs text-slate-400">{story.summary}</p>
                    <p className="text-micro text-slate-500 italic">{story.significance}</p>
                  </div>
                ))}
              </div>
            )}

            {digest.iotd_ioc && (
              <div className="rounded-xl bg-rose-500/5 border border-rose-500/10 p-3">
                <span className="text-micro font-mono uppercase text-rose-400 block mb-1">IOC of the Day</span>
                <code className="text-xs font-mono text-rose-300 break-all">{digest.iotd_ioc}</code>
                <p className="text-micro text-slate-500 mt-1">{digest.iotd_rationale}</p>
              </div>
            )}

            {digest.watchlist?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Watchlist</span>
                <ul className="space-y-0.5">
                  {digest.watchlist.map((w, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1">
                      <span className="text-brand-400">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
