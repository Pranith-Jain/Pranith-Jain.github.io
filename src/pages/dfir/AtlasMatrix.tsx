import { useState, useMemo, useEffect, useCallback } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Search, X } from 'lucide-react';
import type { MitreTactic } from '../../data/dfir/atlas-matrix';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

interface ApiTechnique {
  id: string;
  name: string;
  description: string;
  tactic: string | null;
  tacticId: string | null;
  url: string;
}

interface TechniqueResponse {
  technique: ApiTechnique | null;
  relatedTechniques: string[];
  error?: string;
}

export default function AtlasMatrix(): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TechniqueResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // ~64KB dataset — load as its own chunk instead of in the route bundle.
  const [atlasMatrix, setAtlasMatrix] = useState<MitreTactic[]>([]);
  useEffect(() => {
    let cancelled = false;
    void import('../../data/dfir/atlas-matrix').then((m) => {
      if (!cancelled) setAtlasMatrix(m.atlasMatrix);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openTechnique = (id: string) => setSelectedId(id);
  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/v1/atlas/technique?technique=${encodeURIComponent(selectedId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          let msg = `${r.status}`;
          try {
            const parsed = JSON.parse(body) as { error?: string };
            msg = parsed.error ?? msg;
          } catch {
            /* use default */
          }
          throw new Error(msg);
        }
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
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

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closeDrawer]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const tactic of atlasMatrix) {
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
  }, [query, atlasMatrix]);

  const totalTactics = atlasMatrix.length;
  const totalTechniques = atlasMatrix.reduce((acc, t) => acc + t.techniques.length, 0);

  return (
    <div className="max-w-full px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <BackLink
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back
        </BackLink>

        <div>
          <h1 className="text-4xl font-mono font-bold mb-2 text-slate-900 dark:text-slate-100 tracking-[-0.03em] uppercase">
            MITRE ATLAS
          </h1>
          <p className="text-muted mb-2 max-w-3xl">
            Adversarial Threat Landscape for Artificial-Intelligence Systems. ATLAS maps tactics and techniques
            targeting ML models, AI pipelines, and LLM-based applications. Click any technique for live details.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-muted mb-3">
            <span>
              <span className="text-slate-900 dark:text-slate-100">{totalTactics}</span> tactics
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100">{totalTechniques}</span> techniques
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <a
                href="https://atlas.mitre.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                atlas.mitre.org <ExternalLink size={10} />
              </a>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          <div className="relative flex-1 min-w-0 w-full sm:min-w-[260px] sm:max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ID, name, or description…"
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 focus:outline-none"
              aria-label="Search ATLAS techniques"
            />
          </div>
        </div>

        <div className="overflow-x-auto pb-4 -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-3 min-w-max">
            {atlasMatrix.map((tactic) => (
              <div key={tactic.id} className="w-52 flex-shrink-0">
                <div className="mb-2 px-2">
                  <a
                    href={`https://atlas.mitre.org/tactics/${tactic.id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={tactic.description}
                  >
                    <div className="text-micro font-mono text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
                      {tactic.id}
                    </div>
                    <div className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition-colors mt-0.5">
                      {tactic.name}
                      <ExternalLink size={10} className="opacity-50 flex-shrink-0" />
                    </div>
                  </a>
                </div>

                <div className="space-y-1.5">
                  {tactic.techniques.map((technique) => {
                    const isSelected = selectedId === technique.id;
                    const isMatch = matches ? matches.has(technique.id) : true;
                    const isDimmed = matches !== null && !isMatch;
                    const isHighlighted = matches !== null && isMatch;

                    return (
                      <button
                        key={technique.id}
                        type="button"
                        onClick={() => openTechnique(technique.id)}
                        className={[
                          'group relative block w-full border px-2.5 py-2 text-left transition-all',
                          isSelected ? 'ring-2 ring-rule' : '',
                          isHighlighted ? 'ring-2 ring-accent/60' : '',
                          isDimmed ? 'opacity-30' : '',
                          'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 hover:bg-brand-50 dark:bg-brand-950/30',
                        ].join(' ')}
                        title={technique.description ?? technique.name}
                      >
                        <div className="text-micro font-mono text-muted">{technique.id}</div>
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 mt-0.5">
                          {technique.name}
                        </div>
                        {technique.subtechniques && technique.subtechniques.length > 0 && (
                          <div className="mt-1 text-micro font-mono text-slate-500 dark:text-slate-400">
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

        <div className="mt-8 flex flex-wrap gap-4 text-xs font-mono text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800" />
            AI/ML attack technique
          </span>
        </div>
      </div>

      {/* Technique detail drawer */}
      {selectedId && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-1/40" onClick={closeDrawer} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="atlas-detail-title"
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <span className="text-micro font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  {selectedId}
                </span>
                <h2
                  id="atlas-detail-title"
                  className="font-mono font-semibold text-lg text-slate-900 dark:text-slate-100 truncate mt-0.5"
                >
                  {detail?.technique?.name ?? (detailLoading ? 'Loading…' : selectedId)}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="close"
                className="shrink-0 p-1.5 text-muted hover:text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:bg-slate-800/60 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {detailLoading && <p className="font-mono text-sm text-muted">Fetching live data…</p>}
              {detailError && (
                <p className="font-mono text-sm text-rose-700 dark:text-rose-400">error: {detailError}</p>
              )}
              {detail?.technique && (
                <>
                  {detail.technique.tactic && (
                    <div className="text-xs font-mono text-muted">
                      Tactic: <span className="text-slate-900 dark:text-slate-100">{detail.technique.tactic}</span>
                      {detail.technique.tacticId && (
                        <span className="text-slate-500 dark:text-slate-400"> · {detail.technique.tacticId}</span>
                      )}
                    </div>
                  )}
                  {detail.technique.description && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-muted mb-1.5">Description</h3>
                      <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                        {detail.technique.description}
                      </p>
                    </div>
                  )}
                  {detail.relatedTechniques.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-muted mb-2">Related techniques</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.relatedTechniques.map((rid) => (
                          <button
                            key={rid}
                            type="button"
                            onClick={() => openTechnique(rid)}
                            className="text-xs font-mono px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-brand-600 dark:text-brand-400 hover:border-slate-200 dark:border-slate-800 transition-colors"
                          >
                            {rid}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <a
                    href={sanitizeUrl(detail.technique.url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    Open on atlas.mitre.org <ExternalLink size={12} />
                  </a>
                </>
              )}
              {!detailLoading && !detail && !detailError && (
                <p className="font-mono text-sm text-muted">No live data available.</p>
              )}
            </div>
          </aside>
        </>
      )}
      <RelatedWikiArticles />
    </div>
  );
}
