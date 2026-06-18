import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Search, X } from 'lucide-react';
import type { MitreTactic } from '../../data/dfir/mitre-matrix';
import { threatActors } from '../../data/dfir/threat-actors';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

interface ApiTechnique {
  id: string;
  name: string;
  description: string;
  tactic: string | null;
  platforms: string[];
  dataSources: string[];
  detection: string;
  mitreUrl: string;
}

interface ApiActor {
  id: string;
  name: string;
  aliases: string[];
}

interface TechniqueResponse {
  technique: ApiTechnique | null;
  actors: ApiActor[];
  relatedTechniques: string[];
  error?: string;
}

// Build a Set of all technique IDs used by any actor (including subtechniques)
const usedByActors = new Set<string>();
for (const a of threatActors) {
  for (const t of a.techniques) usedByActors.add(t);
}

function actorsByTechnique(id: string): typeof threatActors {
  return threatActors.filter((a) => a.techniques.includes(id));
}

/**
 * Per-tile coverage marker. localStorage-backed so analysts can stage a
 * SIEM coverage map without a backend. Cycle order on click:
 *   none → covered → partial → uncovered → none
 * — represents "have we got detection for this technique." This is the
 * "placeholder for user-defined coverage config" — a real deployment
 * would seed this from a Sigma/Sentinel ruleset audit.
 */
type Coverage = 'covered' | 'partial' | 'uncovered';
const COVERAGE_KEY = 'mitre-matrix-coverage:v1';
const COVERAGE_NEXT: Record<Coverage | 'none', Coverage | 'none'> = {
  none: 'covered',
  covered: 'partial',
  partial: 'uncovered',
  uncovered: 'none',
};
const COVERAGE_DOT: Record<Coverage, string> = {
  covered: 'bg-emerald-500',
  partial: 'bg-amber-500',
  uncovered: 'bg-rose-500',
};
const COVERAGE_LABEL: Record<Coverage, string> = {
  covered: 'covered',
  partial: 'partial',
  uncovered: 'uncovered',
};

