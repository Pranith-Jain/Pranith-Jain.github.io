import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Target, Users, ExternalLink, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface Technique {
  id: string;
  name: string;
  description: string;
  tactic: string | null;
  platforms: string[];
  dataSources: string[];
  detection: string;
  mitreUrl: string;
}

interface Actor {
  id: string;
  name: string;
  aliases: string[];
}

interface TechniqueResponse {
  technique: Technique | null;
  actors: Actor[];
  relatedTechniques: string[];
  error?: string;
}

const TACTIC_COLORS: Record<string, string> = {
  'initial-access': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  execution: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  persistence: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  'privilege-escalation': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  'defense-evasion': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  'credential-access': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  discovery: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  'lateral-movement': 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
  collection: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  'command-and-control': 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  exfiltration: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
  impact: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400',
};

export default function TechniquePage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('t') ?? searchParams.get('technique') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TechniqueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const TECH_RE = /^T\d{4}(\.\d{3})?$/i;
  const valid = TECH_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/mitre/technique?technique=${encodeURIComponent(input.trim().toUpperCase())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      setResult((await r.json()) as TechniqueResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">MITRE ATT&CK Technique</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Look up MITRE ATT&CK techniques, tactics, and threat actors using them.
        </p>
      </motion.div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="T1566 or T1566.001"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={!valid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            Lookup
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Invalid technique ID (e.g. T1566 or T1566.001)
          </p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Querying MITRE ATT&CK...</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && result.technique && (
        <div className="space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-2xl">{result.technique.name}</h2>
                <p className="font-mono text-sm text-slate-500 mt-1">{result.technique.id}</p>
              </div>
              {result.technique.tactic && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${TACTIC_COLORS[result.technique.tactic.toLowerCase().replace(' ', '-')] ?? 'bg-slate-100 dark:bg-slate-800'}`}
                >
                  {result.technique.tactic}
                </span>
              )}
            </div>
          </section>

          {/* Description */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
              <Target size={18} className="text-brand-600" />
              Description
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.technique.description}</p>
            <a
              href={result.technique.mitreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-4 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              View on MITRE ATT&CK <ExternalLink size={12} />
            </a>
          </section>

          {/* Platforms & Data Sources */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">Platforms</h4>
                <div className="flex flex-wrap gap-2">
                  {result.technique.platforms.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">Data Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {result.technique.dataSources.map((d) => (
                    <span
                      key={d}
                      className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Detection */}
          {result.technique.detection && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">Detection</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.technique.detection}</p>
            </section>
          )}

          {/* Threat Actors */}
          {result.actors.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                <Users size={18} className="text-brand-600" />
                Threat Actors ({result.actors.length})
              </h3>
              <div className="space-y-2">
                {result.actors.map((actor) => (
                  <Link
                    key={actor.id}
                    to={`/dfir/actors?search=${encodeURIComponent(actor.name)}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-brand-500/30 transition-colors"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">{actor.name}</span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Related Techniques */}
          {result.relatedTechniques.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">Related Techniques</h3>
              <div className="flex flex-wrap gap-2">
                {result.relatedTechniques.map((t) => (
                  <Link
                    key={t}
                    to={`/dfir/technique?t=${t}`}
                    className="px-3 py-1 text-sm font-mono bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 rounded hover:bg-brand-500/10 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
