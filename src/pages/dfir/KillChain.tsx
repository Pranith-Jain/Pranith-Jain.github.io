import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { Crosshair, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { KILL_CHAIN, KILL_CHAIN_TECHNIQUE_COUNT, type KillChainPhase } from '../../data/kill-chain';

function PhaseHeader({
  phase,
  expanded,
  onToggle,
}: {
  phase: KillChainPhase;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 text-left rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.6)] px-4 py-3 transition-colors"
      aria-expanded={expanded}
    >
      <span className="flex-none w-9 h-9 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 font-display font-bold flex items-center justify-center">
        {phase.number}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-display font-semibold text-slate-900 dark:text-slate-100">{phase.name}</span>
        <span className="block text-xs font-mono text-muted truncate">{phase.short}</span>
      </span>
      <span className="flex-none text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {phase.techniques.length} techniques
      </span>
      {expanded ? (
        <ChevronDown size={16} className="flex-none text-slate-400" aria-hidden="true" />
      ) : (
        <ChevronRight size={16} className="flex-none text-slate-400" aria-hidden="true" />
      )}
    </button>
  );
}

function PhaseBody({ phase }: { phase: KillChainPhase }): JSX.Element {
  return (
    <div className="animate-fade-in-up overflow-hidden">
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200)/0.5)] mt-2 p-4 space-y-4">
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{phase.description}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <h4 className="text-micro font-mono uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400 mb-1">
              Attacker goal
            </h4>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{phase.attackerGoal}</p>
          </div>
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <h4 className="text-micro font-mono uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-1">
              Defender goal
            </h4>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{phase.defenderGoal}</p>
          </div>
        </div>

        <div>
          <h4 className="text-micro font-mono uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-2">
            Techniques
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {phase.techniques.map((t) => (
              <div
                key={t.label}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2.5"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-display font-semibold text-slate-900 dark:text-slate-100">
                    {t.label}
                  </span>
                  {t.attack && (
                    <Link
                      to={`/threatintel/mitre?id=${encodeURIComponent(t.attack)}`}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/60"
                      title={`Open ${t.attack} in MITRE ATT&CK`}
                    >
                      {t.attack}
                    </Link>
                  )}
                </div>
                <p className="text-mini font-mono text-muted leading-relaxed">{t.example}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <h4 className="text-micro font-mono uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400 mb-2">
              Detection
            </h4>
            <ul className="space-y-1 text-mini font-mono text-slate-700 dark:text-slate-300 leading-relaxed list-disc pl-4">
              {phase.detection.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <h4 className="text-micro font-mono uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-2">
              Controls
            </h4>
            <ul className="space-y-1 text-mini font-mono text-slate-700 dark:text-slate-300 leading-relaxed list-disc pl-4">
              {phase.controls.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function KillChain(): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['reconnaissance']));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(KILL_CHAIN.map((p) => p.id)));
  const collapseAll = () => setExpanded(new Set());

  const allOpen = expanded.size === KILL_CHAIN.length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Crosshair size={28} className="text-brand-600 dark:text-brand-400" /> Cyber Kill Chain
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Lockheed Martin's 7-phase intrusion model. {KILL_CHAIN_TECHNIQUE_COUNT} representative techniques across the
          chain, each cross-linked to MITRE ATT&amp;CK where applicable.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Pairs naturally with the{' '}
          <Link to="/dfir/diamond" className="text-brand-600 dark:text-brand-400 hover:underline">
            Diamond Model
          </Link>
          : the kill chain answers <em>where</em> in the intrusion timeline; the diamond answers <em>who</em> and{' '}
          <em>against what</em>.
        </p>
      </div>

      <div className="flex justify-end gap-2 mb-3">
        <button
          onClick={allOpen ? collapseAll : expandAll}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="space-y-2">
        {KILL_CHAIN.map((phase) => (
          <div key={phase.id}>
            <PhaseHeader phase={phase} expanded={expanded.has(phase.id)} onToggle={() => toggle(phase.id)} />
            {expanded.has(phase.id) && <PhaseBody phase={phase} />}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-muted">
          <li>
            <a
              href="https://www.lockheedmartin.com/en-us/capabilities/cyber/cyber-kill-chain.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Lockheed Martin · Cyber Kill Chain
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://attack.mitre.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              MITRE ATT&amp;CK
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
