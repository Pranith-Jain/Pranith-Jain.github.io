import { useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { PostAnalysisButton } from '../../components/threatintel/PostAnalysisButton';
import { sanitizeUrl } from '../../lib/sanitize-url';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitPullRequest,
  Search,
  ShieldAlert,
} from 'lucide-react';

type Klass = 'containment-breach' | 'agent-hijack' | 'supply-chain' | 'tool-misuse' | 'injection';

interface Slim {
  id: string;
  title: string;
  klass: Klass;
  sev: 'critical' | 'severe' | 'notable' | 'contained';
  tier: string;
  cbs: number;
  occurred: string;
  disclosed: string;
  dwell: number | null;
  autonomous: boolean;
  developer: string;
  purpose: string;
  failed: string[];
}

interface IndexDoc {
  registry: string;
  version: string;
  compiled: string;
  builtAt: string;
  cbsScale: string;
  stats: {
    entries: number;
    tierA: number;
    evalEnvBreaches: number;
    autonomous: number;
    medianDwellDays: number | null;
    dwellRange: [number, number] | null;
    mostAbsentGuardrail: { id: string; entries: number } | null;
    lastDisclosedAt: string | null;
    lastDisclosedId: string | null;
  };
  guardrailCounts: Record<string, number>;
  incidents: Slim[];
}

interface Docket extends Slim {
  actor: string;
  systems: string;
  targets: string;
  summary: string;
  disputed: string | null;
  chain: Record<string, string | null>;
  sources: { label: string; url: string }[];
}

interface Guardrail {
  id: string;
  title: string;
  def: string;
}

interface Tracker {
  name: string;
  url: string;
  kind: string;
  holds: string;
  checked: string;
}

const KLASS_LABEL: Record<Klass, string> = {
  'containment-breach': 'Containment breach',
  'agent-hijack': 'Agent hijack',
  'supply-chain': 'Supply chain',
  'tool-misuse': 'Tool misuse',
  injection: 'Injection',
};

