import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';

/**
 * Compact "latest briefing" card shown at the top of /threatintel, directly
 * under the PlatformPulse sparklines. Surfaces the single most-recent briefing
 * (daily or weekly) with its headline stats and a link to the full report.
 *
 * Silent if the briefings endpoint is empty or fails — same policy as
 * PlatformPulse, so a cold/un-backfilled DB never renders a broken card.
 */

interface BriefingItem {
  slug: string;
  metadata?: {
    type?: 'daily' | 'weekly';
    title?: string;
    date?: string;
    range_end?: string;
    date_range?: string;
    stats?: { findings?: number; kevs?: number; iocs?: number; critical?: number };
  };
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function LatestBriefingCard(): JSX.Element | null {
  const [item, setItem] = useState<BriefingItem | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/briefings/list?limit=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: BriefingItem[] }) => {
        if (alive && d.items && d.items.length > 0) setItem(d.items[0] ?? null);
      })
      .catch(() => {
        /* silent — matches PlatformPulse */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!item) return null;
  const m = item.metadata ?? {};
  const s = m.stats ?? {};
  const kind = m.type === 'weekly' ? 'Weekly' : 'Daily';

  return (
    <Link
      to={`/threatintel/briefings/${item.slug}`}
      className="group mb-6 flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500"
    >
      <FileText className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
            Latest {kind} Briefing
          </span>
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {m.title ?? item.slug}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {fmt(s.findings)} findings · {fmt(s.kevs)} KEVs · {fmt(s.iocs)} IOCs
          {typeof s.critical === 'number' && s.critical > 0 ? ` · ${fmt(s.critical)} critical` : ''}
          {m.date_range ? ` · ${m.date_range}` : ''}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
    </Link>
  );
}
