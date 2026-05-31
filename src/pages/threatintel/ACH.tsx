import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react';

interface Evidence {
  claim: string;
  source: string;
  relevance: 'high' | 'medium' | 'low';
}

interface Hypothesis {
  label: string;
  description: string;
  confidence: number;
  evidence_for: Evidence[];
  evidence_against: Evidence[];
  diagnostic_value: 'high' | 'medium' | 'low';
  what_would_change: string;
}

interface AchResponse {
  topic: string;
  question: string;
  generated_at: string;
  hypotheses: Hypothesis[];
  key_assumptions: string[];
  recommended_collection: string[];
  model_used: string;
}

function confidenceColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

function confidenceBg(score: number): string {
  if (score >= 70) return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900';
  if (score >= 40) return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900';
  return 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900';
}

const RELEVANCE_COLORS: Record<string, string> = {
  high: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900',
  low: 'text-slate-500 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-800',
};

export default function ACH(): JSX.Element {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AchResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showEvFor, setShowEvFor] = useState<Set<number>>(new Set());
  const [showEvAgainst, setShowEvAgainst] = useState<Set<number>>(new Set());

  async function analyze() {
    const q = topic.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/threat-intel/ach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: q }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
        throw new Error(err.error ?? 'ACH request failed');
      }
      setResult((await res.json()) as AchResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Brain size={28} className="text-brand-600 dark:text-brand-400" /> Analysis of Competing Hypotheses
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-3xl">
          ACH is a structured analytic technique that forces explicit consideration of multiple explanations for the
          same evidence. Enter a topic — the system retrieves relevant intelligence and generates competing hypotheses
          with evidence for/against each.
        </p>
      </div>

      {/* Input */}
      <div className="mb-8 flex gap-3">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void analyze()}
          placeholder="e.g. Qilin ransomware, Scattered Spider, CVE-2024-1709 campaign attribution…"
          className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40 placeholder:text-slate-400"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={loading || !topic.trim()}
          className="inline-flex items-center gap-2 text-sm font-mono px-5 py-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <Search size={14} />
          )}
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Question + meta */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-lg font-bold mb-1">{result.question}</h2>
            <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-400">
              <span>topic: {result.topic}</span>
              <span>model: {result.model_used}</span>
              <span>{new Date(result.generated_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Hypothesis matrix */}
          <div className="space-y-4">
            {result.hypotheses.map((h, i) => {
              const isOpen = expanded.has(i);
              const showFor = showEvFor.has(i);
              const showAgainst = showEvAgainst.has(i);
              return (
                <div key={i} className={`rounded-xl border overflow-hidden ${confidenceBg(h.confidence)}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const n = new Set(prev);
                        n.has(i) ? n.delete(i) : n.add(i);
                        return n;
                      })
                    }
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                  >
                    {/* Confidence bar */}
                    <div
                      className="w-1 h-12 rounded-full shrink-0"
                      style={{
                        background: `linear-gradient(to top, ${confidenceColor(h.confidence).replace('bg-', '')}, transparent)`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        H{i + 1}: {h.label}
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border text-slate-500 border-slate-300 dark:border-slate-700`}
                        >
                          diagnostic: {h.diagnostic_value}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{h.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-lg font-bold font-mono ${h.confidence >= 70 ? 'text-emerald-600 dark:text-emerald-400' : h.confidence >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}
                      >
                        {h.confidence}%
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">confidence</div>
                    </div>
                    {isOpen ? (
                      <ChevronDown size={16} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-5 pt-0 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">{h.description}</p>

                      {/* Evidence matrix */}
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Evidence FOR */}
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowEvFor((prev) => {
                                const n = new Set(prev);
                                n.has(i) ? n.delete(i) : n.add(i);
                                return n;
                              })
                            }
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-2"
                          >
                            <CheckCircle2 size={12} /> Evidence FOR ({h.evidence_for.length})
                            {showFor ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                          {showFor &&
                            h.evidence_for.map((ev, j) => (
                              <div
                                key={j}
                                className="mb-2 p-2 rounded bg-white/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800"
                              >
                                <p className="text-[11px] text-slate-700 dark:text-slate-300">{ev.claim}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] font-mono text-slate-400">source: {ev.source}</span>
                                  <span
                                    className={`text-[9px] font-mono px-1 py-0.5 rounded ${RELEVANCE_COLORS[ev.relevance]}`}
                                  >
                                    {ev.relevance}
                                  </span>
                                </div>
                              </div>
                            ))}
                          {!showFor && h.evidence_for.length > 0 && (
                            <p className="text-[10px] text-slate-400 italic">
                              Click to expand {h.evidence_for.length} evidence items
                            </p>
                          )}
                          {h.evidence_for.length === 0 && (
                            <p className="text-[10px] text-slate-400 italic">No supporting evidence identified</p>
                          )}
                        </div>

                        {/* Evidence AGAINST */}
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowEvAgainst((prev) => {
                                const n = new Set(prev);
                                n.has(i) ? n.delete(i) : n.add(i);
                                return n;
                              })
                            }
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 mb-2"
                          >
                            <XCircle size={12} /> Evidence AGAINST ({h.evidence_against.length})
                            {showAgainst ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                          {showAgainst &&
                            h.evidence_against.map((ev, j) => (
                              <div
                                key={j}
                                className="mb-2 p-2 rounded bg-white/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800"
                              >
                                <p className="text-[11px] text-slate-700 dark:text-slate-300">{ev.claim}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] font-mono text-slate-400">source: {ev.source}</span>
                                  <span
                                    className={`text-[9px] font-mono px-1 py-0.5 rounded ${RELEVANCE_COLORS[ev.relevance]}`}
                                  >
                                    {ev.relevance}
                                  </span>
                                </div>
                              </div>
                            ))}
                          {!showAgainst && h.evidence_against.length > 0 && (
                            <p className="text-[10px] text-slate-400 italic">
                              Click to expand {h.evidence_against.length} evidence items
                            </p>
                          )}
                          {h.evidence_against.length === 0 && (
                            <p className="text-[10px] text-slate-400 italic">No contradictory evidence identified</p>
                          )}
                        </div>
                      </div>

                      {/* What would change */}
                      <div className="mt-4 p-3 rounded-lg bg-white/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
                          <Lightbulb size={12} /> What would change this assessment
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">{h.what_would_change}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Key Assumptions */}
          {result.key_assumptions.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 font-mono mb-3 flex items-center gap-2">
                <AlertTriangle size={12} /> Key Assumptions
              </h3>
              <ul className="space-y-2">
                {result.key_assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-slate-300 mt-0.5">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Collection */}
          {result.recommended_collection.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 font-mono mb-3 flex items-center gap-2">
                <Search size={12} /> Recommended Collection
              </h3>
              <ul className="space-y-2">
                {result.recommended_collection.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-brand-500 mt-0.5">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
