import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { mitreMatrix } from '../../data/dfir/mitre-matrix';
import { threatActors } from '../../data/dfir/threat-actors';

// Build a Set of all technique IDs used by any actor (including subtechniques)
const usedByActors = new Set<string>();
for (const a of threatActors) {
  for (const t of a.techniques) usedByActors.add(t);
}

function actorsByTechnique(id: string): typeof threatActors {
  return threatActors.filter((a) => a.techniques.includes(id));
}

function techniqueUrl(id: string): string {
  // Convert T1566.001 → T1566/001 for MITRE URLs
  const normalized = id.replace('.', '/');
  return `https://attack.mitre.org/techniques/${normalized}/`;
}

export default function MitreMatrix(): JSX.Element {
  const [query, setQuery] = useState('');

  const filteredMatrix = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mitreMatrix;
    return mitreMatrix
      .map((tactic) => ({
        ...tactic,
        techniques: tactic.techniques.filter(
          (t) =>
            t.id.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            (t.description ?? '').toLowerCase().includes(q) ||
            (t.subtechniques ?? []).some((s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
        ),
      }))
      .filter((tactic) => tactic.techniques.length > 0);
  }, [query]);

  const totalTactics = mitreMatrix.length;
  const totalTechniques = mitreMatrix.reduce((acc, t) => acc + t.techniques.length, 0);

  return (
    <div className="max-w-full px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-4xl font-display font-bold mb-2">MITRE ATT&amp;CK Matrix</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl">
            Enterprise tactics and techniques from the MITRE ATT&amp;CK framework. Click any technique to open the
            official ATT&amp;CK reference. Highlighted tiles indicate techniques used by tracked threat actors.
          </p>
          <div className="flex items-center gap-4 text-sm font-mono text-slate-500 mb-8">
            <span>
              <span className="text-slate-900 dark:text-slate-100">{totalTactics}</span> tactics
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100">{totalTechniques}</span> techniques
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100">{usedByActors.size}</span> actor-tracked IDs
            </span>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by technique ID or name…"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>

        {filteredMatrix.length === 0 && (
          <p className="font-mono text-slate-500 text-sm">No techniques match "{query}".</p>
        )}

        {/* Matrix — horizontally scrollable */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {filteredMatrix.map((tactic) => (
              <div key={tactic.id} className="w-52 flex-shrink-0">
                {/* Tactic header */}
                <div className="mb-2 px-2">
                  <a
                    href={`https://attack.mitre.org/tactics/${tactic.id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={tactic.description}
                  >
                    <div className="text-[10px] font-mono text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
                      {tactic.id}
                    </div>
                    <div className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                      {tactic.name}
                      <ExternalLink size={10} className="opacity-50 flex-shrink-0" />
                    </div>
                  </a>
                </div>

                {/* Technique tiles */}
                <div className="space-y-1.5">
                  {tactic.techniques.map((technique) => {
                    const actors = actorsByTechnique(technique.id);
                    const isUsed = actors.length > 0;

                    return (
                      <div key={technique.id}>
                        <a
                          href={techniqueUrl(technique.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={[
                            'group block rounded-md border px-2.5 py-2 text-left transition-all hover:shadow-sm',
                            isUsed
                              ? 'bg-brand-500/10 border-brand-500/40 hover:bg-brand-500/20 dark:bg-brand-400/10 dark:border-brand-400/40 dark:hover:bg-brand-400/20'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700',
                          ].join(' ')}
                          title={technique.description ?? technique.name}
                        >
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{technique.id}</div>
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight line-clamp-2 mt-0.5">
                            {technique.name}
                          </div>
                          {isUsed && (
                            <div className="mt-1 text-[10px] font-mono text-brand-700 dark:text-brand-300 font-semibold">
                              {actors.length === 1 ? `Used by ${actors[0].name}` : `Used by ${actors.length} actors`}
                            </div>
                          )}
                          {technique.subtechniques && technique.subtechniques.length > 0 && (
                            <div className="mt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                              +{technique.subtechniques.length} sub-techniques
                            </div>
                          )}
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap gap-4 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded border bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            Technique (not actor-tracked)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded border bg-brand-500/10 border-brand-500/40" />
            Technique used by a tracked threat actor
          </div>
        </div>
      </div>
    </div>
  );
}
