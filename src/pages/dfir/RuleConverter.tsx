import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AlertTriangle, Copy, Check, Shuffle } from 'lucide-react';
import {
  convertRule,
  SOURCE_FORMATS,
  TARGET_FORMATS,
  FORMAT_LABELS,
  type RuleFormat,
} from '../../lib/dfir/rule-convert';

const SAMPLES: Record<'sigma' | 'kql' | 'splunk', string> = {
  sigma: `title: Certutil URL cache download
status: experimental
description: certutil.exe used to fetch a remote file
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\certutil.exe'
    CommandLine|contains:
      - 'urlcache'
      - 'split'
      - 'http'
  condition: selection
level: high`,
  kql: `DeviceProcessEvents
| where FileName =~ "powershell.exe"
  and ProcessCommandLine contains "FromBase64String"
  and ProcessCommandLine contains "IEX"`,
  splunk: `index=windows EventCode=4688
Image="*\\\\rundll32.exe" CommandLine="*javascript:*"
| regex CommandLine="(?i)eval\\\\("`,
};

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'copied' : 'copy'}
    </button>
  );
}

export default function RuleConverter(): JSX.Element {
  const [from, setFrom] = useState<RuleFormat>('sigma');
  const [to, setTo] = useState<RuleFormat>('kql');
  const [input, setInput] = useState('');

  const result = useMemo(() => {
    if (!input.trim()) return null;
    return convertRule(input, from, to);
  }, [input, from, to]);

  const loadSample = () => {
    if (from === 'sigma' || from === 'kql' || from === 'splunk') setInput(SAMPLES[from]);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Shuffle size={28} className="text-brand-600 dark:text-brand-400" /> Rule Converter
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-3 max-w-3xl leading-relaxed">
          Translate a detection rule between formats — entirely in your browser. Source is parsed into one intermediate
          representation, then emitted to the target. Sigma, KQL, and Splunk SPL can be sources; everything (incl.
          Elastic Lucene/EQL, YARA, DLP regex, and a supply-chain Semgrep scaffold) is an output.
        </p>
        <p className="text-[12px] text-amber-700 dark:text-amber-400 mb-5 max-w-3xl flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          Heuristic, not pySigma. Field names are pass-through (repoint them at your schema). KQL/SPL parsing recovers
          only flat <code>field op "value"</code> predicates; YARA/DLP/supply-chain lose field semantics. Every lossy
          step is flagged below — validate before operational use.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1">Source</span>
          <div className="flex gap-1.5">
            {SOURCE_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrom(f)}
                className={`text-xs font-mono px-2.5 py-1.5 rounded border ${
                  from === f
                    ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-brand-500/40'
                }`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        <ArrowRight size={18} className="text-slate-400 mb-2" aria-hidden="true" />
        <div>
          <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1">Target</span>
          <div className="flex flex-wrap gap-1.5">
            {TARGET_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTo(f)}
                className={`text-xs font-mono px-2.5 py-1.5 rounded border ${
                  to === f
                    ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-brand-500/40'
                }`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={loadSample}
          className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          load {FORMAT_LABELS[from]} example
        </button>
        {input && (
          <button
            type="button"
            onClick={() => setInput('')}
            className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
          >
            clear
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section>
          <label htmlFor="rc-input" className="sr-only">
            Source rule
          </label>
          <textarea
            id="rc-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder={`Paste a ${FORMAT_LABELS[from]} rule…`}
            aria-label="Source rule"
            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 min-h-[12rem]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm">{FORMAT_LABELS[to]}</h3>
            {result?.ok && <CopyBtn text={result.output} />}
          </div>
          {!result ? (
            <p className="text-[12px] font-mono text-slate-500">Paste a rule to convert.</p>
          ) : !result.ok ? (
            <p className="text-sm font-mono text-rose-600 dark:text-rose-400">parse error: {result.error}</p>
          ) : (
            <pre className="font-mono text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
              {result.output}
            </pre>
          )}
        </section>
      </div>

      {result?.ok && result.warnings.length > 0 && (
        <section className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300 font-mono mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> conversion notes ({result.warnings.length})
          </h3>
          <ul className="space-y-1 text-[12px] font-mono text-amber-700 dark:text-amber-300 list-disc pl-5">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          See also
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <Link to="/dfir/sigma-convert" className="text-brand-600 dark:text-brand-400 hover:underline">
              Sigma Converter — focused Sigma → SPL/KQL/Lucene
            </Link>
          </li>
          <li>
            <Link to="/dfir/rule-playground" className="text-brand-600 dark:text-brand-400 hover:underline">
              YARA / Sigma Playground — test a rule against a sample
            </Link>
          </li>
          <li>
            <Link to="/threatintel/detections" className="text-brand-600 dark:text-brand-400 hover:underline">
              Detections — the live rule engine on this site
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
