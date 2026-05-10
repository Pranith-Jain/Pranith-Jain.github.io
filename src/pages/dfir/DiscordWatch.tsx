import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search, MessageCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CATALOG, CATEGORY_LABELS, CATEGORY_BLURB, type DiscordCategory } from '../../data/dfir/discord-watch-catalog';

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as DiscordCategory[];

const CATEGORY_PILL: Record<DiscordCategory, string> = {
  'red-team': 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  'blue-team': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'malware-research': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  'threat-intel': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'detection-engineering': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  ctf: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'bug-bounty': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  training: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'community-event': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  'vendor-tool': 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  'index-of-indexes': 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
};

export default function DiscordWatch(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialCats = (searchParams.get('cat')?.split(',').filter(Boolean) ?? []) as DiscordCategory[];
  const [activeCats, setActiveCats] = useState<Set<DiscordCategory>>(new Set(initialCats));

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeCats.size > 0) out.set('cat', [...activeCats].join(','));
        else out.delete('cat');
        return out;
      },
      { replace: true }
    );
  }, [query, activeCats, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((e) => {
      if (activeCats.size > 0 && !e.categories.some((c) => activeCats.has(c))) return false;
      if (!q) return true;
      const hay = `${e.name} ${e.description} ${e.categories.join(' ')} ${e.attribution}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeCats]);

  const catCounts = useMemo(() => {
    const map = new Map<DiscordCategory, number>();
    for (const e of filtered) for (const c of e.categories) map.set(c, (map.get(c) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleCat = (c: DiscordCategory) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveCats(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <MessageCircle size={28} className="text-brand-600 dark:text-brand-400" /> Discord Watch
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          {CATALOG.length} curated security Discord servers — training, red/blue team, malware research, threat
          intelligence, and event communities. Each invite is sourced from the running organisation&apos;s own public
          site.
        </p>
      </div>

      {/* Honest scope card */}
      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-[12px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
            <p className="mb-1.5">
              <strong>Scope:</strong> we don&apos;t monitor Discord server content — Discord doesn&apos;t expose a
              non-bot public read API. Each entry opens a server invite in your Discord client. We focus on{' '}
              <em>legitimate security communities</em> (training, research, conferences) rather than threat-actor
              servers, which are short-lived and already documented in the deepdarkCTI Discord index.
            </p>
            <p className="mb-1.5">
              <strong>Verify the invite:</strong> phishing servers impersonating popular communities are common. Always
              cross-check the invite link against the &ldquo;source&rdquo; URL on each card before joining.
            </p>
            <p>
              <strong>Decay:</strong> Discord invite codes expire or get revoked. If a link is dead, hit the{' '}
              <ShieldCheck size={11} className="inline -mt-0.5" /> source-of-truth link on the card to grab a fresh one
              from the org&apos;s site.
            </p>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search server name, description, attribution — e.g. 'malware', 'oscp', 'sigma', 'def con'"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search Discord servers"
          />
        </div>
        {(query || activeCats.size > 0) && (
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          </div>
        )}
      </section>

      {/* Category pills */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500 mr-1">categories:</span>
          {ALL_CATEGORIES.map((c) => {
            const count = catCounts.get(c) ?? 0;
            const active = activeCats.has(c);
            const cls = active ? CATEGORY_PILL[c] : 'border-slate-300 dark:border-slate-700 text-slate-500';
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${cls} ${count === 0 && !active ? 'opacity-30' : ''}`}
                title={CATEGORY_BLURB[c]}
                disabled={count === 0 && !active}
              >
                {CATEGORY_LABELS[c]} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-4">
        Showing {filtered.length} of {CATALOG.length}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <a
                href={e.invite_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1 min-w-0"
              >
                <span className="truncate">{e.name}</span> <ExternalLink size={12} className="opacity-60 shrink-0" />
              </a>
              {e.approx_members && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 shrink-0">
                  {e.approx_members}
                </span>
              )}
            </div>

            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-1.5 italic">{e.attribution}</p>

            {e.badge && (
              <div className="mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                  {e.badge}
                </span>
              </div>
            )}

            <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
              {e.description}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {e.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_PILL[c]}`}
                  title={`Filter by ${CATEGORY_LABELS[c]}`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              <a
                href={e.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="sm:ml-auto inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                title="Verify the invite via the org's own site"
              >
                <ShieldCheck size={10} /> source
              </a>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-500 mt-6">
          Nothing matches the current filters.{' '}
          <button onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          ?
        </p>
      )}
    </div>
  );
}
