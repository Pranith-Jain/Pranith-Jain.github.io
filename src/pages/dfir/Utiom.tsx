import { useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Layers, ExternalLink, Download, RotateCcw, ChevronDown, ChevronRight, Network, Shield, BarChart3 } from 'lucide-react';
import {
  UTIOM_PHASES,
  UTIOM_PILLARS,
  UTIOM_DOCTRINE,
  UTIOM_PRINCIPLES,
  UTIOM_FAMILY,
  UTIOM_ASSESSMENT_TOOLS,
  UTIOM_META,
  UTIOM_STORAGE_KEY,
} from '../../data/frameworks';

// Minimal UTIOM self-assessment: 7 phases 0–5 + pillar derivation (client-only).
// Mirrors the utiom.de browser-only pattern (no backend, localStorage, printable).
type PhaseScore = 0 | 1 | 2 | 3 | 4 | 5;

const PHASE_LEVELS: Record<PhaseScore, string> = {
  0: 'Not started — no documented intent or ownership.',
  1: 'Ad hoc — individual effort, no repeatability.',
  2: 'Defined — documented, inconsistently honoured.',
  3: 'Managed — threat-informed, traceable to crown jewels, reviewed on cadence.',
  4: 'Measured — trended metrics, peer-reviewed, backlog-driven.',
  5: 'Optimising — automated, continuously validated, costed into planning.',
};

