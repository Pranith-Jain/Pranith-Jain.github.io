import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { Loader2, AlertTriangle, CheckCircle, ChevronRight, Target, Zap } from 'lucide-react';
import { SEVERITY_TONE } from '../../components/severity';

interface AttackChain {
  id: string;
  indicators: string[];
  tactics: Array<{
    tactic: { id: string; name: string; description: string; order: number };
    techniques: Array<{ id: string; name: string; indicators: string[]; confidence: number }>;
    coverage: number;
  }>;
  kill_chain_progress: number;
  predicted_next: {
    tactic: { id: string; name: string; description: string };
    techniques: string[];
    rationale: string;
  } | null;
  gaps: string[];
  recommendations: Array<{ action: string; priority: 'high' | 'medium' | 'low'; technique: string }>;
}

const TACTIC_COLORS: Record<string, string> = {
  TA0043: 'bg-slate-500',
  TA0042: 'bg-slate-600',
  TA0001: 'bg-rose-500',
  TA0002: 'bg-orange-500',
  TA0003: 'bg-amber-500',
  TA0004: 'bg-amber-600',
  TA0005: 'bg-emerald-500',
  TA0006: 'bg-teal-500',
  TA0007: 'bg-blue-500',
  TA0008: 'bg-indigo-500',
  TA0009: 'bg-purple-500',
  TA0011: 'bg-pink-500',
  TA0010: 'bg-rose-600',
  TA0040: 'bg-rose-700',
};

export default function AttackChain(): JSX.Element {
  const [input, setInput] = useState('');
  const [malware, setMalware] = useState('');
  const [actors, setActors] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AttackChain | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReconstruct = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/attack-chain/reconstruct', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicators: input
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          malware: malware ? malware.split(',').map((s) => s.trim()) : undefined,
          actors: actors ? actors.split(',').map((s) => s.trim()) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const p = JSON.parse(body) as { error?: string };
          msg = p.error ?? msg;
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* ok */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      setResult(await res.json());
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input, malware, actors]);

  const coveredTactics = result?.tactics.filter((t) => t.coverage > 0) ?? [];
  const totalTechniques = coveredTactics.reduce((sum, t) => sum + t.techniques.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Target size={28} className="text-brand-600 dark:text-brand-400" /> Attack Chain Reconstruction
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Map IOCs to MITRE ATT&CK kill chain phases, predict adversary next moves, and identify detection gaps.
        </p>
      </div>

      {/* Input */}
      <div className="surface-card/40 shadow-e1 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">Indicators of Compromise</h2>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter IOCs, one per line…&#10;192.168.1.100&#10;evil-domain.com&#10;a1b2c3d4e5f6…"
          className="w-full h-28 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl p-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label htmlFor="attackchain-malware" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Known Malware (comma-separated)
            </label>
            <input
              id="attackchain-malware"
              type="text"
              value={malware}
              onChange={(e) => setMalware(e.target.value)}
              placeholder="e.g., Cobalt Strike, Emotet"
              className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <div>
            <label htmlFor="attackchain-actors" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Known Actors (comma-separated)
            </label>
            <input
              id="attackchain-actors"
              type="text"
              value={actors}
              onChange={(e) => setActors(e.target.value)}
              placeholder="e.g., APT28, Lazarus"
              className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
        </div>
        <button
          onClick={handleReconstruct}
          disabled={loading || !input.trim()}
          className="mt-4 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
          {loading ? 'Analyzing…' : 'Reconstruct Attack Chain'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-5 animate-fade-in-up">
          {/* Kill Chain Progress */}
          <div className="surface-card/40 shadow-e1 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-sm">Kill Chain Progress</h2>
              <span className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">
                {result.kill_chain_progress}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded-full h-3 mb-3">
              <div
                className="bg-brand-500 h-3 rounded-full transition-all"
                style={{ width: `${result.kill_chain_progress}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-mono">
              <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500">
                {coveredTactics.length} tactics
              </span>
              <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500">
                {totalTechniques} techniques
              </span>
              <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500">
                {result.indicators.length} IOCs
              </span>
            </div>
          </div>

          {/* ATT&CK Kill Chain */}
          <div className="surface-card/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-4">MITRE ATT&CK Kill Chain</h2>
            <div className="space-y-1.5">
              {result.tactics.map((t, i) => (
                <div key={t.tactic.id} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${t.coverage > 0 ? (TACTIC_COLORS[t.tactic.id] ?? 'bg-slate-500') : 'bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-400'}`}
                  >
                    {i + 1}
                  </div>
                  <div
                    className={`flex-1 p-3 rounded-xl border ${t.coverage > 0 ? 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40' : 'border-slate-100 dark:border-[rgb(var(--border-400))]/50 bg-slate-50 dark:bg-[rgb(var(--input-200))]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-medium ${t.coverage > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}
                      >
                        {t.tactic.name}
                      </span>
                      {t.coverage > 0 && (
                        <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          {t.techniques.length} techniques
                        </span>
                      )}
                    </div>
                    {t.coverage > 0 && t.techniques.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.techniques.map((tech) => (
                          <span
                            key={tech.id}
                            className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                          >
                            {tech.id}: {tech.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {i < result.tactics.length - 1 && (
                    <ChevronRight size={14} className="text-slate-300 dark:text-slate-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Predicted Next Move */}
          {result.predicted_next && (
            <div className="rounded-xl border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-5">
              <h2 className="font-display font-bold text-sm mb-2 flex items-center gap-2">
                <Zap size={14} className="text-amber-600 dark:text-amber-400" /> Predicted Next Move
              </h2>
              <div className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                {result.predicted_next.tactic.name}
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{result.predicted_next.rationale}</p>
              {result.predicted_next.techniques.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.predicted_next.techniques.map((t) => (
                    <span
                      key={t}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 text-amber-700 dark:text-amber-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Gaps */}
          {result.gaps.length > 0 && (
            <div className="rounded-xl border border-orange-300/50 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 p-5">
              <h3 className="font-display font-bold text-sm mb-2 text-orange-700 dark:text-orange-300">
                Intelligence Gaps
              </h3>
              <ul className="space-y-1">
                {result.gaps.map((gap) => (
                  <li key={gap} className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-2">
                    <AlertTriangle size={12} /> {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="surface-card/40 shadow-e1 p-5">
              <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" /> Detection Recommendations
              </h2>
              <div className="space-y-2">
                {result.recommendations.map((rec) => (
                  <div
                    key={rec.action}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{rec.action}</div>
                      <div className="text-micro font-mono text-slate-400 mt-0.5">{rec.technique}</div>
                    </div>
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${SEVERITY_TONE[rec.priority]}`}
                    >
                      {rec.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
