import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  KeyRound,
  Laptop,
  MessageCircle,
  Network,
  Plane,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import {
  CATEGORIES,
  type CategoryId,
  type CheckCategory,
  type CheckItem,
  type CheckStatus,
  type Severity,
} from '../../data/personal-security';
import { sanitizeUrl } from '../../lib/sanitize-url';

const STORAGE_KEY = 'dfir.personal-security.checks.v1';

const CYCLE: Record<CheckStatus, CheckStatus> = {
  unset: 'covered',
  covered: 'partial',
  partial: 'gap',
  gap: 'na',
  na: 'unset',
};

const STATUS_STYLES: Record<CheckStatus, { label: string; cls: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  unset: {
    label: '— unset',
    cls: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400',
    tone: 'muted',
  },
  covered: {
    label: '✓ covered',
    cls: 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    tone: 'good',
  },
  partial: {
    label: '~ partial',
    cls: 'border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    tone: 'warn',
  },
  gap: {
    label: '✗ gap',
    cls: 'border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    tone: 'bad',
  },
  na: {
    label: 'n/a',
    cls: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-400 dark:text-slate-500',
    tone: 'muted',
  },
};

const SEVERITY_STYLES: Record<Severity, { label: string; cls: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  critical: {
    label: 'critical',
    cls: 'border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    tone: 'bad',
  },
  high: {
    label: 'high',
    cls: 'border-orange-400/60 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    tone: 'warn',
  },
  medium: {
    label: 'medium',
    cls: 'border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    tone: 'warn',
  },
  low: {
    label: 'low',
    cls: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted',
    tone: 'muted',
  },
};

const ICONS: Record<CheckCategory['icon'], JSX.Element> = {
  accounts: <KeyRound size={20} aria-hidden="true" />,
  devices: <Laptop size={20} aria-hidden="true" />,
  network: <Network size={20} aria-hidden="true" />,
  comms: <MessageCircle size={20} aria-hidden="true" />,
  physical: <Shield size={20} aria-hidden="true" />,
  opsec: <ShieldAlert size={20} aria-hidden="true" />,
  travel: <Plane size={20} aria-hidden="true" />,
  recovery: <RefreshCw size={20} aria-hidden="true" />,
  family: <Users size={20} aria-hidden="true" />,
};

interface State {
  checks: Record<string, CheckStatus>;
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { checks: {} };
    const parsed = JSON.parse(raw) as State;
    return { checks: parsed.checks ?? {} };
  } catch {
    return { checks: {} };
  }
}

interface CategoryStats {
  total: number;
  covered: number;
  partial: number;
  gap: number;
  na: number;
  unset: number;
  score: number; // 0..100
  openGaps: CheckItem[]; // items in 'gap' or unset with high+critical severity
}

function categoryStats(items: CheckItem[], state: State): CategoryStats {
  let covered = 0;
  let partial = 0;
  let gap = 0;
  let na = 0;
  let unset = 0;
  const openGaps: CheckItem[] = [];
  let weight = 0;
  for (const it of items) {
    const s = state.checks[it.id] ?? 'unset';
    if (s === 'covered') {
      covered++;
      weight += 1;
    } else if (s === 'partial') {
      partial++;
      weight += 0.5;
    } else if (s === 'gap') {
      gap++;
      if (it.severity === 'critical' || it.severity === 'high') openGaps.push(it);
    } else if (s === 'na') {
      na++;
    } else {
      unset++;
      if (it.severity === 'critical' || it.severity === 'high') openGaps.push(it);
    }
  }
  const score = items.length === 0 ? 0 : Math.round((weight / items.length) * 100);
  return { total: items.length, covered, partial, gap, na, unset, score, openGaps };
}

function globalScore(state: State): { score: number; covered: number; total: number; items: number; gaps: number } {
  let total = 0;
  let weight = 0;
  let gaps = 0;
  for (const cat of CATEGORIES) {
    for (const it of cat.items) {
      total++;
      const s = state.checks[it.id] ?? 'unset';
      if (s === 'covered') weight += 1;
      else if (s === 'partial') weight += 0.5;
      else if (s === 'gap') gaps++;
      else if (s === 'unset' && (it.severity === 'critical' || it.severity === 'high')) gaps++;
    }
  }
  return {
    score: total === 0 ? 0 : Math.round((weight / total) * 100),
    covered: Math.round(weight),
    total,
    items: total,
    gaps,
  };
}

