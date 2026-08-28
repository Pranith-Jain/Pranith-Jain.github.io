import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ShieldCheck, Download, RotateCcw, ExternalLink, ChevronDown, ChevronRight, Layers, Target, Eye, Wrench, Search, Zap, Activity, Scale } from 'lucide-react';
import {
  TID_CMM_DOMAINS,
  TID_CMM_LEVELS,
  TID_CMM_META,
  TID_STORAGE_KEY,
  loadTidAssessment,
  saveTidAssessment,
  scoreTidCmm,
  type MaturityLevel,
} from '../../data/frameworks';

const LEVEL_PILLS: Record<number, string> = {
  0: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  1: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
  2: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
  3: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
  4: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30',
  5: 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/30',
};

const DOMAIN_ICONS: Record<string, typeof ShieldCheck> = {
  TI: Target,
  TM: Layers,
  DC: Eye,
  DE: Wrench,
  AV: Search,
  AA: Zap,
  IR: Activity,
  GV: Scale,
};

function levelLabel(n: number): string {
  return TID_CMM_LEVELS.find((l) => l.value === n)?.name ?? String(n);
}

export default function TidCmm(): JSX.Element {
  const [scores, setScores] = useState<Record<string, number | 'NA' | null>>(() => {
    if (typeof window === 'undefined') return {};
    return loadTidAssessment();
  });
  const [evidenced, setEvidenced] = useState<Record<string, boolean>>({});
  const [ti2Lifted, setTi2Lifted] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['TI']));
  const [tab, setTab] = useState<'assess' | 'model' | 'scoring'>('assess');

  useEffect(() => {
    saveTidAssessment(scores);
  }, [scores]);

  const result = useMemo(() => scoreTidCmm({ scores, evidenced, ti2Lifted }), [scores, evidenced, ti2Lifted]);

  const totalRated = useMemo(() => Object.values(scores).filter((v) => v !== null && v !== undefined).length, [scores]);

  const setScore = (id: string, v: number | 'NA' | null) =>
    setScores((prev) => {
      if (v === null) {
        const n = { ...prev };
        delete n[id];
        return n;
      }
      return { ...prev, [id]: v };
    });

  const exportMd = () => {
    const lines: string[] = ['# TID-CMM Self-Assessment', '', `Model ${TID_CMM_META.version} · ATT&CK ${TID_CMM_META.attack.version} · ${new Date().toISOString().slice(0, 10)}`, ''];
    lines.push(`**Overall: ${result.overall.toFixed(2)} — ${result.band}**`);
    if (result.constraintsApplied.length) lines.push(`Constraints applied: ${result.constraintsApplied.join(', ')}`);
    lines.push('');
    for (const d of result.domains) {
      const meta = TID_CMM_DOMAINS.find((x) => x.id === d.domainId)!;
      lines.push(`## ${d.domainId} — ${meta.name}: ${d.adjusted.toFixed(2)} (raw ${d.raw.toFixed(2)})`);
      if (d.capNotes.length) lines.push(`> ${d.capNotes.join(' · ')}`);
      for (const s of d.subcaps) {
        const sc = meta.subcaps.find((x) => x.id === s.id)!;
        const raw = s.na ? 'N/A' : s.raw === null ? '—' : String(s.raw);
        const adj = s.na ? 'N/A' : s.adjusted === null ? '—' : String(s.adjusted);
        const cap = s.cappedBy ? ` [${s.cappedBy}]` : '';
        lines.push(`- **${s.id} ${sc.name}**: raw ${raw} → adjusted ${adj}${cap} — ${levelLabel((s.adjusted ?? 0) as number)}`);
      }
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tid-cmm-assessment-${new Date().toISOString().slice(0, 10)}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    if (confirm('Reset all TID-CMM scores?')) {
      setScores({});
      setEvidenced({});
      setTi2Lifted(false);
      localStorage.removeItem(TID_STORAGE_KEY);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <DataPageLayout
      backTo="/dfir/catalog"
      backLabel="DFIR catalog"
      maxWidthClass="max-w-6xl"
      icon={<ShieldCheck size={28} />}
      title="TID-CMM — Threat-Informed Detection Maturity"
      description={
        <>
          Interactive replica of <a href="https://tid-cmm.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">tid-cmm.com</a>{' '}
          v{TID_CMM_META.version} (CC BY 4.0 · Reza Adineh) · 8 domains · 58 sub-capabilities · ATT&CK Enterprise {TID_CMM_META.attack.version} ({TID_CMM_META.attack.techniques} techniques).
          Score 0–5 per sub-capability; the engine applies C1–C5 ceilings exactly as the official tool does. All data stays in your browser.
        </>
      }
      headerExtra={
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-2.5 py-1 text-muted">
            {totalRated}/58 rated · overall {result.overall.toFixed(2)} · {result.band}
          </span>
          {result.constraintsApplied.length > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
              ceilings: {result.constraintsApplied.join(' · ')}
            </span>
          )}
          <a href="https://tid-cmm.com/assess" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-brand-700 dark:text-brand-300 hover:bg-brand-500/15">
            Official assessment <ExternalLink size={11} />
          </a>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(['assess', 'model', 'scoring'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${tab === t ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}>
            {t === 'assess' ? 'Assess' : t === 'model' ? 'Model (8 domains)' : 'Scoring & constraints'}
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

      {tab === 'assess' && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-amber-500/5 p-3 mb-4 flex flex-wrap items-center gap-3 text-xs font-mono">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={ti2Lifted} onChange={(e) => setTi2Lifted(e.target.checked)} />
              TI.2 ceiling lifted (you modified the suggested threat profile)
            </label>
            <span className="text-muted">· C5 caps TI.2 at 2 when the profile was accepted unchanged.</span>
            <span className="ml-auto text-muted hidden sm:inline">Evidence flag: tick per sub-cap when a named artefact backs a 4/5 (C3 strict mode).</span>
          </div>

          <div className="grid gap-3 mb-6 sm:grid-cols-2 lg:grid-cols-4">
            {result.domains.map((d) => {
              const meta = TID_CMM_DOMAINS.find((x) => x.id === d.domainId)!;
              const Icon = DOMAIN_ICONS[d.domainId] ?? ShieldCheck;
              const pct = Math.round((d.adjusted / 5) * 100);
              return (
                <div key={d.domainId} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className="text-brand-600 dark:text-brand-400" />
                    <span className="font-mono text-xs font-bold">{d.domainId}</span>
                    <span className="text-mini font-mono text-muted truncate">{meta.name}</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-lg font-mono font-bold">{d.adjusted.toFixed(2)}</span>
                    <span className="text-mini font-mono text-muted">raw {d.raw.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
                    <div className={`h-full ${pct >= 60 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                  {d.capNotes.length > 0 && <p className="text-micro font-mono text-amber-700 dark:text-amber-300 mt-1 leading-tight">{d.capNotes.join(' · ')}</p>}
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            {TID_CMM_DOMAINS.map((domain) => {
              const res = result.domains.find((x) => x.domainId === domain.id)!;
              const open = expanded.has(domain.id);
              const Icon = DOMAIN_ICONS[domain.id] ?? ShieldCheck;
              return (
                <div key={domain.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
                  <button onClick={() => toggle(domain.id)} className="w-full flex items-center gap-3 text-left px-4 py-3">
                    <Icon size={16} className="text-brand-600 dark:text-brand-400" />
                    <span className="font-mono text-xs font-bold">{domain.id}</span>
                    <span className="font-display font-semibold text-sm flex-1">{domain.name}</span>
                    <span className="text-xs font-mono text-muted hidden sm:inline">{domain.weight.toFixed(1)}%</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${LEVEL_PILLS[Math.round(res.adjusted)] ?? LEVEL_PILLS[0]}`}>{res.adjusted.toFixed(2)}</span>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <p className="px-4 -mt-2 mb-2 text-xs font-mono text-muted">{domain.question}</p>
                  {open && (
                    <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-[rgb(var(--border-400)/0.6)] pt-3">
                      {domain.subcaps.map((sc) => {
                        const r = res.subcaps.find((x) => x.id === sc.id)!;
                        const val = scores[sc.id];
                        return (
                          <div key={sc.id} className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-3">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{sc.id}</span>
                              <span className="font-display font-semibold text-sm">{sc.name}</span>
                              <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${sc.profile === 'essential' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : sc.profile === 'comprehensive' ? 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted'}`}>{sc.profile}</span>
                              <span className="text-micro font-mono text-slate-400">{sc.weight.toFixed(1)}% of {domain.id}</span>
                              {r.cappedBy && <span className="text-micro font-mono px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">{r.cappedBy}</span>}
                              <label className="ml-auto inline-flex items-center gap-1 text-micro font-mono text-muted">
                                <input type="checkbox" checked={!!evidenced[sc.id]} onChange={(e) => setEvidenced((p) => ({ ...p, [sc.id]: e.target.checked }))} /> evidence
                              </label>
                            </div>
                            <p className="text-mini font-mono text-body leading-relaxed mb-2">{sc.question}</p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {([0, 1, 2, 3, 4, 5] as MaturityLevel[]).map((n) => {
                                const active = val === n;
                                return (
                                  <button key={n} onClick={() => setScore(sc.id, n)} className={`text-xs font-mono px-2 py-1 rounded border min-w-[2.2rem] ${active ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'}`}>
                                    {n}
                                  </button>
                                );
                              })}
                              <button onClick={() => setScore(sc.id, 'NA')} className={`text-xs font-mono px-2 py-1 rounded border ${val === 'NA' ? 'border-slate-500 bg-slate-500/15 text-slate-700 dark:text-slate-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-500/40'}`}>N/A</button>
                              <button onClick={() => setScore(sc.id, null)} className="text-xs font-mono px-2 py-1 rounded border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-400 hover:text-slate-600">clear</button>
                              <span className="text-xs font-mono text-muted ml-1 self-center">{r.raw === null || r.raw === undefined ? '—' : `raw ${String(r.raw)}`} {r.adjusted !== r.raw && r.adjusted !== null ? `→ ${r.adjusted}` : ''}</span>
                            </div>
                            {typeof val === 'number' && sc.levels[String(val)] && (
                              <p className="text-mini font-mono text-muted bg-white dark:bg-[rgb(var(--surface-200))] rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-2 leading-relaxed">
                                <span className="font-semibold text-heading">Level {val} — {levelLabel(val)}:</span> {sc.levels[String(val)]}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'model' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TID_CMM_DOMAINS.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
                <div className="text-mini font-mono uppercase tracking-wider text-muted">{d.id} · {d.weight.toFixed(1)}%</div>
                <div className="font-display font-semibold text-sm">{d.name}</div>
                <div className="text-mini font-mono text-muted">{d.subcaps.length} sub-capabilities</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2">58 sub-capabilities</h3>
            <p className="text-sm font-mono text-muted mb-3">Every sub-capability is scored 0–5 against explicit descriptors. Domain score = weighted mean of in-scope sub-caps; overall = weighted mean of domains.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead><tr className="text-mini uppercase tracking-wider text-muted border-b"><th className="text-left py-2">ID</th><th className="text-left">Name</th><th className="text-right">Wt</th><th className="text-left pl-4">Profile</th></tr></thead>
                <tbody>
                  {TID_CMM_DOMAINS.flatMap((d) => d.subcaps).map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 dark:border-[rgb(var(--border-400)/0.4)]"><td className="py-1.5 font-bold text-brand-600 dark:text-brand-400">{s.id}</td><td>{s.name}</td><td className="text-right">{s.weight.toFixed(1)}%</td><td className="pl-4 text-muted">{s.profile}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
            <h3 className="font-display font-semibold mb-2">Maturity levels 0–5</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {TID_CMM_LEVELS.map((l) => (
                <div key={l.value} className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
                  <div className="font-mono text-xs font-bold">{l.value} — {l.name}</div>
                  <div className="text-mini font-mono text-muted leading-relaxed">{l.summary}</div>
                  <div className="text-micro font-mono text-slate-400 mt-1">Evidence: {l.evidenceBar}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'scoring' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2">Integrity constraints (ceilings only lower a score)</h3>
            <ul className="space-y-2 text-sm font-mono text-body">
              <li><span className="font-bold">C1 Validation ceiling</span> — no domain may be scored above AV + 1. You cannot claim measured, validated detection if you have never emulated an adversary against it.</li>
              <li><span className="font-bold">C2 Visibility ceiling</span> — DE may not exceed DC + 1. Detection logic cannot be more mature than the telemetry it runs on.</li>
              <li><span className="font-bold">C3 Evidence rule</span> — any 4 or 5 without a named artefact is downgraded to 3 (strict mode toggle per sub-cap).</li>
              <li><span className="font-bold">C4 Intent ceiling</span> — DC and DE may not exceed max(TI, TM) + 1. Sensors without intent produce noise, not defence.</li>
              <li><span className="font-bold">C5 Inherited intent</span> — TI.2 may not exceed 2 where the adversary set was accepted from the tool's suggestion unchanged (lift by ticking the box above).</li>
            </ul>
            <p className="text-mini font-mono text-muted mt-3">Application order: C3 → C4 → C2 → C1 (C2 sees DC already capped by C4). See <a href="https://tid-cmm.com/methodology/constraints/" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">methodology/constraints</a>.</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2">Maturity bands</h3>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {['0–0.99 Absent', '1–1.99 Ad hoc', '2–2.99 Repeatable', '3–3.99 Threat-Informed', '4–4.99 Measured & Validated', '5.00 Adaptive'].map((b) => (
                <span key={b} className="rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] px-2.5 py-1">{b}</span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
            <h3 className="font-display font-semibold mb-2">Coverage scores (reported alongside, never instead of, domain scores)</h3>
            <p className="text-sm font-mono text-muted">Validated Coverage Score (VCS) = sum per-technique 0(no telemetry)/1(telemetry)/2(logic)/3(validated by emulation) divided by 3×in-scope techniques. Scenario Coverage (SCS) = covered scenarios / prioritised scenarios (a scenario counts when ≥2 kill-chain stages, one validated).</p>
          </div>
          <div className="flex gap-2 text-sm font-mono">
            <Link to="/dfir/frameworks/utiom" className="text-brand-600 dark:text-brand-400 hover:underline">UTIOM — the operating model →</Link>
            <span className="text-muted">·</span>
            <a href="https://tid-cmm.com/methodology/scoring/" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">Official scoring <ExternalLink size={11} /></a>
          </div>
        </div>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))] p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted mb-2">Attribution & licence</h2>
        <p className="text-sm font-mono text-muted">TID-CMM model and data © 2022–2026 Reza Adineh, licensed CC BY 4.0. Assessment tool free for any use including paid client work, not licensed for redistribution. This page is a local replica for interactive use; the authoritative model and tool remain at <a href="https://tid-cmm.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">tid-cmm.com</a> (github.com/ReZaAdineH/tid-cmm). MITRE ATT&CK® © The MITRE Corporation.</p>
      </section>
    </DataPageLayout>
  );
}