function loadCoverage(): Record<string, Coverage> {
  try {
    const raw = localStorage.getItem(COVERAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Coverage>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function MitreMatrix(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TechniqueResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Record<string, Coverage>>(() => loadCoverage());
  const [coverageMode, setCoverageMode] = useState(false);
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  // The matrix dataset is ~89KB — load it as its own chunk so it doesn't bloat
  // the route's initial JS. Empty until the dynamic import resolves.
  const [mitreMatrix, setMitreMatrix] = useState<MitreTactic[]>([]);
  useEffect(() => {
    let cancelled = false;
    void import('../../data/dfir/mitre-matrix').then((m) => {
      if (!cancelled) setMitreMatrix(m.mitreMatrix);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openTechnique = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', id);
        return next;
      });
    },
    [setSearchParams]
  );

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('id');
      return next;
    });
  }, [setSearchParams]);

  // Open technique from URL on mount + react to ?id=... changes (e.g. legacy /dfir/technique deep links)
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && id !== selectedId) setSelectedId(id);
  }, [searchParams, selectedId]);

  // Fetch detail on selection
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/v1/mitre/technique?technique=${encodeURIComponent(selectedId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `${r.status}`);
        }
        return (await r.json()) as TechniqueResponse;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: Error) => {
        if (!cancelled) setDetailError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Close drawer on Escape
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closeDrawer]);

  // Persist coverage edits.
  useEffect(() => {
    try {
      localStorage.setItem(COVERAGE_KEY, JSON.stringify(coverage));
    } catch {
      /* quota exceeded / private mode — silently skip */
    }
  }, [coverage]);

  // Sync search query into URL so links share state.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (query.trim()) next.set('q', query.trim());
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [query, setSearchParams]);

  const cycleCoverage = useCallback((id: string) => {
    setCoverage((prev) => {
      const cur = prev[id] ?? 'none';
      const next = COVERAGE_NEXT[cur];
      const out = { ...prev };
      if (next === 'none') delete out[id];
      else out[id] = next;
      return out;
    });
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const tactic of mitreMatrix) {
      for (const t of tactic.techniques) {
        if (
          t.id.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.subtechniques ?? []).some((s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
        ) {
          set.add(t.id);
        }
      }
    }
    return set;
  }, [query, mitreMatrix]);

  // Apply highlight+gap-mode to produce the visible matrix. Search
  // highlights rather than filters (keeps tactic columns intact) — the
  // explicit "show gaps only" toggle is the filter pathway.
  const visibleMatrix = useMemo(() => {
    if (!showGapsOnly) return mitreMatrix;
    return mitreMatrix
      .map((tactic) => ({
        ...tactic,
        techniques: tactic.techniques.filter((t) => {
          const c = coverage[t.id];
          return c === 'uncovered' || c === 'partial' || c === undefined;
        }),
      }))
      .filter((tactic) => tactic.techniques.length > 0);
  }, [coverage, showGapsOnly, mitreMatrix]);

  const totalTactics = mitreMatrix.length;
  const totalTechniques = mitreMatrix.reduce((acc, t) => acc + t.techniques.length, 0);
  const coverageStats = useMemo(() => {
    let covered = 0;
    let partial = 0;
    let uncovered = 0;
    for (const v of Object.values(coverage)) {
      if (v === 'covered') covered++;
      else if (v === 'partial') partial++;
      else if (v === 'uncovered') uncovered++;
    }
    return { covered, partial, uncovered, untagged: totalTechniques - covered - partial - uncovered };
  }, [coverage, totalTechniques]);

  return (
    <div className="max-w-full px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <BackLink
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back
        </BackLink>

        <div className="animate-fade-in-up">
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">MITRE ATT&amp;CK</h1>
          <p className="text-muted mb-2 max-w-3xl">
            Enterprise tactics and techniques. Click any technique tile to open a side drawer with description, tactics,
            platforms, data sources, detection guidance, related techniques, and tracked actors that use it. Highlighted
            tiles indicate techniques observed in actor tradecraft.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-slate-500 mb-3">
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
            {coverageStats.covered + coverageStats.partial + coverageStats.uncovered > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {coverageStats.covered}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {coverageStats.partial}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {coverageStats.uncovered}
                  </span>
                  <span className="text-slate-500">tagged</span>
                </span>
              </>
            )}
            {matches && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-600 dark:text-cyan-400">{matches.size} matches</span>
              </>
            )}
          </div>
        </div>

        {/* Search + coverage toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ID, name, or description — matches highlight, others dim…"
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Search MITRE ATT&CK techniques"
            />
          </div>
          <button
            type="button"
            onClick={() => setCoverageMode((v) => !v)}
            className={`text-xs font-mono px-3 py-2 rounded border transition-colors ${
              coverageMode
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 text-muted hover:border-emerald-500/40'
            }`}
            title="In coverage mode, clicking a tile cycles its detection-coverage tag instead of opening the drawer."
          >
            {coverageMode ? 'coverage mode: ON' : 'coverage mode'}
          </button>
          <button
            type="button"
            onClick={() => setShowGapsOnly((v) => !v)}
            className={`text-xs font-mono px-3 py-2 rounded border transition-colors ${
              showGapsOnly
                ? 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                : 'border-slate-300 dark:border-slate-700 text-muted hover:border-rose-500/40'
            }`}
            title="Show only techniques tagged uncovered/partial or untagged — your detection gap."
          >
            gaps only
          </button>
          {Object.keys(coverage).length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear all coverage tags?')) setCoverage({});
              }}
              className="text-xs font-mono px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-slate-500 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear tags
            </button>
          )}
        </div>

        {coverageMode && (
          <p className="text-mini font-mono text-emerald-700 dark:text-emerald-300 mb-4">
            Click a tile to cycle: <span className="text-slate-500">none →</span>{' '}
            <span className="text-emerald-600">covered →</span> <span className="text-amber-600">partial →</span>{' '}
            <span className="text-rose-600">uncovered →</span> <span className="text-slate-500">none</span>. Saved to
            this browser's localStorage.
          </p>
        )}

        {visibleMatrix.length === 0 && (
          <p className="font-mono text-slate-500 text-sm">No techniques to show with current filters.</p>
        )}

        {/* Matrix — horizontally scrollable; explicit hint so touch users know to swipe */}
        <p className="sm:hidden text-mini font-mono text-slate-500 dark:text-slate-400 mb-2 italic">
          Swipe horizontally to scan tactics →
        </p>
        <div className="overflow-x-auto pb-4 -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-3 min-w-max">
            {visibleMatrix.map((tactic) => (
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
                    <div className="text-micro font-mono text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
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
                    const isSelected = selectedId === technique.id;
                    const cov = coverage[technique.id];
                    const isMatch = matches ? matches.has(technique.id) : true;
                    const isDimmed = matches !== null && !isMatch;
                    const isHighlighted = matches !== null && isMatch;

                    return (
                      <button
                        key={technique.id}
                        type="button"
                        onClick={() => (coverageMode ? cycleCoverage(technique.id) : openTechnique(technique.id))}
                        className={[
                          'group relative block w-full rounded-md border px-2.5 py-2 text-left transition-all hover:shadow-sm',
                          isSelected ? 'ring-2 ring-brand-500/60 dark:ring-brand-400/60' : '',
                          isHighlighted ? 'ring-2 ring-cyan-500/60 dark:ring-cyan-400/60' : '',
                          isDimmed ? 'opacity-30' : '',
                          isUsed
                            ? 'bg-brand-500/10 border-brand-500/40 hover:bg-brand-500/20 dark:bg-brand-400/10 dark:border-brand-400/40 dark:hover:bg-brand-400/20'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700',
                        ].join(' ')}
                        title={
                          coverageMode
                            ? `Click to cycle coverage. Currently: ${cov ?? 'none'}`
                            : (technique.description ?? technique.name)
                        }
                      >
                        {cov && (
                          <span
                            className={`absolute top-1 right-1 w-2 h-2 rounded-full ${COVERAGE_DOT[cov]}`}
                            title={`coverage: ${COVERAGE_LABEL[cov]}`}
                            aria-label={`coverage: ${COVERAGE_LABEL[cov]}`}
                          />
                        )}
                        <div className="text-micro font-mono text-slate-500 dark:text-slate-400">{technique.id}</div>
                        <div className="text-tool sm:text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug line-clamp-2 mt-0.5">
                          {technique.name}
                        </div>
                        {isUsed && (
                          <div className="mt-1 text-micro font-mono text-brand-700 dark:text-brand-300 font-semibold">
                            {actors.length === 1 && actors[0]
                              ? `Used by ${actors[0].name}`
                              : `Used by ${actors.length} actors`}
                          </div>
                        )}
                        {technique.subtechniques && technique.subtechniques.length > 0 && (
                          <div className="mt-1 text-micro font-mono text-slate-400 dark:text-slate-400">
                            +{technique.subtechniques.length} sub-techniques
                          </div>
                        )}
                      </button>
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

      {/* Technique detail drawer */}
      {selectedId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="mitre-detail-title"
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 backdrop-blur">
              <div className="min-w-0">
                <span className="text-micro font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  {selectedId}
                </span>
                <h2
                  id="mitre-detail-title"
                  className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 truncate"
                >
                  {detail?.technique?.name ?? (detailLoading ? 'Loading…' : selectedId)}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close technique details"
                className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {detailLoading && <p className="font-mono text-sm text-slate-500">Fetching…</p>}
              {detailError && (
                <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {detailError}</p>
              )}
              {detail?.technique && (
                <>
                  {detail.technique.tactic && (
                    <div className="text-xs font-mono text-slate-500">
                      Tactic: <span className="text-slate-900 dark:text-slate-100">{detail.technique.tactic}</span>
                    </div>
                  )}
                  {detail.technique.description && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Description</h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {detail.technique.description}
                      </p>
                    </div>
                  )}
                  {detail.technique.platforms?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Platforms</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.technique.platforms.map((p) => (
                          <span
                            key={p}
                            className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.technique.dataSources?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Data sources</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.technique.dataSources.map((d) => (
                          <span
                            key={d}
                            className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.technique.detection && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Detection</h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {detail.technique.detection}
                      </p>
                    </div>
                  )}
                </>
              )}
              {detail && detail.actors.length > 0 && (
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
                    Tracked actors using this technique ({detail.actors.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.actors.map((a) => (
                      <Link
                        key={a.id}
                        to={`/threatintel/actors/${a.id}`}
                        className="block px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:border-brand-500/40 transition-colors"
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{a.name}</div>
                        {a.aliases.length > 0 && (
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            aka {a.aliases.slice(0, 4).join(', ')}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {detail && detail.relatedTechniques.length > 0 && (
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Related techniques</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.relatedTechniques.map((rid) => (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => openTechnique(rid)}
                        className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-brand-600 dark:text-brand-400 hover:border-brand-500/40 transition-colors"
                      >
                        {rid}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {detail?.technique?.mitreUrl && (
                <a
                  href={detail.technique.mitreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  Open on attack.mitre.org <ExternalLink size={12} />
                </a>
              )}
            </div>
          </aside>
        </>
      )}
      <RelatedWikiArticles />
    </div>
  );
}
