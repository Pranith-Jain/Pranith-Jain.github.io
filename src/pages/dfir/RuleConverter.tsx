import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Copy,
  Check,
  Shuffle,
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  convertRule,
  convertBatch,
  parseToIr,
  FIELD_MAPS,
  findFieldMap,
  SOURCE_FORMATS,
  TARGET_FORMATS,
  FORMAT_LABELS,
  type RuleFormat,
  type RuleIR,
} from '../../lib/dfir/rule-convert';
import { CONVERTER_STARTERS, groupedConverterStarters } from '../../lib/dfir/rule-convert/starters';

const SAMPLES: Record<RuleFormat, string> = {
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
  lucene: `Image:*\\\\powershell.exe AND CommandLine:*DownloadString* AND CommandLine:*FromBase64String*`,
  eql: `process where stringContains(process.command_line, "Invoke-Expression")
  and endsWith(process.name, "powershell.exe")`,
  yara: `rule SuspiciousLoader
{
    meta:
        description = "Demo loader strings"
    strings:
        $a = "DownloadString" nocase
        $b = "FromBase64String"
        $re = /IEX\\s*\\(/
    condition:
        any of them
}`,
  dlp: `{
  "name": "Converted DLP ruleset",
  "match": "any",
  "patterns": [
    { "id": "p1", "field": "body", "regex": "DownloadString" },
    { "id": "p2", "field": "body", "regex": "FromBase64String" }
  ]
}`,
  supplychain: `rules:
  - id: suspicious-loader
    message: "demo converted from a detection rule"
    severity: WARNING
    languages: [generic]
    patterns:
      - pattern-regex: "DownloadString"
      - pattern-regex: "FromBase64String"`,
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
  const [fieldMapId, setFieldMapId] = useState<string>('passthrough');
  const [batchMode, setBatchMode] = useState(false);
  const [showStarters, setShowStarters] = useState(false);
  const [showIr, setShowIr] = useState(false);

  const chosenMap = useMemo(() => findFieldMap(fieldMapId), [fieldMapId]);
  const options = useMemo(
    () =>
      chosenMap && fieldMapId !== 'passthrough'
        ? { fieldMap: chosenMap.mappings, fieldMapLabel: chosenMap.label }
        : undefined,
    [chosenMap, fieldMapId]
  );

  const result = useMemo(() => {
    if (!input.trim()) return null;
    return convertRule(input, from, to, options ?? {});
  }, [input, from, to, options]);

  const batchResult = useMemo(() => {
    if (!batchMode || !input.trim() || from !== 'sigma') return null;
    return convertBatch(input, from, to, options ?? {});
  }, [batchMode, input, from, to, options]);

  /** Parsed IR for the inspector panel — independent of the emit step so an
   *  emit failure doesn't hide what was parsed. */
  const ir: RuleIR | { error: string } | null = useMemo(() => {
    if (!input.trim()) return null;
    return parseToIr(input, from);
  }, [input, from]);

  const loadSample = () => setInput(SAMPLES[from]);

  const starterGroups = useMemo(() => groupedConverterStarters(), []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Shuffle size={28} className="text-brand-600 dark:text-brand-400" /> Rule Converter
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-3 max-w-3xl leading-relaxed">
          Universal detection-rule translation — entirely in your browser. <strong>Any</strong> format converts to{' '}
          <strong>any</strong> other: Sigma, Microsoft KQL, Splunk SPL, Elastic Lucene & EQL, YARA, DLP regex, and a
          supply-chain Semgrep scaffold. Everything funnels through one intermediate representation.
        </p>
        <p className="text-[12px] text-amber-700 dark:text-amber-400 mb-5 max-w-3xl flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          Heuristic, not pySigma. Field-map presets handle the canonical Sysmon → Defender / ECS / CIM rewrites. Parsing
          non-Sigma languages back to the IR recovers only flat <code>field op &quot;value&quot;</code> predicates;
          YARA/DLP/supply-chain carry no field semantics. Every lossy step is flagged below — validate before
          operational use.
        </p>
      </div>

      {/* Format + field-map controls — first row picks source/target/swap;
          second row picks the field-mapping preset (only meaningful when
          source = Sigma; pass-through for everything else). */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">convert</span>
        <label htmlFor="rc-from" className="sr-only">
          Source format
        </label>
        <select
          id="rc-from"
          value={from}
          onChange={(e) => setFrom(e.target.value as RuleFormat)}
          className="text-xs font-mono px-2.5 py-1.5 rounded border border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300 focus:outline-none focus:border-brand-500"
        >
          {SOURCE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <ArrowRight size={16} className="text-slate-400" aria-hidden="true" />
        <label htmlFor="rc-to" className="sr-only">
          Target format
        </label>
        <select
          id="rc-to"
          value={to}
          onChange={(e) => setTo(e.target.value as RuleFormat)}
          className="text-xs font-mono px-2.5 py-1.5 rounded border border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300 focus:outline-none focus:border-brand-500"
        >
          {TARGET_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          aria-label="swap source and target formats"
          title="swap source and target"
          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          <Shuffle size={11} /> swap
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">field-map</span>
        <label htmlFor="rc-fmap" className="sr-only">
          Field-mapping preset
        </label>
        <select
          id="rc-fmap"
          value={fieldMapId}
          onChange={(e) => setFieldMapId(e.target.value)}
          className="text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-brand-500"
        >
          {FIELD_MAPS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {chosenMap && fieldMapId !== 'passthrough' && (
          <span className="text-[11px] font-mono text-slate-500" title={chosenMap.description}>
            ~{Object.keys(chosenMap.mappings).length} field rewrites
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => setShowStarters((v) => !v)}
          aria-expanded={showStarters}
          className="text-[12px] font-mono px-2.5 py-1 rounded border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 inline-flex items-center gap-1 hover:bg-brand-500/15"
        >
          Starter library
          <ChevronDown
            size={11}
            className={showStarters ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </button>
        <button
          type="button"
          onClick={loadSample}
          className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          load {FORMAT_LABELS[from]} example
        </button>
        {from === 'sigma' && (
          <button
            type="button"
            onClick={() => setBatchMode((b) => !b)}
            aria-pressed={batchMode}
            className={
              batchMode
                ? 'text-[12px] font-mono px-2.5 py-1 rounded border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1'
                : 'text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1'
            }
          >
            <Layers size={11} /> Batch {batchMode ? 'on' : 'off'}
          </button>
        )}
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

      {/* Starter library picker — Sigma rules grouped by tactic. Click loads
          into the source editor and switches `from` to sigma. */}
      {showStarters && (
        <section className="rounded-lg border border-brand-500/30 bg-brand-50/30 dark:bg-brand-900/15 p-4 mb-4">
          <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mb-3">
            Canonical Sigma rules with Sysmon / Windows-Security field names — the converter's most common source.
            Switches the source format to Sigma when loaded.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(starterGroups.entries()).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">{group}</div>
                <ul className="space-y-1">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFrom('sigma');
                          setInput(s.body);
                          setShowStarters(false);
                        }}
                        title={s.description}
                        className="w-full text-left px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 bg-white dark:bg-slate-900/40"
                      >
                        <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100 leading-tight">
                          {s.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{s.description}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section>
          <label htmlFor="rc-input" className="sr-only">
            Source rule
          </label>
          <textarea
            id="rc-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={batchMode ? 24 : 20}
            spellCheck={false}
            placeholder={
              batchMode
                ? `Paste a multi-doc Sigma stream (rules separated by "---" lines)…`
                : `Paste a ${FORMAT_LABELS[from]} rule…`
            }
            aria-label="Source rule"
            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 min-h-[12rem]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm">
              {FORMAT_LABELS[to]}
              {batchMode && batchResult && batchResult.length > 0 && (
                <span className="ml-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  batch · {batchResult.filter((b) => b.ok).length}/{batchResult.length}
                </span>
              )}
            </h3>
            {!batchMode && result?.ok && <CopyBtn text={result.output} />}
            {batchMode && batchResult && batchResult.some((b) => b.ok) && (
              <CopyBtn
                text={batchResult
                  .filter((b) => b.ok)
                  .map((b) => `# ${b.title ?? `rule-${b.index}`}\n${b.output ?? ''}`)
                  .join('\n\n---\n\n')}
              />
            )}
          </div>
          {!input.trim() ? (
            <p className="text-[12px] font-mono text-slate-500">Paste a rule to convert.</p>
          ) : batchMode ? (
            !batchResult || batchResult.length === 0 ? (
              <p className="text-[12px] font-mono text-slate-500">No documents detected.</p>
            ) : (
              <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                {batchResult.map((b) => (
                  <li key={b.index} className="rounded border border-slate-200 dark:border-slate-800 p-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={
                          b.ok
                            ? 'text-[11px] font-mono text-emerald-600 dark:text-emerald-400'
                            : 'text-[11px] font-mono text-rose-600 dark:text-rose-400'
                        }
                      >
                        {b.ok ? '✓' : '✗'} {b.title ?? `rule-${b.index}`}
                      </span>
                      {b.ok && b.output && <CopyBtn text={b.output} />}
                    </div>
                    <pre className="font-mono text-[12px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                      {b.ok ? b.output : b.error}
                    </pre>
                  </li>
                ))}
              </ul>
            )
          ) : !result ? (
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

      {/* Warnings — combined across single + batch modes. */}
      {(() => {
        const warnings = batchMode
          ? Array.from(new Set(batchResult?.flatMap((b) => b.warnings) ?? []))
          : result?.ok
            ? result.warnings
            : [];
        if (warnings.length === 0) return null;
        return (
          <section className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300 font-mono mb-2 inline-flex items-center gap-1.5">
              <AlertTriangle size={12} /> conversion notes ({warnings.length})
            </h3>
            <ul className="space-y-1 text-[12px] font-mono text-amber-700 dark:text-amber-300 list-disc pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        );
      })()}

      {/* IR inspector — the structured intermediate the parser extracted.
          Powers test-driven debugging: if a conversion isn't producing
          what you expect, the IR shows exactly what the parser saw. */}
      {input.trim() && !batchMode && (
        <section className="mt-4">
          <button
            type="button"
            onClick={() => setShowIr((v) => !v)}
            aria-expanded={showIr}
            className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1.5"
          >
            {showIr ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Parsed IR (what the parser extracted)
          </button>
          {showIr && (
            <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
              {!ir ? null : 'error' in ir ? (
                <p className="text-[12px] font-mono text-rose-600 dark:text-rose-400">{ir.error}</p>
              ) : (
                <pre className="font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(
                    {
                      title: ir.title,
                      logsource: ir.logsource,
                      groups: ir.groups,
                      condition: ir.condition,
                      level: ir.level,
                      meta: ir.meta,
                      warnings: ir.warnings,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          See also
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <Link to="/dfir/detection-lab" className="text-brand-600 dark:text-brand-400 hover:underline">
              Detection Lab — write and test IOC-based detection rules against live feeds
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
        <p className="mt-3 text-[11px] font-mono text-slate-500 leading-relaxed">
          {CONVERTER_STARTERS.length} starters · {FIELD_MAPS.length - 1} field-map presets · multi-doc Sigma batch · IR
          inspector for debugging lossy parses.
        </p>
      </section>
    </div>
  );
}
