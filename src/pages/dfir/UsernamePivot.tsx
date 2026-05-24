import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AtSign, ExternalLink, Search, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import {
  SERVICES,
  CATEGORY_LABELS,
  buildProfileUrl,
  type CheckResult,
  type Service,
  type Category,
} from '../../lib/dfir/username-pivots';

const RESULT_STYLES: Record<CheckResult | 'pending' | 'manual', { label: string; cls: string; icon: JSX.Element }> = {
  exists: {
    label: 'exists',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: <CheckCircle2 size={11} />,
  },
  'not-found': {
    label: 'not found',
    cls: 'border-slate-300 dark:border-slate-700 text-slate-500',
    icon: <span className="opacity-50">×</span>,
  },
  'rate-limited': {
    label: 'rate-limited',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: <AlertTriangle size={11} />,
  },
  error: {
    label: 'error',
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: <AlertTriangle size={11} />,
  },
  pending: {
    label: 'checking…',
    cls: 'border-slate-300 dark:border-slate-700 text-slate-500',
    icon: <Loader2 size={11} className="animate-spin" />,
  },
  manual: {
    label: 'manual',
    cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: <ExternalLink size={11} />,
  },
};

type RowState = CheckResult | 'pending' | 'manual';

interface CheckedRow {
  service: Service;
  state: RowState;
}

const USERNAME_RE = /^[A-Za-z0-9._-]{1,40}$/;

export default function UsernamePivot(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [username, setUsername] = useState(searchParams.get('u') ?? '');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckedRow[]>([]);
  const [running, setRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const initialDone = useRef(false);

  const validUsername = USERNAME_RE.test(username.trim());

  const startScan = async (override?: string) => {
    const u = (override ?? username).trim();
    if (!USERNAME_RE.test(u)) return;
    if (override) setUsername(override);
    setSearchParams({ u }, { replace: false });
    setSubmitted(u);
    setRunning(true);
    // Initial state: active = pending, manual = manual.
    const initial: CheckedRow[] = SERVICES.map((s) => ({
      service: s,
      state: s.mode === 'active' ? 'pending' : 'manual',
    }));
    setRows(initial);

    // Run active checks in parallel — capped concurrency via Promise.all over groups of 4.
    const active = SERVICES.filter((s) => s.mode === 'active');
    const concurrency = 4;
    for (let i = 0; i < active.length; i += concurrency) {
      const batch = active.slice(i, i + concurrency);
      const settled = await Promise.all(
        batch.map(async (s) => ({ id: s.id, result: (await s.check!(u)) as CheckResult }))
      );
      setRows((prev) =>
        prev.map((r) => {
          const m = settled.find((x) => x.id === r.service.id);
          return m ? { ...r, state: m.result } : r;
        })
      );
    }
    setRunning(false);
  };

  // Auto-fetch from URL on first mount.
  useEffect(() => {
    if (initialDone.current) return;
    const initial = searchParams.get('u');
    if (initial && USERNAME_RE.test(initial)) {
      initialDone.current = true;
      void startScan(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    if (categoryFilter === 'all') return rows;
    return rows.filter((r) => r.service.category === categoryFilter);
  }, [rows, categoryFilter]);

  const stats = useMemo(() => {
    const counts: Record<RowState, number> = {
      exists: 0,
      'not-found': 0,
      'rate-limited': 0,
      error: 0,
      pending: 0,
      manual: 0,
    };
    for (const r of rows) counts[r.state]++;
    return counts;
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <AtSign size={28} className="text-brand-600 dark:text-brand-400" /> Username Pivot
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Check whether a username is registered across {SERVICES.length} services. The{' '}
          {SERVICES.filter((s) => s.mode === 'active').length} services with public CORS-friendly endpoints (GitHub,
          GitLab, Codeberg, Reddit, HN, Lobsters, npm, Dev.to, Mastodon) are verified live; the rest are deep-link
          generated for manual review. All checks run from your browser.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Inspired by Sherlock. Designed for IR / threat-actor pivoting and brand-monitoring; "exists" doesn't always
          mean the same person — confirm via cross-correlation (display name, profile photo, post timing).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startScan();
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative flex-1 min-w-[220px]">
            <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username (letters / digits / . _ -)"
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
              aria-label="Username"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={!validUsername || running}
            className="text-sm font-mono px-3 py-2 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {running ? 'Scanning' : 'Scan'}
          </button>
        </form>
        {username && !validUsername && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Use letters, digits, dots, underscores, or hyphens (1–40 chars). Some services have their own validation on
            top.
          </p>
        )}
      </section>

      {submitted && (
        <>
          {/* Stats + filter */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Results for <span className="text-slate-900 dark:text-slate-100">{submitted}</span>
              </h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {stats.exists} exists · {stats['not-found']} not found · {stats['rate-limited']} rate-limited ·{' '}
                {stats.error} error · {stats.manual} manual
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                  categoryFilter === 'all'
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
                const count = SERVICES.filter((s) => s.category === c).length;
                if (count === 0) return null;
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                      categoryFilter === c
                        ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
                    }`}
                  >
                    {CATEGORY_LABELS[c]} <span className="opacity-60">· {count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Result list */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <ul className="grid gap-2 sm:grid-cols-2">
              {filteredRows.map((row) => {
                const url = buildProfileUrl(row.service, submitted);
                const style = RESULT_STYLES[row.state];
                return (
                  <li
                    key={row.service.id}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {row.service.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {CATEGORY_LABELS[row.service.category]}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${style.cls}`}
                      >
                        {style.icon}
                        {style.label}
                      </span>
                      <CopyChip value={url} />
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline break-all inline-flex items-center gap-1"
                    >
                      {url} <ExternalLink size={10} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
          Notes
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400 list-disc pl-5">
          <li>
            "exists" is a structural signal, not identity — a hit on the same handle across 5 sites is a much stronger
            pivot than a hit on 1.
          </li>
          <li>
            Active-checked sites use unauthenticated public endpoints. Rate-limit (especially GitHub: 60/h per IP) can
            return as <code>rate-limited</code> rather than a real result.
          </li>
          <li>
            Manual entries open the deep-link in a new tab — the user's browser carries cookies, so a logged-in session
            can see content this tool can't from the API.
          </li>
          <li>
            For threat-intel pivoting, also check the{' '}
            <Link to="/dfir/breach" className="text-brand-600 dark:text-brand-400 hover:underline">
              breach checker
            </Link>{' '}
            and{' '}
            <Link to="/dfir/socmint" className="text-brand-600 dark:text-brand-400 hover:underline">
              SOCMINT pivots
            </Link>{' '}
            for that handle.
          </li>
        </ul>
      </section>
    </div>
  );
}
