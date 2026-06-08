import { useState, useEffect } from 'react';
import { Gauge, Loader2, Info } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

interface ScaleEntry {
  value: string;
  label: string;
  description: string;
}

const REL_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  B: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  C: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  E: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  F: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function ConfidenceScoring(): JSX.Element {
  const [scales, setScales] = useState<{ reliability: ScaleEntry[]; credibility: ScaleEntry[] } | null>(null);
  const [reliability, setReliability] = useState('B');
  const [credibility, setCredibility] = useState('3');
  const [result, setResult] = useState<{ composite_score: number; label: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/confidence/scales')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setScales(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!reliability || !credibility) return;
    fetch('/api/v1/confidence/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reliability, credibility }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setResult)
      .catch(() => {});
  }, [reliability, credibility]);

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 60) return 'text-green-600 dark:text-green-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 20) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6"
      >
        ← back to DFIR
      </BackLink>
      <h1 className="text-3xl font-display font-bold flex items-center gap-3 mb-2">
        <Gauge className="text-brand-600" /> Confidence Scoring
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">
        Admiralty/NATO reliability scale — source reliability x information credibility matrix with confidence decay
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calculator */}
          <div>
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-4">
              <h2 className="font-semibold text-sm mb-3">Source Reliability</h2>
              <div className="grid grid-cols-3 gap-2">
                {(scales?.reliability ?? []).map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setReliability(s.value)}
                    className={`p-3 rounded-lg border text-left ${reliability === s.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20' : 'border-slate-200 dark:border-slate-800'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${REL_COLORS[s.value]}`}
                      >
                        {s.value}
                      </span>
                      <span className="font-semibold text-xs">{s.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-4">
              <h2 className="font-semibold text-sm mb-3">Information Credibility</h2>
              <div className="grid grid-cols-3 gap-2">
                {(scales?.credibility ?? []).map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setCredibility(s.value)}
                    className={`p-3 rounded-lg border text-left ${credibility === s.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20' : 'border-slate-200 dark:border-slate-800'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-800">
                        {s.value}
                      </span>
                      <span className="font-semibold text-xs">{s.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div>
            {result && (
              <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-center mb-6">
                  <div className={`text-6xl font-mono font-bold ${scoreColor(result.composite_score)}`}>
                    {result.composite_score}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">out of 100</div>
                  <div className="text-lg font-semibold mt-2">{result.label}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm">
                  <div className="text-xs font-mono uppercase text-slate-500 mb-1">Assessment</div>
                  <div>{result.description}</div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>How to use:</strong> Score source reliability based on track record (A=completely reliable
                      to E=unreliable). Score information credibility based on corroboration (1=confirmed to 6=truth
                      cannot be judged). The composite score combines both factors.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Matrix visualization */}
            <div className="mt-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h3 className="font-semibold text-sm mb-3">Reliability x Credibility Matrix</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="p-1 text-left font-mono text-slate-500">R\C</th>
                      {[1, 2, 3, 4, 5, 6].map((c) => (
                        <th key={c} className="p-1 text-center font-mono text-slate-500">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((r) => (
                      <tr key={r}>
                        <td className={`p-1 font-mono font-bold ${REL_COLORS[r]} rounded`}>{r}</td>
                        {[1, 2, 3, 4, 5, 6].map((c) => {
                          const scores: Record<string, Record<number, number>> = {
                            A: { 1: 100, 2: 90, 3: 75, 4: 60, 5: 40, 6: 20 },
                            B: { 1: 90, 2: 80, 3: 65, 4: 50, 5: 30, 6: 15 },
                            C: { 1: 75, 2: 65, 3: 50, 4: 40, 5: 20, 6: 10 },
                            D: { 1: 60, 2: 50, 3: 40, 4: 30, 5: 15, 6: 5 },
                            E: { 1: 40, 2: 30, 3: 20, 4: 15, 5: 5, 6: 2 },
                            F: { 1: 20, 2: 15, 3: 10, 4: 5, 5: 2, 6: 1 },
                          };
                          const s = scores[r]?.[c] ?? 0;
                          const isActive = r === reliability && String(c) === credibility;
                          return (
                            <td
                              key={c}
                              className={`p-1 text-center font-mono ${isActive ? 'bg-brand-100 dark:bg-brand-900/30 font-bold' : s >= 60 ? 'bg-emerald-50 dark:bg-emerald-950/20' : s >= 30 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
                            >
                              {s}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
