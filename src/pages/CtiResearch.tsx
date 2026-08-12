import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Workflow,
  Database,
  Link2,
  ShieldAlert,
  FileCheck2,
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Radio,
  Search,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { readAdminToken, adminAuthHeaders } from '../lib/admin-token';

interface HistoryEntry {
  id: string;
  query: string;
  queryType: string;
  qualityScore: number;
  modelUsed: string;
  completedAt: string;
  iocCount: number;
  actorCount: number;
  keyFindings: string[];
}

const WORKFLOW = [
  {
    step: 'Plan',
    text: 'The research manager decomposes the intelligence requirement into a stepwise investigation plan.',
  },
  {
    step: 'Research',
    text: 'Investigators fan out across web and structured CTI sources, calling focused intel tools per step.',
  },
  {
    step: 'Validate',
    text: 'Every finding is checked against its source; evidence is correlated and cross-referenced.',
  },
  {
    step: 'Connect',
    text: 'Threat actors, techniques, vulnerabilities, campaigns, and IOCs are linked into a shared relationship graph.',
  },
  {
    step: 'Challenge',
    text: 'A skeptic stage attacks unsupported claims and forces the case to stand on evidence alone.',
  },
  {
    step: 'Review',
    text: 'An evidence reviewer verifies provenance, consistency, and completeness before anything is reported.',
  },
  {
    step: 'Recommend',
    text: 'Prioritized detection use cases and threat hunts are produced, ranked by relevance and confidence.',
  },
];

const CAPABILITIES = [
  {
    icon: Bot,
    title: 'Multi-agent research',
    text: 'A central Research Manager plans and coordinates the investigation; specialist agents execute focused tool calls.',
  },
  {
    icon: Database,
    title: 'Web + structured CTI',
    text: 'Research spans live web and structured sources — NVD, CISA KEV, OSV, GitHub Advisories, MITRE ATT&CK, and VirusTotal.',
  },
  {
    icon: Link2,
    title: 'Evidence-backed CTI graph',
    text: 'Findings carry provenance and are connected across actors, techniques, vulnerabilities, campaigns, and IOCs.',
  },
  {
    icon: ShieldAlert,
    title: 'Skeptic stage',
    text: 'Unsupported findings are actively challenged instead of being rubber-stamped into the report.',
  },
  {
    icon: FileCheck2,
    title: 'Evidence reviewer',
    text: 'A dedicated review stage verifies evidence before any conclusion is recorded in the investigation.',
  },
  {
    icon: Target,
    title: 'Prioritized detections',
    text: 'Output is ranked detection use cases and threat hunts, ready to drop into your detection stack.',
  },
  {
    icon: History,
    title: 'Persistent investigations',
    text: 'Investigations and their runtime state persist — resume later, or replay the reasoning from any step.',
  },
  {
    icon: Radio,
    title: 'Real-time UI',
    text: 'The operator UI streams step events live from the backend as the research makes progress.',
  },
  {
    icon: Sparkles,
    title: 'Report validation',
    text: 'An investigation is only considered complete once its report has passed validation.',
  },
];

const OUTCOMES = [
  {
    icon: CheckCircle2,
    name: 'SIGNAL_FOUND',
    tone: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40',
    text: 'The requirement was substantiated with evidence — actors, techniques, and IOCs are prioritized for detection.',
  },
  {
    icon: XCircle,
    name: 'NO_SIGNAL',
    tone: 'text-slate-600 dark:text-slate-300 border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]',
    text: 'The research completed without finding relevant signals — a clean result, not a failure.',
  },
  {
    icon: AlertTriangle,
    name: 'INSUFFICIENT_EVIDENCE',
    tone: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40',
    text: 'The question outran the available evidence — the investigation names the gaps precisely, so they are actionable.',
  },
];

