import { useEffect, useState } from 'react';
import { Rss, ExternalLink, Globe, Shield, Newspaper, Cpu, GraduationCap, Wrench } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { rssFeeds } from '../../data/rssFeeds';
import type { RSSFeed } from '../../data/rssFeeds';
import { sanitizeUrl } from '../../lib/sanitize-url';

const CATEGORY_META: Record<RSSFeed['category'], { label: string; icon: typeof Rss; className: string }> = {
  vulnerability: { label: 'Vulnerability', icon: Shield, className: 'text-rose-600 dark:text-rose-400' },
  advisory: { label: 'Advisory', icon: GraduationCap, className: 'text-amber-600 dark:text-amber-400' },
  'threat-intel': { label: 'Threat Intel', icon: Globe, className: 'text-brand-600 dark:text-brand-400' },
  news: { label: 'News', icon: Newspaper, className: 'text-blue-600 dark:text-blue-400' },
  general: { label: 'General', icon: Rss, className: 'text-slate-600 dark:text-slate-400' },
  'ics-cert': { label: 'ICS CERT', icon: Cpu, className: 'text-violet-600 dark:text-violet-400' },
  tech: { label: 'Tech', icon: Wrench, className: 'text-emerald-600 dark:text-emerald-400' },
};

const STORAGE_KEY = 'feed:sources:disabled';

function loadDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export default function FeedSources(): JSX.Element {
  const [disabled, setDisabled] = useState<Set<string>>(() => loadDisabled());
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
  }, [disabled]);

  const toggle = (id: string) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groups = Object.entries(
    rssFeeds.reduce<Record<string, RSSFeed[]>>((acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  const filteredGroups = groups
    .map(
      ([cat, feeds]) =>
        [
          cat,
          feeds.filter((f) => {
            if (disabled.has(f.id) && !showDisabled) return false;
            if (!search) return true;
            const q = search.toLowerCase();
            return (
              f.name.toLowerCase().includes(q) ||
              f.id.toLowerCase().includes(q) ||
              f.source?.toLowerCase().includes(q) ||
              f.description.toLowerCase().includes(q)
            );
          }),
        ] as const
    )
    .filter(([, feeds]) => feeds.length > 0);

  const totalEnabled = rssFeeds.length - disabled.size;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Rss size={26} />}
      title="Feed Sources"
      description={
        <span className="font-mono text-sm">
          {totalEnabled} / {rssFeeds.length} feeds enabled · aggregated every 30 minutes
        </span>
      }
      headerExtra={
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feeds by name, source, or description…"
            className="flex-1 min-w-[200px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <label className="inline-flex items-center gap-1.5 text-mini font-mono text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => setShowDisabled(e.target.checked)}
              className="rounded border-slate-400"
            />
            Show disabled
          </label>
        </div>
      }
    >
      <div className="space-y-6">
        {filteredGroups.map(([cat, feeds]) => {
          const meta = CATEGORY_META[cat as RSSFeed['category']];
          const Icon = meta.icon;
          return (
            <section key={cat} className="animate-fade-in-up">
              <h2 className="font-display font-semibold text-sm mb-3 inline-flex items-center gap-1.5">
                <Icon size={14} className={meta.className} />
                {meta.label}
                <span className="font-mono text-mini text-slate-500">· {feeds.length}</span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {feeds.map((f) => {
                  const enabled = !disabled.has(f.id);
                  return (
                    <div
                      key={f.id}
                      className={`rounded-lg border p-3 transition-opacity ${
                        enabled
                          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          : 'border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/50 opacity-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-display font-semibold text-sm truncate" title={f.name}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggle(f.id)}
                          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-micro uppercase transition-colors ${
                            enabled
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-400/40 bg-slate-400/10 text-slate-500'
                          }`}
                        >
                          {enabled ? 'enabled' : 'disabled'}
                        </button>
                      </div>
                      <p className="font-mono text-micro text-slate-500 line-clamp-2 mb-1">{f.description}</p>
                      <div className="flex items-center gap-2 font-mono text-micro text-slate-400">
                        {f.source && <span className="truncate">{f.source}</span>}
                        {f.language && <span className="uppercase">{f.language}</span>}
                        <span className="ml-auto">
                          {f.url && (
                            <a
                              href={sanitizeUrl(f.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 hover:text-brand-600 dark:hover:text-brand-400"
                            >
                              <ExternalLink size={9} />
                            </a>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <details className="mt-10">
        <summary className="cursor-pointer text-mini font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          How feed management works
        </summary>
        <div className="mt-3 text-mini font-mono text-slate-500 leading-relaxed space-y-1 max-w-2xl">
          <p>
            Disabling a feed hides it from the aggregated feed view. The server-side fetch still runs — this toggle
            controls display only, stored in your browser localStorage.
          </p>
          <p>
            To add a new feed source, edit{' '}
            <code className="text-slate-700 dark:text-slate-300">src/data/rssFeeds.ts</code> and add its URL to the{' '}
            <code className="text-slate-700 dark:text-slate-300">ALLOWED_HOSTS</code> list in{' '}
            <code className="text-slate-700 dark:text-slate-300">api/src/routes/feeds.ts</code> and{' '}
            <code className="text-slate-700 dark:text-slate-300">feeds-aggregate.ts</code>.
          </p>
        </div>
      </details>
    </DataPageLayout>
  );
}
