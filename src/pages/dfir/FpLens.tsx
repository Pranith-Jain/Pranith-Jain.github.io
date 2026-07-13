import { useState, useCallback } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  ScanSearch,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Wrench,
  ListChecks,
  RotateCcw,
  Download,
} from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

interface FpPattern {
  scenario: string;
  signals: string;
}

interface FpLensResult {
  fp_risk_level: RiskLevel;
  fp_risk_summary: string;
  fp_patterns: FpPattern[];
  tp_signals: string[];
  suggested_exclusions: string[];
  tuning_guidance: string[];
}

const EXAMPLE_RULES: Array<{ label: string; rule: string }> = [
  {
    label: 'Suspicious PowerShell encoded command',
    rule: `title: Suspicious Encoded PowerShell
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\powershell.exe'
    CommandLine|contains: '-EncodedCommand'
  condition: selection
fields:
  - User
  - CommandLine
falsepositives:
  - Legitimate admin scripts`,
  },
  {
    label: 'Mimikatz signature on host',
    rule: `DeviceFileEvents | where FileName has_any ('mimikatz.exe','mimilsa.log','kiwissv.log') | project Timestamp, DeviceName, FileName, InitiatingProcessFileName`,
  },
  {
    label: 'Outbound DNS to DGA-looking domains',
    rule: `DNSQuery | where strlen(Name) > 30 or Name matches regex "^[a-z0-9]{15,}\\\\." | summarize count() by Name, ClientIP`,
  },
];

const RISK_TONE: Record<RiskLevel, string> = {
  HIGH: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 border border-rose-300/60 dark:border-rose-800/60',
  MEDIUM:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300/60 dark:border-amber-800/60',
  LOW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-800/60',
};

const RISK_GUIDANCE: Record<RiskLevel, string> = {
  HIGH: 'High FP risk — expect constant noise. Apply tuning before going live.',
  MEDIUM: 'Moderate FP risk — expect some noise, especially in mixed-use environments.',
  LOW: 'Well-scoped — should produce actionable alerts. Verify coverage periodically.',
};