const INTEGRATIONS = ['NVD', 'CISA KEV', 'OSV', 'GitHub Advisories', 'MITRE ATT&CK', 'VirusTotal'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  if (score > 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-500 dark:text-slate-400';
}

export default function CtiResearch(): JSX.Element {
  const [operator, setOperator] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [histError, setHistError] = useState<string | null>(null);

  useEffect(() => {
    if (!readAdminToken()) return;
    setOperator(true);
    fetch('/api/v1/agent/history?limit=6', { headers: adminAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { entries: HistoryEntry[] };
        setHistory(data.entries);
      })
      .catch((e: Error) => setHistError(e.message));
  }, []);

  return (
    <>
      <PageMeta
        title="CTI Research"
        description="Describe your environment and intelligence requirement, and get an evidence-backed threat assessment — prioritized threat actors, MITRE ATT&CK techniques, behaviours, and IOCs for detection and threat hunting."
        canonicalPath="/cti-research"
        section="Threat Intel"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-14">
        {/* ── Hero ── */}
        <section>
          <div className="text-mini font-mono uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-2">
            <Workflow size={13} /> Autonomous CTI Research
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white leading-tight">
            From intelligence requirement to{' '}
            <span className="text-brand-600 dark:text-brand-400">evidence-backed threat assessment</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Instead of hours spent researching disjointed sources, describe your environment and intelligence
            requirements. The platform plans a research workflow, executes it across web and structured CTI sources,
            validates the evidence, and returns prioritized detection and threat-hunting recommendations.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-4 max-w-3xl">
            <div className="text-mini font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Example requirement
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-mono">
              “We operate in XYZ industry and XYZ region. Which threat actors, MITRE ATT&CK techniques, behaviours, and
              IOCs should we prioritize for detection and threat hunting?”
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/dfir/agent-suite"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
            >
              <Search size={14} /> Try the research engine <ArrowRight size={14} />
            </Link>
            <a
              href="#live"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-700 dark:text-slate-200 hover:border-brand-500 transition-colors"
            >
              See it in action
            </a>
          </div>

          <blockquote className="mt-8 border-l-2 border-brand-500 pl-4 text-sm text-slate-500 dark:text-slate-400 italic max-w-3xl">
            The research process can be complex behind the scenes. The output should be simple, useful, and actionable
            for the security professional.
          </blockquote>
        </section>

        {/* ── Workflow ── */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">The research workflow</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {WORKFLOW.map((w, i) => (
              <div
                key={w.step}
                className="surface-card p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-micro font-bold px-1.5 py-0.5 rounded border border-brand-500/40 text-brand-600 dark:text-brand-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    {w.step}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{w.text}</p>
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-500))] p-4 flex items-center gap-3">
              <Target size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold">End state:</span> a prioritized set of detection use cases and threat
                hunts — each traceable to the evidence that supports it.
              </p>
            </div>
          </div>
        </section>

        {/* ── Working today ── */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Working today</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            The platform is live on this site — multi-agent research coordinated by a central manager, with evidence
            review baked into every investigation.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className="surface-card p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600"
              >
                <c.icon size={16} className="text-brand-600 dark:text-brand-400 mb-2" />
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">{c.title}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Outcome model ── */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Clear outcomes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {OUTCOMES.map((o) => (
              <div key={o.name} className="surface-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <o.icon size={15} className={o.tone.split(' ')[0]} />
                  <span className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${o.tone}`}>
                    {o.name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{o.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Integrations ── */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Research integrations</h2>
          <div className="flex flex-wrap gap-2">
            {INTEGRATIONS.map((name) => (
              <span
                key={name}
                className="font-mono text-micro font-bold px-2.5 py-1 rounded-full border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--surface-200))]"
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* ── Live panel ── */}
        <section id="live">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Live engine</h2>
          {!operator ? (
            <div className="surface-card p-6">
              <div className="flex items-start gap-3">
                <Lock size={18} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                    Research engine is operator-gated
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
                    The investigation API requires an operator session. Sign in from the agent suite to run live
                    investigations and see this panel populate with recent outcomes.
                  </p>
                  <Link
                    to="/dfir/agent-suite"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Open the agent suite <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          ) : histError ? (
            <div className="surface-card p-6 text-xs text-rose-600 dark:text-rose-400">
              Could not load investigation history: {histError}
            </div>
          ) : (
            <div className="space-y-2">
              {history === null ? (
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-brand-500 rounded-full animate-spin" />
                  Loading recent investigations…
                </div>
              ) : history.length === 0 ? (
                <div className="surface-card p-6 text-xs text-slate-500 dark:text-slate-400">
                  No completed investigations yet — run one from the agent suite.
                </div>
              ) : (
                history.map((e) => (
                  <div key={e.id} className="surface-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot size={14} className="text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {e.query}
                        </span>
                      </div>
                      <span className={`font-mono text-micro font-bold shrink-0 ${scoreColor(e.qualityScore)}`}>
                        {e.qualityScore}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{timeAgo(e.completedAt)}</span>
                      <span className="font-mono">{e.queryType}</span>
                      {e.iocCount > 0 && <span>{e.iocCount} IOCs</span>}
                      {e.actorCount > 0 && <span>{e.actorCount} actors</span>}
                    </div>
                    {e.keyFindings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.keyFindings.slice(0, 3).map((f, i) => (
                          <span
                            key={i}
                            className="text-mini font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300 truncate max-w-[220px]"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div className="pt-2">
                <Link
                  to="/dfir/agent-suite"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Open all investigations <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
