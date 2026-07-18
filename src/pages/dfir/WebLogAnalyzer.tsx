import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { FileCheck, Upload, FileSearch } from 'lucide-react';

interface Row {
  n: number;
  ip: string;
  ts: string;
  method: string;
  path: string;
  status: number;
  size: string;
  ua: string;
  tags: string[];
}

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

const LINE_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+([^"\s]+)[^"]*"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/;

const RULES: Array<[string, RegExp]> = [
  ['SQLi', /(\bunion\b.+\bselect\b|\bor\b\s+1=1|sleep\(|benchmark\(|information_schema|\bxp_cmdshell\b|'\s*or\s*')/i],
  ['XSS', /(<script|onerror\s*=|javascript:|<img[^>]+src|%3cscript|document\.cookie)/i],
  ['Path traversal', /(\.\.\/|\.\.%2f|%2e%2e%2f|\/etc\/passwd|\\windows\\win\.ini|\.\.\\)/i],
  ['LFI/RFI', /(php:\/\/|data:\/\/|file:\/\/|expect:\/\/|=https?:\/\/)/i],
  ['Cmd injection', /(;\s*(id|whoami|cat|curl|wget)\b|\|\s*(id|nc)\b|\$\(.*\)|`.*`|%3b)/i],
  ['Scanner UA', /(sqlmap|nikto|nmap|masscan|acunetix|nuclei|wpscan|dirbuster|gobuster|feroxbuster|zgrab|httpx)/i],
  ['Sensitive path', /(\/\.git|\/\.env|\/wp-admin|\/phpmyadmin|\/\.aws|\/actuator|\/server-status|\/\.ssh)/i],
];

function analyze(text: string): { rows: Row[]; total: number; parsed: number } {
  const lines = text.split(/\r?\n/).slice(0, 500000);
  const rows: Row[] = [];
  let parsed = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = LINE_RE.exec(lines[i]!);
    if (!m) continue;
    parsed++;
    let decoded = m[4]!;
    try {
      decoded = decodeURIComponent(m[4]!);
    } catch (_catchErr) {
      console.error('analyze failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* keep raw */
    }
    const ua = m[8] ?? '';
    const hay = `${decoded} ${ua}`;
    const tags = RULES.filter(([, re]) => re.test(hay)).map(([t]) => t);
    if (tags.length === 0) continue;
    rows.push({
      n: i + 1,
      ip: m[1]!,
      ts: m[2]!,
      method: m[3]!,
      path: m[4]!.slice(0, 200),
      status: Number(m[5]),
      size: m[6]!,
      ua: ua.slice(0, 120),
      tags,
    });
  }
  return { rows, total: lines.filter(Boolean).length, parsed };
}

function csv(rows: Row[]): string {
  const head = 'line,ip,timestamp,method,path,status,size,tags,user_agent';
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return [
    head,
    ...rows.map((r) =>
      [r.n, r.ip, r.ts, r.method, r.path, r.status, r.size, r.tags.join('|'), r.ua].map((c) => esc(String(c))).join(',')
    ),
  ].join('\n');
}

export default function WebLogAnalyzer(): JSX.Element {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const res = useMemo(() => (text.trim() ? analyze(text) : null), [text]);

  function download() {
    if (!res) return;
    const blob = new Blob([csv(res.rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'suspicious-requests.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pipeToExtractor() {
    sessionStorage.setItem('ioc-extractor-pipe', text);
    navigate('/dfir/extract?from=weblog');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink to="/dfir">back</BackLink>
      <Link
        to="/dfir/tools/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        DFIR tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <FileCheck size={22} className="text-brand-600 dark:text-brand-400" />
        Web Server Log Analyzer
      </h1>
      <p className="text-sm font-mono text-muted mt-1 mb-6">
        Paste Apache/Nginx Common or Combined access logs. URL-decodes each request and flags SQLi, XSS, path traversal,
        LFI/RFI, command injection, scanner UAs and sensitive-path probes. Export the hits as CSV. 100% client-side.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder='127.0.0.1 - - [10/May/2026:13:55:36 +0000] "GET /?id=1%27%20OR%201=1 HTTP/1.1" 200 1234 "-" "sqlmap/1.7"'
        className="w-full surface-card px-3 py-2 font-mono text-meta focus:border-brand-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => document.getElementById('weblog-input')?.click()}
        className="w-full border-2 border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl p-8 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
        aria-label="Drop a log file or click to choose"
      >
        <Upload size={24} className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Drop a log file here, or click to choose</p>
        <p className="text-mini font-mono text-slate-400 mt-1">Apache/Nginx access logs. 100% client-side.</p>
      </button>
      <input
        id="weblog-input"
        type="file"
        accept=".log,.txt,text/plain"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > MAX_BYTES) {
            setFileError(`File too large (${(f.size / 1048576).toFixed(1)}MB). Max 20MB; split or pre-filter the log.`);
            e.target.value = '';
            return;
          }
          setFileError(null);
          setText(await f.text());
        }}
      />
      {fileError && (
        <p role="alert" className="mt-2 text-meta text-rose-600 dark:text-rose-400">
          {fileError}
        </p>
      )}

      {res && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-4 font-mono text-meta text-slate-500">
            <span>
              {res.total.toLocaleString()} lines · {res.parsed.toLocaleString()} parsed ·{' '}
              <span className="text-rose-600 dark:text-rose-400">{res.rows.length} suspicious</span>
            </span>
            {res.rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={pipeToExtractor}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
                >
                  <FileSearch size={11} /> Extract IOCs →
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
                >
                  export CSV
                </button>
              </>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-auto max-h-[60vh]">
            <table className="w-full text-mini font-mono">
              <thead className="bg-slate-50 dark:bg-[rgb(var(--surface-200))] sticky top-0">
                <tr>
                  {['#', 'IP', 'Method', 'Path', 'Status', 'Findings'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-left px-2 py-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.slice(0, 2000).map((r) => (
                  <tr key={r.n} className="even:bg-slate-50/50 dark:even:bg-[rgb(var(--surface-200)/0.5)]">
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))] text-slate-500">
                      {r.n}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">{r.ip}</td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {r.method}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))] break-all">
                      {r.path}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {r.status}
                    </td>
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                      {r.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-block mr-1 mb-0.5 px-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        >
                          {t}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {res.rows.length === 0 && (
              <p className="p-3 font-mono text-meta text-slate-500">No suspicious requests matched the heuristics.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