function buildExportText(r: FpLensResult): string {
  const lines: string[] = [];
  lines.push(`# FPLENS — False Positive Analysis`);
  lines.push('');
  lines.push(`**FP Risk Level:** ${r.fp_risk_level}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push(r.fp_risk_summary);
  lines.push('');
  lines.push(`## False Positive Patterns`);
  for (const p of r.fp_patterns) {
    lines.push(`- **Scenario:** ${p.scenario}`);
    lines.push(`  **Signals:** ${p.signals}`);
  }
  lines.push('');
  lines.push(`## True Positive Signals`);
  for (const t of r.tp_signals) lines.push(`- ${t}`);
  lines.push('');
  lines.push(`## Suggested Exclusions`);
  for (const e of r.suggested_exclusions) lines.push(`- ${e}`);
  lines.push('');
  lines.push(`## Tuning Guidance`);
  for (const g of r.tuning_guidance) lines.push(`- ${g}`);
  return lines.join('\n');
}

export default function FpLens(): JSX.Element {
  const [rule, setRule] = useState('');
  const [sampleHits, setSampleHits] = useState('');
  const [envContext, setEnvContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FpLensResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!rule.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/fplens/analyze', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: rule.trim(),
          sample_hits: sampleHits.trim() || undefined,
          env_context: envContext.trim() || undefined,
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const errBody = await res.text();
          const p = JSON.parse(errBody) as { error?: string; message?: string };
          msg = p.message ?? p.error ?? msg;
        } catch (_catchErr) {
          console.error('FpLens failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* non-json error body, fall through */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      setResult((await res.json()) as FpLensResult);
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rule, sampleHits, envContext]);

  const loadExample = (ex: string) => {
    setRule(ex);
    setSampleHits('');
    setEnvContext('');
    setError(null);
    setResult(null);
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([buildExportText(result)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fplens-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<ScanSearch size={28} />}
      title="FPLENS"
      maxWidthClass="max-w-6xl"
      description={
        <>
          False Positive Likelihood Analyzer. Paste a detection rule (Sigma, KQL, SPL, XQL, or just an alert name) plus
          optional sample hits and environment context. The model returns a structured verdict — FP risk level,
          plausible FP patterns with signals, TP indicators, suggested exclusions, and tuning guidance.
          <p className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            Powered by Workers AI (Llama 3.3 70B) with Groq fallback · request content is not stored
          </p>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display font-bold text-sm">Detection rule / alert</h2>
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">required</span>
            </div>
            <textarea
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              rows={10}
              placeholder="Paste a Sigma / KQL / SPL / XQL rule, or just an alert name like 'Suspicious PowerShell Encoded Command'."
              className="w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_RULES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => loadExample(ex.rule)}
                  className="px-2.5 py-1 rounded text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                >
                  Load: {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display font-bold text-sm">Sample hits / additional logs</h2>
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">optional</span>
            </div>
            <textarea
              value={sampleHits}
              onChange={(e) => setSampleHits(e.target.value)}
              rows={5}
              placeholder="Paste 1-10 sample alert payloads, raw log lines, or any extra context that helps the model understand what's actually firing."
              className="w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display font-bold text-sm">Environment context</h2>
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">optional</span>
            </div>
            <input
              type="text"
              value={envContext}
              onChange={(e) => setEnvContext(e.target.value)}
              placeholder="e.g. Mixed Windows fleet with 200 devs using PowerShell daily, 50 servers, 4-yr-old EDR"
              className="w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || !rule.trim()}
              className="flex-1 px-6 py-3 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <ScanSearch size={16} /> Analyze FP risk
                </>
              )}
            </button>
            {(result || error) && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                className="px-3 py-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                title="Clear"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Output panel */}
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Analysis failed</p>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono break-all">{error}</p>
              </div>
            </div>
          )}

          {result ? (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h2 className="font-display font-bold text-sm flex items-center gap-2">
                    <ShieldAlert size={14} className="text-brand-600 dark:text-brand-400" /> FP Risk Verdict
                  </h2>
                  <div className="flex gap-2">
                    <CopyButton value={buildExportText(result)} />
                    <button
                      onClick={downloadReport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                    >
                      <Download size={13} /> Download .md
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`inline-block px-3 py-1 rounded text-sm font-mono font-bold ${RISK_TONE[result.fp_risk_level]}`}
                  >
                    {result.fp_risk_level}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {RISK_GUIDANCE[result.fp_risk_level]}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.fp_risk_summary}</p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" /> False Positive Patterns
                  <span className="ml-auto text-micro font-mono text-slate-400">{result.fp_patterns.length}</span>
                </h2>
                <div className="space-y-3">
                  {result.fp_patterns.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50/50 dark:bg-[rgb(var(--input-200)/0.3)] p-3"
                    >
                      <div className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                        Scenario {i + 1}
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200 mb-1.5">{p.scenario}</p>
                      <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-0.5">
                        How to identify
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{p.signals}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" /> True Positive Signals
                  <span className="ml-auto text-micro font-mono text-slate-400">{result.tp_signals.length}</span>
                </h2>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {result.tp_signals.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-500 dark:text-emerald-400 mt-0.5">+</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                  <Wrench size={14} className="text-brand-600 dark:text-brand-400" /> Suggested Exclusions
                  <span className="ml-auto text-micro font-mono text-slate-400">
                    {result.suggested_exclusions.length}
                  </span>
                </h2>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {result.suggested_exclusions.map((e, i) => (
                    <li key={i} className="flex items-start gap-2 font-mono text-xs">
                      <span className="text-brand-500 dark:text-brand-400 mt-0.5">→</span>
                      <span className="break-all">{e}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                  <ListChecks size={14} className="text-brand-600 dark:text-brand-400" /> Tuning Guidance
                  <span className="ml-auto text-micro font-mono text-slate-400">{result.tuning_guidance.length}</span>
                </h2>
                <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
                  {result.tuning_guidance.map((g, i) => (
                    <li key={i} className="leading-relaxed">
                      {g}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            !error && (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-10 text-center">
                <ScanSearch size={32} className="text-slate-300 dark:text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Paste a detection rule and click <span className="font-semibold">Analyze</span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Output: risk verdict, FP patterns, TP signals, exclusions, tuning steps
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
