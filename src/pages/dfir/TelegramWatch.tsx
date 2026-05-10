import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search, Send, AlertTriangle, Eye } from 'lucide-react';
import {
  CATALOG,
  CATEGORY_LABELS,
  CATEGORY_BLURB,
  LANGUAGE_LABELS,
  AUDIENCE_LABELS,
  type TelegramCategory,
  type TelegramEntry,
} from '../../data/dfir/telegram-watch-catalog';

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as TelegramCategory[];
const ALL_LANGUAGES = ['en', 'ru', 'es', 'pt', 'zh', 'fa', 'ar', 'mixed'] as const;
type Lang = (typeof ALL_LANGUAGES)[number];

const CATEGORY_PILL: Record<TelegramCategory, string> = {
  'threat-intel': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  ransomware: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'breach-leaks': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'stealer-logs': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  'carding-fraud': 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  'malware-research': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  'security-news': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'osint-research': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'regional-cybercrime': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  hacktivism: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  'index-of-indexes': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

function entryUrl(e: TelegramEntry): string {
  // Pointer entries reference deepdarkCTI markdown paths — link to GitHub.
  if (e.handle.includes('/')) return `https://github.com/${e.handle}`;
  return `https://t.me/${e.handle}`;
}

function entryPreviewUrl(e: TelegramEntry): string | null {
  // Telegram preview view (no account needed). Only valid for real handles.
  if (e.handle.includes('/')) return null;
  return `https://t.me/s/${e.handle}`;
}

export default function TelegramWatch(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialCats = (searchParams.get('cat')?.split(',').filter(Boolean) ?? []) as TelegramCategory[];
  const initialLangs = (searchParams.get('lang')?.split(',').filter(Boolean) ?? []) as Lang[];
  const [activeCats, setActiveCats] = useState<Set<TelegramCategory>>(new Set(initialCats));
  const [activeLangs, setActiveLangs] = useState<Set<Lang>>(new Set(initialLangs));

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeCats.size > 0) out.set('cat', [...activeCats].join(','));
        else out.delete('cat');
        if (activeLangs.size > 0) out.set('lang', [...activeLangs].join(','));
        else out.delete('lang');
        return out;
      },
      { replace: true }
    );
  }, [query, activeCats, activeLangs, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((e) => {
      if (activeCats.size > 0 && !e.categories.some((c) => activeCats.has(c))) return false;
      if (activeLangs.size > 0 && !activeLangs.has(e.language)) return false;
      if (!q) return true;
      const hay =
        `${e.name} ${e.handle} ${e.description} ${e.categories.join(' ')} ${e.attribution ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeCats, activeLangs]);

  const catCounts = useMemo(() => {
    const map = new Map<TelegramCategory, number>();
    for (const e of filtered) for (const c of e.categories) map.set(c, (map.get(c) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleCat = (c: TelegramCategory) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const toggleLang = (l: Lang) =>
    setActiveLangs((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveCats(new Set());
    setActiveLangs(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Send size={28} className="text-brand-600 dark:text-brand-400" /> Telegram Watch
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          {CATALOG.length} curated Telegram channels for threat-intel, malware research, OSINT, and cybercrime
          situational awareness. Channels are publicly documented in threat-intel writeups or run by reputable
          researchers.
        </p>
      </div>

      {/* Honest scope card */}
      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-[12px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
            <p className="mb-1.5">
              <strong>Scope:</strong> we don&apos;t scrape Telegram or proxy any of these channels. Each entry opens{' '}
              <code>t.me/&lt;handle&gt;</code> in Telegram (web or native client). For preview-only browsing without an
              account, use the <code>t.me/s/&lt;handle&gt;</code> link on each card — works for public channels only.
            </p>
            <p className="mb-1.5">
              <strong>Opsec:</strong> joining cybercrime channels with your real account is a Bad Idea. Use a dedicated
              sock-puppet number (Google Voice / TextNow) on a clean device. Many channels deanonymize joiners by
              cross-referencing forwarded message metadata.
            </p>
            <p>
              <strong>Decay:</strong> handles rotate frequently (Telegram bans, actor pivots after takedowns). For
              fast-rotating cybercrime channels we link to the{' '}
              <a
                href="https://github.com/fastfire/deepdarkCTI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
              >
                deepdarkCTI <ExternalLink size={9} />
              </a>{' '}
              living index instead of hard-coding entries that decay within months.
            </p>
          </div>
        </div>
      </section>

      {/* Search + filters */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, handle, description, attribution — e.g. 'ransomware', 'osint', 'vxunderground'"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search Telegram channels"
          />
        </div>

        {/* Language toggles */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-mono text-slate-500 mr-1">language:</span>
          {ALL_LANGUAGES.map((l) => {
            const active = activeLangs.has(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active
                    ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {LANGUAGE_LABELS[l]}
              </button>
            );
          })}
          {(query || activeCats.size > 0 || activeLangs.size > 0) && (
            <button
              type="button"
              onClick={clearAll}
              className="sm:ml-auto text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          )}
        </div>
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

      {/* Cards */}
      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((e) => {
          const url = entryUrl(e);
          const previewUrl = entryPreviewUrl(e);
          const isPointer = e.handle.includes('/');
          return (
            <li
              key={e.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1 min-w-0"
                >
                  <span className="truncate">{e.name}</span> <ExternalLink size={12} className="opacity-60 shrink-0" />
                </a>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 shrink-0">
                  {LANGUAGE_LABELS[e.language]}
                </span>
              </div>

              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-1.5 break-all">
                {isPointer ? (
                  <>github · {e.handle}</>
                ) : (
                  <>
                    @{e.handle} · {AUDIENCE_LABELS[e.audience]}
                    {e.approx_members && <> · ~{e.approx_members}</>}
                  </>
                )}
              </div>

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

              {e.attribution && (
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-500 mb-2 italic">
                  source: {e.attribution}
                </p>
              )}

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
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:ml-auto inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                    title="Preview without joining (no Telegram account needed)"
                  >
                    <Eye size={10} /> preview
                  </a>
                )}
              </div>
            </li>
          );
        })}
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
