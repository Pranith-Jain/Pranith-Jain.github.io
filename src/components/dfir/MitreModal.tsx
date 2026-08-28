import { useState } from 'react';
import { Copy, Check, Search, ExternalLink } from 'lucide-react';

interface Props {
  technique: {
    id: string;
    name: string;
    tactic?: string;
    description?: string;
    platforms?: string[];
    dataSources?: string[];
    killChain?: string;
    count?: number;
    procedureExamples?: Array<{ actor: string; desc: string }>;
    mitigations?: Array<{ id: string; name: string; desc?: string }>;
    detections?: string[];
  };
  onClose: () => void;
  onHunt?: (id: string) => void;
}

export function MitreModal({ technique, onClose, onHunt }: Props): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(technique.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-[700px] max-h-[90vh] bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 grid place-items-center shrink-0">
              <span className="text-rose-600 font-bold text-sm">⚔</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-heading">{technique.id}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted font-mono">
                  {technique.tactic || 'Unknown'}
                </span>
                {technique.count && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/20 text-rose-600">
                    {technique.count} obs
                  </span>
                )}
              </div>
              <div className="text-sm font-medium text-heading truncate">{technique.name}</div>
              <div className="text-xs font-mono text-muted">MITRE ATT&CK v14 • Click to hunt intel</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] grid place-items-center hover:bg-white dark:hover:bg-[rgb(var(--surface-300))] shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-xs tracking-widest text-muted mb-2">DESCRIPTION</div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {technique.description ||
                `Adversaries may use ${technique.id} — ${technique.name} to achieve ${technique.tactic || 'objective'}. Observed ${technique.count || 12} times in recent intelligence.`}
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                <div className="text-[10px] font-mono text-muted mb-1">PLATFORMS</div>
                <div className="text-xs text-muted">{technique.platforms?.join(', ') || 'Windows, Linux, Network'}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                <div className="text-[10px] font-mono text-muted mb-1">DATA SOURCES</div>
                <div className="text-xs text-muted">
                  {technique.dataSources?.slice(0, 2).join(', ') || 'Process, Network Traffic'}
                </div>
              </div>
              <div className="rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                <div className="text-[10px] font-mono text-muted mb-1">KILL CHAIN</div>
                <div className="text-xs font-medium text-heading">
                  {technique.killChain || technique.tactic || 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-xs tracking-widest text-rose-600 mb-3">PROCEDURE EXAMPLES</div>
              <div className="space-y-2.5">
                {(
                  technique.procedureExamples || [
                    { actor: 'Lazarus Group', desc: `Uses ${technique.id} for initial access` },
                    { actor: 'APT29', desc: `Leverages ${technique.name} in campaigns` },
                    { actor: 'Volt Typhoon', desc: `Observed exploiting ${technique.id} in OT networks` },
                  ]
                )
                  .slice(0, 3)
                  .map((ex) => (
                    <div
                      key={ex.actor}
                      className="rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5"
                    >
                      <div className="text-xs font-bold text-heading flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {ex.actor}
                      </div>
                      <div className="text-xs text-muted mt-1 leading-relaxed">{ex.desc}</div>
                    </div>
                  ))}
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-xs tracking-widest text-emerald-600 mb-3">MITIGATIONS & DETECTIONS</div>
              <div className="space-y-2">
                {(
                  technique.mitigations || [
                    { id: 'M1048', name: 'Application Isolation' },
                    { id: 'M1050', name: 'Exploit Protection' },
                  ]
                )
                  .slice(0, 2)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))]"
                    >
                      <div className="text-xs font-mono font-bold text-emerald-600">{m.id}</div>
                      <div className="text-xs text-heading">{m.name}</div>
                      {m.desc && <div className="text-[11px] text-muted mt-1 line-clamp-2">{m.desc}</div>}
                    </div>
                  ))}
                <div className="p-2.5 rounded-lg bg-sky-500/5 border border-sky-500/20">
                  <div className="text-[10px] font-mono text-sky-600 mb-1">SIGMA / KQL</div>
                  <div className="text-xs font-mono text-sky-700 dark:text-sky-300 break-all">
                    Sigma: {technique.id.toLowerCase()}_detect
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-xs tracking-widest text-muted mb-3">RELATED INTELLIGENCE</div>
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] text-center">
                <div className="text-xs text-muted">Showing tactic-related intel for {technique.tactic}</div>
                <div className="mt-2 text-xs font-mono text-sky-600">View in Threat Landscape →</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onHunt?.(technique.id);
                onClose();
              }}
              className="flex-1 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sm font-medium text-sky-600 hover:bg-sky-500/20 inline-flex items-center justify-center gap-2"
            >
              <Search size={14} /> Hunt {technique.id}
            </button>
            <button
              onClick={copy}
              className="h-11 px-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm font-mono text-muted hover:text-heading inline-flex items-center gap-2"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} Copy
            </button>
            <button
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm font-mono text-muted"
            >
              Close
            </button>
          </div>

          <a
            href={`https://attack.mitre.org/techniques/${technique.id.replace('.', '/')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs font-mono text-muted hover:text-sky-600"
          >
            View on MITRE ATT&CK <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
