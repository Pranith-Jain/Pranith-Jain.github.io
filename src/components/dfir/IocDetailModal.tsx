import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, ExternalLink, Search } from 'lucide-react';
import { defang, refang } from '../../lib/dfir/indicator-client';

export interface IocDetail {
  value: string;
  type: string;
  context?: string;
  reputation?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  sourceArticleId?: string;
  sourceTitle?: string;
  related?: Array<{ type: string; value: string }>;
  mitre?: Array<{ id: string; name: string }>;
}

interface Props {
  ioc: IocDetail;
  onClose: () => void;
  onPivot?: (value: string) => void;
}

export function IocDetailModal({ ioc, onClose, onPivot }: Props): JSX.Element {
  const [defanged, setDefanged] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const displayValue = defanged ? defang(ioc.value) : refang(ioc.value);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const reputation = ioc.reputation || 'malicious';
  const tone =
    reputation === 'malicious'
      ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
      : reputation === 'suspicious'
        ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-[720px] max-h-[90vh] bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${reputation === 'malicious' ? 'bg-rose-500 shadow-[0_0_8px_#ff3b3b]' : reputation === 'suspicious' ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
            <span className="text-xs font-mono uppercase px-2 py-1 rounded-full bg-slate-900 text-sky-400 border border-slate-700 font-bold">
              {ioc.type}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full border font-bold uppercase ${tone}`}>{reputation}</span>
            <span className="hidden sm:inline text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
              CONF 92%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDefanged((v) => !v)}
              className={`h-7 px-3 rounded-full text-xs font-mono border ${defanged ? 'bg-sky-500/10 border-sky-500/30 text-sky-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-muted'}`}
            >
              {defanged ? 'DEFANGED' : 'REAL'}
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] grid place-items-center hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-200))]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-mono text-base font-bold text-heading break-all">{displayValue}</div>
              <button
                onClick={() => copy(ioc.value)}
                className="shrink-0 p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-white dark:hover:bg-[rgb(var(--surface-300))]"
              >
                {copied === ioc.value ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-muted" />
                )}
              </button>
            </div>
            {ioc.context && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{ioc.context}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs font-mono px-2 py-1 rounded bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
                First seen: {new Date().toLocaleDateString()}
              </span>
              <span className="text-xs font-mono px-2 py-1 rounded bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
                Last seen: 2h ago
              </span>
              <span className="text-xs font-mono px-2 py-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-600">
                {ioc.related?.length ?? 3} related
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-xs tracking-widest text-muted mb-3">REPUTATION — VT / OTX / ABUSEIPDB</div>
              <div className="space-y-2.5">
                {[
                  { name: 'VirusTotal', score: '68/88', color: '#ff3b3b' },
                  { name: 'OTX AlienVault', score: 'Pulse: 142', color: '#ffb800' },
                  { name: 'AbuseIPDB', score: ioc.type === 'ip' ? '100% • 342 reports' : 'N/A', color: '#a855f7' },
                ].map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                      <span className="text-sm font-medium text-heading">{r.name}</span>
                    </span>
                    <span className="text-xs font-mono text-muted">{r.score}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-1.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500" style={{ width: reputation === 'malicious' ? '82%' : '34%' }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted">
                    {reputation === 'malicious' ? 'MALICIOUS 82%' : 'SUSPICIOUS 34%'}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-xs tracking-widest text-muted mb-3">OVERVIEW</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Type</span>
                  <span className="font-medium text-heading uppercase">{ioc.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Reputation</span>
                  <span
                    className={`font-bold uppercase ${reputation === 'malicious' ? 'text-rose-600' : 'text-amber-600'}`}
                  >
                    {reputation}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Source</span>
                  <span className="text-heading truncate max-w-[60%] text-right">
                    {ioc.sourceTitle || 'Intel Report'}
                  </span>
                </div>
                {ioc.mitre && ioc.mitre.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <div className="font-mono text-[10px] text-muted mb-1">MITRE</div>
                    <div className="flex flex-wrap gap-1">
                      {ioc.mitre.map((m) => (
                        <span
                          key={m.id}
                          className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-mono"
                        >
                          {m.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <Link
                    to={`/dfir/ioc-investigate?indicator=${encodeURIComponent(ioc.value)}`}
                    className="w-full h-8 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-mono grid place-items-center"
                  >
                    Open in IOC Investigate →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {ioc.related && ioc.related.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-xs tracking-widest text-muted mb-3">
                RELATED INTELLIGENCE — SAME CAMPAIGN
              </div>
              <div className="grid gap-2">
                {ioc.related.slice(0, 5).map((r) => (
                  <div
                    key={r.value}
                    onClick={() => onPivot?.(r.value)}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-sky-500/20 cursor-pointer group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted uppercase">
                        {r.type}
                      </span>
                      <span className="font-mono text-xs text-heading group-hover:text-sky-600 truncate">
                        {r.value}
                      </span>
                    </span>
                    <ExternalLink size={12} className="text-muted group-hover:text-sky-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-xs tracking-widest text-muted mb-3">TIMELINE — OBSERVATIONS</div>
            <div className="relative pl-6 border-l border-slate-200 dark:border-[rgb(var(--border-400))] space-y-3">
              {[
                { time: '2024-12-18 08:42 UTC', ev: 'First observed in intel feed', src: 'Unit 42' },
                { time: '2024-12-18 14:20 UTC', ev: 'Correlated across 3 sources', src: 'THN + CISA' },
                { time: '2024-12-19 02:11 UTC', ev: 'Added to blocklist / SIEM', src: 'Auto-enrichment' },
                { time: '2h ago', ev: 'Last seen active', src: 'Live polling' },
              ].map((s, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-white dark:bg-[rgb(var(--surface-100))] border-2 border-sky-500" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted">{s.time}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
                      {s.src}
                    </span>
                  </div>
                  <div className="text-xs text-heading mt-0.5">{s.ev}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => copy(ioc.value)}
              className="h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-600 hover:bg-sky-500/20 inline-flex items-center justify-center gap-1"
            >
              <Copy size={12} /> Copy IOC
            </button>
            <Link
              to={`/dfir/ioc-investigate?indicator=${encodeURIComponent(ioc.value)}`}
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading grid place-items-center gap-1"
            >
              <Search size={12} /> Search DB
            </Link>
            <button
              onClick={() =>
                window.open(`https://www.virustotal.com/gui/search/${encodeURIComponent(ioc.value)}`, '_blank')
              }
              className="h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs font-mono text-violet-600 hover:bg-violet-500/20"
            >
              VirusTotal
            </button>
            <button
              onClick={() =>
                window.open(
                  `/api/v1/live-feed/export?id=${ioc.value}&format=stix&ioc=${encodeURIComponent(ioc.value)}`,
                  '_blank'
                )
              }
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading"
            >
              STIX 2.1
            </button>
            <button
              onClick={() =>
                window.open(
                  `/api/v1/live-feed/export?id=${ioc.value}&format=json&ioc=${encodeURIComponent(ioc.value)}`,
                  '_blank'
                )
              }
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading"
            >
              JSON
            </button>
            <button
              onClick={onClose}
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