function exportMd(state: State): string {
  const lines: string[] = [
    '# Personal Security & OPSEC Self-Assessment',
    '',
    `_Generated ${new Date().toISOString().slice(0, 10)}._`,
    '',
    'Methodology: ✓ covered = 1.0, ~ partial = 0.5, ✗ gap / — unset / n/a = 0.0. Score = sum / total items × 100.',
    '',
    '## Summary',
    '',
  ];
  const g = globalScore(state);
  lines.push(`- **Overall score:** ${g.score}% (${g.covered}/${g.total})`);
  lines.push(`- **Open critical/high gaps:** ${g.gaps}`);
  lines.push('');
  for (const cat of CATEGORIES) {
    const c = categoryStats(cat.items, state);
    lines.push(`## ${cat.short} — ${c.score}% (${c.covered}/${c.total})`);
    lines.push('');
    lines.push(cat.intro);
    lines.push('');
    for (const it of cat.items) {
      const s = state.checks[it.id] ?? 'unset';
      lines.push(`- [${STATUS_STYLES[s].label.trim()}] **${it.title}** _(${it.severity})_: ${it.body}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function grade(score: number): { label: string; cls: string } {
  if (score >= 85) return { label: 'Strong', cls: 'text-emerald-600 dark:text-emerald-400' };
  if (score >= 60) return { label: 'Moderate', cls: 'text-amber-600 dark:text-amber-400' };
  if (score >= 30) return { label: 'Weak', cls: 'text-orange-600 dark:text-orange-400' };
  return { label: 'Poor', cls: 'text-rose-600 dark:text-rose-400' };
}

export default function PersonalSecurity(): JSX.Element {
  const [state, setState] = useState<State>({ checks: {} });
  const [active, setActive] = useState<CategoryId>('accounts');

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota — silent */
    }
  }, [state]);

  const cycle = (id: string) =>
    setState((prev) => ({ ...prev, checks: { ...prev.checks, [id]: CYCLE[prev.checks[id] ?? 'unset'] } }));

  const reset = () => {
    if (typeof window !== 'undefined' && confirm('Clear every check mark? This cannot be undone.')) {
      setState({ checks: {} });
    }
  };

  const downloadMd = () => {
    const md = exportMd(state);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-security-assessment-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overall = useMemo(() => globalScore(state), [state]);
  const allStats = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, stats: categoryStats(c.items, state) })),
    [state]
  );
  const overallGrade = grade(overall.score);

  const openGaps = useMemo(
    () =>
      allStats
        .flatMap((s) => s.stats.openGaps.map((it) => ({ item: it, category: s.category })))
        .sort((a, b) => {
          const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          return order[a.item.severity] - order[b.item.severity];
        }),
    [allStats]
  );

  const activeCategory = CATEGORIES.find((c) => c.id === active)!;
  const activeStats = categoryStats(activeCategory.items, state);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <ShieldCheck size={28} className="text-brand-600 dark:text-brand-400" /> Personal Security &amp; OPSEC
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Interactive companion to{' '}
          <a
            href={sanitizeUrl('https://github.com/lissy93/personal-security-checklist') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Lissy93&apos;s Personal Security Checklist
            <ExternalLink size={11} aria-hidden="true" />
          </a>{' '}
          and{' '}
          <a
            href={sanitizeUrl('https://digital-defense.io/') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Digital Defense
            <ExternalLink size={11} aria-hidden="true" />
          </a>
          . {CATEGORIES.length} domains, {CATEGORIES.reduce((n, c) => n + c.items.length, 0)} curated actions — click
          any item to cycle <span className="font-mono">unset → covered → partial → gap → n/a</span>.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Reference only — not legal or professional advice. Pairs with{' '}
          <Link to="/dfir/privacy" className="text-brand-600 dark:text-brand-400 hover:underline">
            /dfir/privacy
          </Link>{' '}
          (live browser fingerprinting scan),{' '}
          <Link to="/dfir/privacy-hub" className="text-brand-600 dark:text-brand-400 hover:underline">
            /dfir/privacy-hub
          </Link>{' '}
          (regulatory regimes) and{' '}
          <Link to="/threatintel/external/external" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel/external-resources
          </Link>{' '}
          (the source list).
        </p>
      </div>

      {/* Overall dashboard */}
      <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <div className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
              Overall OPSEC posture
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
                {overall.score}%
              </span>
              <span className={`text-sm font-mono font-bold ${overallGrade.cls}`}>{overallGrade.label}</span>
            </div>
          </div>
          <div className="text-sm font-mono text-muted">
            {overall.covered}/{overall.items} weighted • {overall.gaps} open critical / high gap
            {overall.gaps === 1 ? '' : 's'}
          </div>
        </div>
        <div className="h-2 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
          <div
            className={`h-full ${
              overall.score >= 85 ? 'bg-emerald-500' : overall.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.max(2, overall.score)}%` }}
          />
        </div>
      </section>

      {/* Category tiles */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {allStats.map(({ category, stats }) => (
          <button
            key={category.id}
            onClick={() => setActive(category.id)}
            className={`text-left rounded-xl border p-3 transition-colors ${
              active === category.id
                ? 'border-brand-500/60 bg-brand-500/5'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/40'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                <span className="text-brand-600 dark:text-brand-400">{ICONS[category.icon]}</span>
                {category.short}
              </span>
              <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">{stats.score}%</span>
            </div>
            <div className="h-1.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden mb-1">
              <div
                className={`h-full ${
                  stats.score >= 85 ? 'bg-emerald-500' : stats.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(2, stats.score)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-micro font-mono text-slate-400 dark:text-slate-400">
              <span>
                {stats.covered}/{stats.total} covered
              </span>
              {stats.openGaps.length > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  {stats.openGaps.length} open gap{stats.openGaps.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </button>
        ))}
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={downloadMd}
          className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1.5"
        >
          <Download size={13} /> Export markdown
        </button>
        <button
          onClick={reset}
          className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1.5"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      {/* Active category */}
      <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <span className="text-brand-600 dark:text-brand-400">{ICONS[activeCategory.icon]}</span>
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
            {activeCategory.longTitle}
          </h2>
          <span className="text-micro font-mono text-slate-400 dark:text-slate-400">
            {activeStats.covered}/{activeStats.total} covered · {activeStats.score}%
          </span>
        </div>
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{activeCategory.intro}</p>
      </section>

      {/* Items */}
      <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          {activeCategory.items.length} actions
        </h3>
        <ul className="space-y-2">
          {activeCategory.items.map((it) => (
            <ItemRow key={it.id} item={it} state={state} cycle={cycle} />
          ))}
        </ul>
      </section>

      {/* Top gaps across the whole checklist */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300 font-mono mb-2 inline-flex items-center gap-1.5">
          <ShieldAlert size={13} aria-hidden="true" /> Highest-priority open gaps ({openGaps.length})
        </h3>
        {openGaps.length === 0 ? (
          <p className="text-sm font-mono text-muted">
            <CheckCircle2 size={13} className="inline mr-1 text-emerald-500" aria-hidden="true" />
            No open critical / high gaps — well done. Tidy up the medium / low items for a stronger posture.
          </p>
        ) : (
          <ul className="space-y-2">
            {openGaps.slice(0, 12).map(({ item, category }) => {
              const s = state.checks[item.id] ?? 'unset';
              return (
                <li
                  key={item.id}
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[item.severity].cls}`}
                    >
                      {item.severity}
                    </span>
                    <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[s].cls}`}>
                      {STATUS_STYLES[s].label}
                    </span>
                    <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {item.title}
                    </span>
                    <span className="text-micro font-mono text-slate-400 dark:text-slate-400">· {category.short}</span>
                  </div>
                  <p className="text-meta font-mono text-muted leading-relaxed">{item.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Legend */}
      <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-2">
          Scoring legend
        </h3>
        <ul className="grid sm:grid-cols-2 gap-1.5 text-sm font-mono text-muted">
          <li>
            <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES.covered.cls}`}>
              ✓ covered
            </span>{' '}
            — fully implemented and tested
          </li>
          <li>
            <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES.partial.cls}`}>
              ~ partial
            </span>{' '}
            — half-done or untested (counts 0.5×)
          </li>
          <li>
            <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES.gap.cls}`}>✗ gap</span>{' '}
            — known not done, on the to-do list
          </li>
          <li>
            <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES.na.cls}`}>n/a</span> —
            not applicable to your situation
          </li>
        </ul>
      </section>

      {/* External references */}
      <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-2">
          Authoritative sources
        </h3>
        <ul className="space-y-1.5 text-sm font-mono text-muted">
          <li>
            <a
              href={sanitizeUrl('https://github.com/lissy93/personal-security-checklist') || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Lissy93 — Personal Security Checklist (300+ tips, CC0)
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href={sanitizeUrl('https://digital-defense.io/') || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Digital Defense — interactive personal security checklist
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href={sanitizeUrl('https://ssd.eff.org/') || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              EFF Surveillance Self-Defense
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href={sanitizeUrl('https://www.cisa.gov/cybersecurity') || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              CISA — Cybersecurity Resources
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

function ItemRow({ item, state, cycle }: { item: CheckItem; state: State; cycle: (id: string) => void }): JSX.Element {
  const s = state.checks[item.id] ?? 'unset';
  return (
    <li className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <button
          onClick={() => cycle(item.id)}
          className={`text-micro font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[s].cls} hover:brightness-110`}
          aria-label={`Toggle status of ${item.title}`}
        >
          {s === 'unset' ? <Circle size={10} className="inline mr-1" aria-hidden="true" /> : null}
          {STATUS_STYLES[s].label}
        </button>
        <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[item.severity].cls}`}>
          {item.severity}
        </span>
        <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{item.title}</span>
      </div>
      <p className="text-meta font-mono text-muted leading-relaxed mb-1">{item.body}</p>
      {item.refs && item.refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.refs.map((r) => (
            <a
              key={r.href}
              href={sanitizeUrl(r.href) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              {r.label}
              <ExternalLink size={9} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </li>
  );
}
