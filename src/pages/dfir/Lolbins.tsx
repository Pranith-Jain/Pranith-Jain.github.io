import { useMemo, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Terminal, ExternalLink, Search } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';
import {
  LOLBINS,
  LOLBIN_CATEGORIES,
  LOLBIN_PLATFORMS,
  type Category,
  type LolbinEntry,
  type Platform,
} from '../../data/lolbins';

const SOURCE_STYLES: Record<LolbinEntry['source'], string> = {
  LOLBAS: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  GTFOBins: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  LOOBins: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  WTFBins: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

export default function Lolbins(): JSX.Element {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOLBINS.filter((b) => {
      if (platform !== 'all' && !b.platforms.includes(platform)) return false;
      if (category !== 'all' && b.category !== category) return false;
      if (!q) return true;
      return (
        b.binary.toLowerCase().includes(q) ||
        b.technique.toLowerCase().includes(q) ||
        b.example.toLowerCase().includes(q) ||
        b.detection.toLowerCase().includes(q) ||
        b.attack.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [query, platform, category]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Terminal size={28} className="text-brand-600 dark:text-brand-400" /> Living-off-the-Land Binaries
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          {LOLBINS.length} curated entries from LOLBAS (Windows), GTFOBins (Unix), and LOOBins (macOS), each mapped to
          MITRE ATT&amp;CK with a one-line abuse example and a detection idea.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          A subset of the full catalogues — pick the entries I reach for during phishing / BEC / commodity-malware IRs.
          Use the upstream sources (linked on each card) for the complete coverage.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search binary, technique, ATT&CK ID, or detection idea…"
            className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Filter LOLBins"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
            Platform
          </span>
          <button
            onClick={() => setPlatform('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              platform === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {LOLBIN_PLATFORMS.map((p) => {
            const count = LOLBINS.filter((b) => b.platforms.includes(p.id)).length;
            return (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                  platform === p.id
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
                }`}
              >
                {p.label} <span className="opacity-60">· {count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
            Category
          </span>
          <button
            onClick={() => setCategory('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              category === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {LOLBIN_CATEGORIES.map((c) => {
            const count = LOLBINS.filter((b) => b.category === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                  category === c.id
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
                }`}
              >
                {c.label} <span className="opacity-60">· {count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-3">
        Showing {filtered.length} of {LOLBINS.length}
      </p>

      <div className="space-y-3">
        {filtered.map((b) => (
          <article
            key={b.id}
            className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
          >
            <header className="flex flex-wrap items-center gap-2 mb-2">
              <code className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{b.binary}</code>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SOURCE_STYLES[b.source]}`}
              >
                {b.source}
              </span>
              {b.platforms.map((p) => (
                <span
                  key={p}
                  className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted"
                >
                  {p}
                </span>
              ))}
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                {b.category}
              </span>
              {b.attack.map((a) => (
                <Link
                  key={a}
                  to={`/threatintel/mitre?id=${encodeURIComponent(a)}`}
                  className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/60"
                  title={`Open ${a} in MITRE ATT&CK`}
                >
                  {a}
                </Link>
              ))}
              <a
                href={sanitizeUrl(b.url) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-micro font-mono text-slate-400 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-0.5"
              >
                source <ExternalLink size={10} />
              </a>
            </header>

            <p className="text-sm font-mono text-slate-800 dark:text-slate-200 mb-2">{b.technique}</p>

            <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 p-2.5 mb-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-micro font-mono uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">
                  Abuse
                </span>
                <CopyChip value={b.example} />
              </div>
              <pre className="text-meta font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                {b.example}
              </pre>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 p-2.5">
                <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
                  Legitimate use
                </span>
                <p className="text-meta font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{b.legit}</p>
              </div>
              <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 p-2.5">
                <span className="text-micro font-mono uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 block mb-1">
                  Detection
                </span>
                <p className="text-meta font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{b.detection}</p>
              </div>
            </div>
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm font-mono text-slate-500 dark:text-slate-400">
            No entries match those filters.
          </div>
        )}
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Upstream catalogues
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-muted">
          <li>
            <a
              href="https://lolbas-project.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              LOLBAS — Windows binaries, scripts and libraries
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://gtfobins.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              GTFOBins — Unix binaries used to bypass restrictions
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://www.loobins.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              LOOBins — macOS living-off-the-land
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
      <RelatedWikiArticles />
    </div>
  );
}