function loadUtiom(): Record<string, PhaseScore> {
  try {
    const raw = localStorage.getItem(UTIOM_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PhaseScore>;
  } catch { return {}; }
}

export default function Utiom(): JSX.Element {
  const [phaseScores, setPhaseScores] = useState<Record<string, PhaseScore>>(() => (typeof window === 'undefined' ? {} : loadUtiom()));
  const [tab, setTab] = useState<'overview' | 'lifecycle' | 'assess' | 'doctrine'>('overview');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['leadership']));

  useEffect(() => {
    try { localStorage.setItem(UTIOM_STORAGE_KEY, JSON.stringify(phaseScores)); } catch { /* quota */ }
  }, [phaseScores]);

  const pillarScores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of UTIOM_PILLARS) {
      const vals = p.phases.map((ph) => phaseScores[ph.id]).filter((v): v is PhaseScore => v !== undefined);
      out[p.id] = vals.length ? (vals as number[]).reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    }
    return out;
  }, [phaseScores]);

  const overall = useMemo(() => {
    const vals = Object.values(phaseScores) as number[];
    if (!vals.length) return 0;
    return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  }, [phaseScores]);

  const totalRated = Object.keys(phaseScores).length;

  const setPhase = (id: string, v: PhaseScore | null) =>
    setPhaseScores((prev) => {
      if (v === null) {
        const n = { ...prev };
        delete n[id];
        return n;
      }
      return { ...prev, [id]: v };
    });

  const exportMd = () => {
    const lines: string[] = ['# UTIOM — Unified Threat-Informed Operations Model', '', `v${UTIOM_META.version} · ${new Date().toISOString().slice(0, 10)}`, ''];
    lines.push(`Overall (mean of 7 phases): ${overall.toFixed(2)} · ${totalRated}/7 rated`);
    lines.push('');
    for (const pillar of UTIOM_PILLARS) {
      lines.push(`## ${pillar.name}: ${(pillarScores[pillar.id] ?? 0).toFixed(2)}`);
      for (const ph of pillar.phases) {
        const s = phaseScores[ph.id];
        lines.push(`- ${ph.name} (${ph.id}): ${s === undefined ? '—' : `${s} — ${PHASE_LEVELS[s as PhaseScore]}`}`);
      }
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `utiom-self-check-${new Date().toISOString().slice(0, 10)}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    if (confirm('Reset UTIOM self-check scores?')) {
      setPhaseScores({});
      localStorage.removeItem(UTIOM_STORAGE_KEY);
    }
  };

  return (
    <DataPageLayout
      backTo="/dfir/catalog"
      backLabel="DFIR catalog"
      maxWidthClass="max-w-6xl"
      icon={<Layers size={28} />}
      title="UTIOM — Unified Threat-Informed Operations Model"
      description={
        <>
          Local reference for <a href="https://utiom.de" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">utiom.de</a>{' '}
          v{UTIOM_META.version} (CC BY-SA 4.0 · Reza Adineh) — the operating model that ties TID-CMM (detection) and TIR-CMM (response) into one lifecycle. 7 phases across 3 pillars, V-model validation, and browser-only assessments. Nothing here is for sale.
        </>
      }
      headerExtra={
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-2.5 py-1 text-muted">
            self-check {totalRated}/7 rated · overall {overall.toFixed(2)}
          </span>
          <a href="https://utiom.de/utiom-framework-v1.1.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-brand-700 dark:text-brand-300 hover:bg-brand-500/15">
            Framework book (PDF) <ExternalLink size={11} />
          </a>
          <a href="https://utiom.de/utiom-assessment-workbook.xlsx" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-2.5 py-1 text-muted hover:border-brand-500/30">
            Workbook .xlsx <ExternalLink size={11} />
          </a>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(['overview', 'lifecycle', 'assess', 'doctrine'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${tab === t ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}>
            {t === 'overview' ? 'Overview & family' : t === 'lifecycle' ? 'Lifecycle (7 phases)' : t === 'assess' ? 'Self-check (7 phases)' : 'Doctrine & principles'}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={exportMd} className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1.5">
            <Download size={13} /> Export .md
          </button>
          <button onClick={reset} className="text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 inline-flex items-center gap-1.5">
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <p className="text-sm font-mono text-body leading-relaxed">
              UTIOM is a lifecycle framework for security operations that connects business strategy, threat-informed detection engineering, and incident response into a single measurable system. Governance and operations belong in the same place — a board risk decision and a detection rule are two ends of the same traceable thread. Incident Response is the operating mode, not a phase; threat intel, hunting, detection engineering and containment are expressions of response at different distances from impact.
            </p>
            <p className="text-mini font-mono text-muted mt-3">Your answers stay in your browser (same as the official tools). No backend, no analytics, no signup. Clear site data removes everything.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {UTIOM_PILLARS.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                <div className="text-mini font-mono uppercase tracking-wider text-muted">{p.id}</div>
                <div className="font-display font-semibold">{p.name}</div>
                <div className="text-mini font-mono text-muted mt-1">{p.blurb}</div>
                <div className="text-mini font-mono text-body mt-2">{p.phases.map((ph) => ph.name).join(' → ')}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><Network size={16} /> Framework family</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {UTIOM_FAMILY.map((f) => (
                <div key={f.id} className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-3">
                  <div className="font-mono text-xs font-bold">{f.name as string} <span className="font-normal text-muted">{f.version as string}</span></div>
                  <div className="text-mini font-mono text-body">{f.label as string}</div>
                  <div className="text-micro font-mono text-muted mt-1">{f.blurb as string}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><BarChart3 size={16} /> Assessment tools (browser-only)</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {UTIOM_ASSESSMENT_TOOLS.map((t) => (
                <a key={(t as { id: string }).id} href={(t as { url: string }).url} target="_blank" rel="noopener noreferrer" className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-3 hover:border-brand-500/40 block">
                  <div className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{(t as { name: string }).name}</div>
                  <div className="text-mini font-mono text-muted">{(t as { meta: string }).meta} · {(t as { question: string }).question}</div>
                </a>
              ))}
            </div>
            <p className="text-mini font-mono text-muted mt-3">Official tools: <a href="https://utiom.de/maturity.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">maturity</a> · <a href="https://utiom.de/capability.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">capability</a> · <a href="https://utiom.de/metrics.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">metrics</a> · <a href="https://utiom.de/dashboard.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">dashboard</a> · <a href="https://utiom.de/roadmap.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">roadmap</a>.</p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
            <h3 className="font-display font-semibold mb-2">How UTIOM makes you more mature in TID-CMM / TIR-CMM</h3>
            <ul className="text-sm font-mono text-body space-y-1.5 list-disc pl-5">
              <li><span className="font-semibold">Crown jewels → scoping</span> — UTIOM produces the registry TID-CMM derives its in-scope ATT&CK set from.</li>
              <li><span className="font-semibold">Threat profiling → TI domain</span> — the documented adversary set the first TID-CMM domain scores.</li>
              <li><span className="font-semibold">Visibility → telemetry assurance</span> — gap report that is the raw material for TID-CMM's assured/partial/weak/blind computation.</li>
              <li><span className="font-semibold">Detection-as-code → DE domain</span> — version control, CI/CD, testing, traceability.</li>
              <li><span className="font-semibold">Validation → AV domain</span> — purple team emulating profiled adversaries, failed detections as engineering defects.</li>
              <li><span className="font-semibold">Response & improvement → TIR-CMM</span> — containment authority, tempo vs. breakout, decision latency.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'lifecycle' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <p className="text-sm font-mono text-body leading-relaxed">Seven phases across three pillars. Each phase consumes and produces knowledge; the output of one becomes the input to the next. The V-model pairs every design decision on the left with a validation activity on the right.</p>
          </div>
          {UTIOM_PILLARS.map((pillar) => {
            const open = expanded.has(pillar.id);
            return (
              <div key={pillar.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
                <button onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(pillar.id) ? n.delete(pillar.id) : n.add(pillar.id); return n; })} className="w-full flex items-center gap-3 text-left px-4 py-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted">{pillar.id}</span>
                  <span className="font-display font-semibold flex-1">{pillar.name}</span>
                  <span className="text-xs font-mono text-muted hidden sm:inline">{pillar.blurb}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-100))]">{(pillarScores[pillar.id] ?? 0).toFixed(1)}/5</span>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-[rgb(var(--border-400)/0.6)] pt-3">
                    {pillar.phases.map((ph) => (
                      <div key={ph.id} className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-3">
                        <div className="font-display font-semibold text-sm">{ph.name}</div>
                        <div className="text-mini font-mono text-body">{ph.legend}</div>
                        <div className="text-micro font-mono text-muted mt-1">Maps to: {ph.mapsTo.join(' · ')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
            <h3 className="font-display font-semibold mb-2">The seven phases in order</h3>
            <ol className="text-sm font-mono text-body space-y-1.5 list-decimal pl-5">
              {UTIOM_PHASES.map((ph) => (
                <li key={ph.id}><span className="font-semibold">{ph.name}</span> <span className="text-muted">({ph.pillar})</span> — {ph.legend} <span className="text-micro text-slate-400">[{ph.mapsTo.join(', ')}]</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {tab === 'assess' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-amber-500/5 p-3 text-xs font-mono text-body">
            Lightweight self-check (7 phases, 0–5). For the full staged model use the official <a href="https://utiom.de/maturity.html" className="text-brand-600 dark:text-brand-400 hover:underline">maturity assessment</a> (50 criteria, staged) and <a href="https://utiom.de/capability.html" className="text-brand-600 dark:text-brand-400 hover:underline">capability assessment</a> (105 indicators) — both browser-only at utiom.de. This check is directional; do not report it externally.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {UTIOM_PILLARS.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 text-center">
                <div className="text-mini font-mono uppercase tracking-wider text-muted">{p.name}</div>
                <div className="text-xl font-mono font-bold">{(pillarScores[p.id] ?? 0).toFixed(2)}</div>
                <div className="text-micro font-mono text-muted">{p.phases.length} phases</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {UTIOM_PHASES.map((ph) => {
              const val = phaseScores[ph.id];
              return (
                <div key={ph.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{ph.pillar}</span>
                    <span className="font-display font-semibold">{ph.name}</span>
                    <span className="text-mini font-mono text-muted">— {ph.legend}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {([0, 1, 2, 3, 4, 5] as PhaseScore[]).map((n) => (
                      <button key={n} onClick={() => setPhase(ph.id, n)} className={`text-xs font-mono px-2.5 py-1 rounded border min-w-[2.2rem] ${val === n ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}>{n}</button>
                    ))}
                    <button onClick={() => setPhase(ph.id, null)} className="text-xs font-mono px-2.5 py-1 rounded border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-400">clear</button>
                    <span className="text-xs font-mono text-muted self-center">{val === undefined ? '— not rated' : `Level ${val}: ${PHASE_LEVELS[val]}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'doctrine' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Shield size={16} /> The seven laws</h3>
            <ol className="space-y-3">
              {UTIOM_DOCTRINE.map((law) => (
                <li key={law.n} className="flex gap-3">
                  <span className="flex-none w-7 h-7 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 font-mono text-xs font-bold flex items-center justify-center">{law.n}</span>
                  <div>
                    <div className="font-display font-semibold text-sm">{law.title}</div>
                    <div className="text-sm font-mono text-body leading-relaxed">{law.blurb}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-3">Five principles</h3>
            <ul className="space-y-2">
              {UTIOM_PRINCIPLES.map((p) => (
                <li key={p.n} className="text-sm font-mono"><span className="font-bold">{p.title}</span> — {p.blurb}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
            <h3 className="font-display font-semibold mb-2">Standards alignment</h3>
            <p className="text-sm font-mono text-body">UTIOM operationalises NIST CSF 2.0 (Govern → Identify → Detect → Respond), ISO 27001:2022 Annex A, NIS2 Article 21 (effectiveness assessment), DORA, SOC-CMM, MITRE ATT&CK + DeTT&CT. Full domain-by-domain mapping at <a href="https://utiom.de/standards-alignment/" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">utiom.de/standards-alignment <ExternalLink size={11} /></a>.</p>
          </div>
        </div>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted mb-2">Attribution & licence</h2>
        <p className="text-sm font-mono text-muted">UTIOM framework, assessments and workbook © 2026 Reza Adineh, licensed CC BY-SA 4.0. This page is a local reference; authoritative copy and browser tools at <a href="https://utiom.de" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">utiom.de</a>. Also see <a href="https://tid-cmm.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">TID-CMM</a> and <a href="https://tir-cmm.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">TIR-CMM</a>.</p>
      </section>
    </DataPageLayout>
  );
}
