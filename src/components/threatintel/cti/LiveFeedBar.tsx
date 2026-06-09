import { useState } from 'react';
import { ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { FeedItem } from './geo';

/* ─── Props ────────────────────────────────────────────────────────────── */

interface LiveFeedBarProps {
  items: FeedItem[];
}

/* ─── Kind icon/badge ──────────────────────────────────────────────────── */

const KIND_BADGE: Record<string, string> = {
  ip: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
  url: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  domain: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hash: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

/* ─── Time formatting ──────────────────────────────────────────────────── */

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function LiveFeedBar({ items }: LiveFeedBarProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return <></>;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio size={12} className="text-rose-500 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-600 dark:text-slate-400">
            Live Feed
          </span>
          <span className="text-[10px] font-mono text-slate-400">({items.length})</span>
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronUp size={14} className="text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <div className="max-h-[200px] overflow-y-auto border-t border-slate-200 dark:border-slate-800">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {items.slice(0, 30).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium rounded ${
                    KIND_BADGE[item.kind] ?? KIND_BADGE.ip
                  }`}
                >
                  {item.kind}
                </span>
                <span className="font-mono text-slate-700 dark:text-slate-300 truncate flex-1">{item.value}</span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{item.source}</span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0 w-14 text-right">
                  {timeAgo(item.observedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