const SEV_PILL: Record<string, string> = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  severe: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  notable: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  contained: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const CHAIN_STAGES = ['PRESSURE', 'PROBE', 'BREACH', 'CHANNEL', 'ESCALATE', 'PROPAGATE', 'HALT'];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function DocketView({ id }: { id: string }) {
  const [body, setBody] = useState<Docket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/v1/ai-escape/incidents/${encodeURIComponent(id)}`);
        if (r.ok && !cancelled) setBody((await r.json()) as Docket);
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-mini font-mono text-slate-500 mt-2">loading docket…</p>;
  if (!body) return <p className="text-mini font-mono text-slate-500 mt-2">docket unavailable</p>;

  return (
    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] space-y-3">
      <p className="text-sm text-body leading-relaxed">{body.summary}</p>
      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        <div>
          <span className="font-mono text-muted">actor: </span>
          <span className="text-body">{body.actor}</span>
        </div>
        <div>
          <span className="font-mono text-muted">systems: </span>
          <span className="text-body">{body.systems}</span>
        </div>
        <div>
          <span className="font-mono text-muted">targets: </span>
          <span className="text-body">{body.targets}</span>
        </div>
        <div>
          <span className="font-mono text-muted">deployed to do: </span>
          <span className="text-body">{body.purpose}</span>
        </div>
      </div>
      <div>
        <div className="text-micro font-mono uppercase tracking-wider text-muted mb-1.5">Containment chain</div>
        <ol className="space-y-1">
          {CHAIN_STAGES.map((stage) => (
            <li key={stage} className="flex gap-2 text-xs">
              <span className="font-mono text-rose-600 dark:text-rose-400 w-24 shrink-0">{stage}</span>
              <span className={body.chain[stage] ? 'text-body' : 'text-slate-400 font-mono'}>
                {body.chain[stage] ?? '—'}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {body.failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-mini font-mono text-muted mr-1">absent guardrails:</span>
          {body.failed.map((g) => (
            <span
              key={g}
              className="px-1.5 py-0.5 text-micro font-mono rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            >
              {g}
            </span>
          ))}
        </div>
      )}
      {body.disputed && (
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <span className="font-mono">disputed: </span>
          {body.disputed}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {body.sources.map((s) => (
          <a
            key={s.url}
            href={sanitizeUrl(s.url) ?? undefined}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-0.5 text-xs text-sky-600 dark:text-sky-400 hover:underline"
          >
            {s.label} <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ))}
      </div>
      <PostAnalysisButton
        title={`${body.id} — ${body.title}`}
        description={`${body.summary}\n\nFailed guardrails: ${body.failed.join(', ') || 'none named'}\nActor: ${body.actor}\nSystems: ${body.systems}`}
        source={body.sources[0]?.url ?? 'ai-escape registry'}
        compact
      />
    </div>
  );
}

export default function AiEscape(): JSX.Element {
  const [idx, setIdx] = useState<IndexDoc | null>(null);
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [klass, setKlass] = useState<'all' | Klass>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, gRes, tRes] = await Promise.all([
        fetch('/api/v1/ai-escape/'),
        fetch('/api/v1/ai-escape/guardrails'),
        fetch('/api/v1/ai-escape/trackers'),
      ]);
      if (!iRes.ok) throw new Error(`index HTTP ${iRes.status}`);
      const full = (await (await fetch('/api/v1/ai-escape/incidents?limit=100')).json()) as { incidents: Slim[] };
      const base = (await iRes.json()) as IndexDoc;
      base.incidents = full.incidents ?? [];
      setIdx(base);
      if (gRes.ok) setGuardrails(((await gRes.json()) as { guardrails: Guardrail[] }).guardrails ?? []);
      if (tRes.ok) setTrackers(((await tRes.json()) as { trackers: Tracker[] }).trackers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!idx) return [];
    const needle = query.toLowerCase().trim();
    return idx.incidents.filter((e) => {
      if (klass !== 'all' && e.klass !== klass) return false;
      if (needle && !`${e.id} ${e.title} ${e.developer} ${e.purpose}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [idx, klass, query]);

  const guardMax = useMemo(() => Math.max(1, ...Object.values(idx?.guardrailCounts ?? { _: 1 })), [idx]);
  const sinceDays = daysSince(idx?.stats.lastDisclosedAt ?? null);

  const issueUrl = useMemo(() => {
    const title = encodeURIComponent('[ai-escape] New incident report: <short title>');
    const body = encodeURIComponent(
      [
        '## What happened',
        '<mechanism over narrative — which control was supposed to catch this?>',
        '',
        '## Class',
        'containment-breach | agent-hijack | supply-chain | tool-misuse | injection',
        '',
        '## Date observed',
        'YYYY-MM-DD',
        '',
        '## What was the agent deployed to do',
        '<assigned task, not the failure>',
        '',
        '## Systems involved',
        '<model, framework, platform>',
        '',
        '## Sources (required)',
        '- https://…',
      ].join('\n')
    );
    return `https://github.com/Pranith-Jain/Pranith-Jain.github.io/issues/new?title=${title}&body=${body}`;
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="Threat Intel"
      icon={<Bot size={28} />}
      title="AI Escape Watch"
      description={
        <>
          A registry of AI agent containment failures — indexed by the control that failed, not the harm. Each entry
          carries the agent&apos;s assigned task, the seven-stage containment chain, the absent guardrails, and sources;
          disputed figures are flagged, never averaged. Seed corpus v0.1; new entries land via reviewed PRs to{' '}
          <span className="font-mono">threat-intel-staging/ai-escape/seed.json</span>.
        </>
      }
      loading={loading && !idx}
      error={error}
      onRetry={load}
    >
      {idx && (
        <>
          {/* Clock + stats */}
          <div className="surface-card p-4 mb-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="text-micro font-mono uppercase tracking-wider text-muted">
                Since last disclosed escape
              </div>
              <div className="text-2xl font-bold text-heading font-mono">
                {sinceDays ?? '—'}
                <span className="text-sm font-normal text-muted"> days</span>
              </div>
              <div className="text-mini font-mono text-slate-500">
                {idx.stats.lastDisclosedId ?? ''} · {fmtDate(idx.stats.lastDisclosedAt)}
              </div>
            </div>
            {[
              { label: 'Entries', value: idx.stats.entries },
              { label: 'Tier A', value: idx.stats.tierA },
              { label: 'Eval-env breaches', value: idx.stats.evalEnvBreaches },
              { label: 'Autonomous', value: idx.stats.autonomous },
              {
                label: 'Median dwell',
                value: idx.stats.medianDwellDays != null ? `${idx.stats.medianDwellDays}d` : '—',
              },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-micro font-mono uppercase tracking-wider text-muted">{label}</div>
                <div className="text-xl font-bold text-heading">{value}</div>
              </div>
            ))}
            {idx.stats.mostAbsentGuardrail && (
              <div>
                <div className="text-micro font-mono uppercase tracking-wider text-muted">Most-absent guardrail</div>
                <div className="text-xl font-bold text-rose-600 dark:text-rose-400 font-mono">
                  {idx.stats.mostAbsentGuardrail.id}
                </div>
                <div className="text-mini font-mono text-slate-500">
                  {idx.stats.mostAbsentGuardrail.entries} entries
                </div>
              </div>
            )}
          </div>

          <AiSummaryCard
            surface="AI Escape Watch"
            items={filtered.slice(0, 15).map((e) => ({
              title: `${e.id} — ${e.title}`,
              body: `${KLASS_LABEL[e.klass]} · ${e.sev} · CBS ${e.cbs} · failed: ${e.failed.join(', ') || 'none named'}`,
              source: 'ai-escape registry',
            }))}
            requireAdmin={false}
          />

          {/* Registry */}
          <div className="flex flex-col sm:flex-row gap-3 my-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search incidents, developers, tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-heading placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {(['all', 'containment-breach', 'agent-hijack', 'supply-chain', 'tool-misuse', 'injection'] as const).map(
              (k) => (
                <button
                  key={k}
                  onClick={() => setKlass(k)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border transition ${
                    klass === k
                      ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-rose-500/30'
                  }`}
                >
                  {k === 'all' ? 'All' : KLASS_LABEL[k]}
                </button>
              )
            )}
            <span className="ml-auto text-xs font-mono text-muted">
              {filtered.length} / {idx.stats.entries}
            </span>
          </div>

          <div className="grid gap-2 mb-8">
            {filtered.map((e) => {
              const open = openId === e.id;
              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50 p-4"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : e.id)}
                    className="w-full text-left"
                    aria-expanded={open}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-micro font-mono text-slate-500">{e.id}</span>
                          <span className={`px-1.5 py-0.5 text-micro font-mono rounded border ${SEV_PILL[e.sev]}`}>
                            {e.sev}
                          </span>
                          <span className="px-1.5 py-0.5 text-micro font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500">
                            tier {e.tier}
                          </span>
                          <span className="px-1.5 py-0.5 text-micro font-mono rounded bg-slate-100 dark:bg-white/5 text-body">
                            {KLASS_LABEL[e.klass]}
                          </span>
                          {e.autonomous && (
                            <span className="px-1.5 py-0.5 text-micro font-mono rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30">
                              autonomous
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-heading mt-1 leading-snug">{e.title}</h3>
                        <p className="text-xs text-muted mt-0.5">
                          Deployed to do: <span className="text-body">{e.purpose}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-sm font-mono font-bold text-heading"
                          title="Containment Breach Score (v0.1 draft)"
                        >
                          {e.cbs.toFixed(1)}
                        </span>
                        {open ? (
                          <ChevronUp className="w-3.5 h-3.5 text-muted" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-muted" />
                        )}
                      </div>
                    </div>
                    <p className="text-mini font-mono text-slate-500 mt-1">
                      {e.occurred} → disclosed {e.disclosed} · {e.developer}
                      {e.dwell != null && ` · dwell ${e.dwell}d`}
                    </p>
                  </button>
                  {open && <DocketView id={e.id} />}
                </div>
              );
            })}
          </div>

          {/* Guardrails */}
          <h2 className="flex items-center gap-2 text-lg font-bold text-heading mb-1">
            <ShieldAlert className="w-4 h-4 text-rose-500" /> Which guardrail was missing
          </h2>
          <p className="text-xs text-muted mb-3">
            Entries name more than one control, so counts sum above {idx.stats.entries}.
          </p>
          <div className="space-y-1.5 mb-8">
            {guardrails.map((g) => {
              const count = idx.guardrailCounts[g.id] ?? 0;
              return (
                <div key={g.id} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-heading w-28 shrink-0">{g.id}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${Math.round((count / guardMax) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-slate-500 w-8 text-right shrink-0">{count}</span>
                  <span className="hidden md:block text-xs text-muted flex-[2] truncate" title={g.def}>
                    {g.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Provenance */}
          <h2 className="text-lg font-bold text-heading mb-1">Who holds the evidence</h2>
          <p className="text-xs text-muted mb-3">A registry is only as good as the record behind it.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] mb-8">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-left">
                  <th className="px-3 py-2 font-semibold text-muted">Tracker</th>
                  <th className="px-3 py-2 font-semibold text-muted">Kind</th>
                  <th className="px-3 py-2 font-semibold text-muted">Holds</th>
                  <th className="px-3 py-2 font-semibold text-muted">Checked</th>
                </tr>
              </thead>
              <tbody>
                {trackers.map((t) => (
                  <tr
                    key={t.name}
                    className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <a
                        href={sanitizeUrl(t.url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                      >
                        {t.name}
                      </a>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{t.kind}</td>
                    <td className="px-3 py-2 text-body">{t.holds}</td>
                    <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{t.checked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Report */}
          <div className="surface-card p-4 flex flex-wrap items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-body flex-1 min-w-52">
              Report an incident — two fields required (what happened + account), sources mandatory. Nothing reaches the
              registry unreviewed.
            </p>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-mono bg-rose-600 dark:bg-rose-500 text-white hover:bg-rose-700 dark:hover:bg-rose-400 transition-colors"
            >
              <GitPullRequest className="w-3.5 h-3.5" /> Submit for review
            </a>
          </div>
        </>
      )}
    </DataPageLayout>
  );
}
