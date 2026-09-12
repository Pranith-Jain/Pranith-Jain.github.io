import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { Sparkles, ChevronDown, ChevronUp, Loader2, ListChecks, BrainCircuit } from 'lucide-react';

export interface DigestAnalysisData {
  kind: 'wdtb' | 'pcm';
  date: string;
  generated_at: string;
  bullets: string[];
  ai: { text: string; model: string } | null;
  ai_error?: string;
  cached?: boolean;
}

/**
 * Opt-in AI analysis panel for the digest pages. Nothing fetches until the
 * analyst expands it (AI generation is the most expensive call on these
 * pages); the endpoint itself is cached indefinitely per date server-side.
 */
export function DigestAnalysisPanel({ endpoint }: { endpoint: string | null }) {
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useDataFetch<DigestAnalysisData>({
    url: open && endpoint ? endpoint : null,
    ttl: 3600_000,
  });

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-900/40 dark:bg-brand-950/20">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white"
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles size={15} className="text-brand-500" />
          Analyst Note
          {data?.ai && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-micro font-semibold text-white">AI</span>
          )}
          {data && !data.ai && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300">
              deterministic
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="space-y-4 border-t border-brand-200 px-4 py-3 dark:border-brand-900/40">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Analyzing digest…
            </div>
          )}
          {error && <p className="py-2 text-xs text-red-500">Analysis unavailable: {error}</p>}
          {data && (
            <>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <ListChecks size={13} className="text-brand-500" /> Key signals
                </div>
                <ul className="space-y-1.5">
                  {data.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-body">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {data.ai ? (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <BrainCircuit size={13} className="text-purple-500" /> AI assessment
                    <span className="font-normal text-slate-400">· {data.ai.model}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-body">{data.ai.text}</p>
                </div>
              ) : (
                <p className="text-mini text-slate-400">
                  {data.ai_error === 'ai_unavailable'
                    ? 'LLM narrative unavailable (no AI provider configured) — deterministic signals above are complete.'
                    : 'LLM narrative unavailable for this digest — deterministic signals above are complete.'}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
