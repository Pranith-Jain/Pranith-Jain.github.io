import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Globe, Crosshair, Wrench, ExternalLink, Search, X } from 'lucide-react';

interface ActorEntry {
  slug: string;
  name: string;
  aliases: string[];
  category: string;
  country: string | null;
  sponsor: string | null;
  motivation: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  hasDetails: boolean;
  sectorCount: number;
  toolCount: number;
  operationCount: number;
  observedCountries: string[];
  description: string;
  sizeBytes: number;
  mitreId: string | null;
  subgroupCount: number;
}

interface ActorBody extends ActorEntry {
  names: string[];
  fullDescription: string | null;
  sectors: string[];
  toolsUsed: string[];
  operations: { title: string; url: string | null }[];
  counterOperations: { title: string; url: string | null }[];
  informationLinks: string[];
  mitreLink: string | null;
  subgroups: { name: string; period: string | null }[];
}

interface ActorIndexResponse {
  counts: {
    actors: number;
    apt: number;
    other: number;
    unknown: number;
    withCards: number;
    withMitre: number;
    withTools: number;
    totalSectors: number;
  };
  source: string;
  license: string;
  lastSyncedAt: string;
  aptmap: { nodes: number; links: number; aptNodes: number } | null;
}

interface ActorListResponse {
  total: number;
  returned: number;
  actors: ActorEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  apt: 'APT',
  other: 'Other',
  unknown: 'Unknown',
};

const CATEGORY_BADGE: Record<string, string> = {
  apt: 'font-mono text-rose-400 bg-rose-950/30 border-rose-800/40',
  other: 'font-mono text-amber-400 bg-amber-950/30 border-amber-800/40',
  unknown: 'font-mono text-slate-400 bg-slate-950/30 border-slate-700/40',
};

function getCountryFlag(code: string): string {
  if (code.length !== 2) return '';
  const u = code.toUpperCase();
  return `${String.fromCodePoint(0x1f1e6 + u.charCodeAt(0) - 65)}${String.fromCodePoint(0x1f1e6 + u.charCodeAt(1) - 65)}`;
}

export default function ETDAActorsPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { data: indexData, loading: indexLoading, error: indexError } =
    useDataFetch<ActorIndexResponse>({ url: '/api/v1/apt-actors/' });

  const { data: listData, loading: listLoading } =
    useDataFetch<ActorListResponse>({
      url: categoryFilter
        ? `/api/v1/apt-actors/actors?category=${categoryFilter}`
        : '/api/v1/apt-actors/actors',
    });

  const { data: detailData } =
    useDataFetch<ActorBody>({
      url: selectedSlug ? `/api/v1/apt-actors/actors/${selectedSlug}` : null,
    });

  const filteredActors = useMemo(() => {
    if (!listData?.actors) return [];
    const needle = search.toLowerCase();
    return listData.actors.filter((a: ActorEntry) => {
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        a.aliases.some((al) => al.toLowerCase().includes(needle)) ||
        (a.description || '').toLowerCase().includes(needle) ||
        (a.country || '').toLowerCase().includes(needle)
      );
    });
  }, [listData, search]);

  const loading = indexLoading || listLoading;
  const error = indexError;

  return (
    <DataPageLayout
      icon={<Globe className="text-rose-400" />}
      title="APT Actor Database"
      description={`ETDA Threat Group Cards — ${indexData?.counts.actors ?? '...'} threat actors (${indexData?.counts.apt ?? '...'} APT)`}
      loading={loading}
      error={error ? String(error) : undefined}
      backTo="/"
      backLabel="Home"
      maxWidthClass="max-w-6xl"
      hideBack
    >
      <div className="space-y-4">
        {/* Search & filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search actors by name, alias, country, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[rgb(var(--surface-200))] border border-[rgb(var(--border-500))] text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-brand-500/60"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['apt', 'other', 'unknown'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  categoryFilter === cat
                    ? CATEGORY_BADGE[cat]
                    : 'bg-[rgb(var(--surface-200))] border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-500'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        {indexData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[rgb(var(--surface-200))] rounded-xl border border-[rgb(var(--border-400))] p-3">
              <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Actors</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{indexData.counts.actors}</div>
            </div>
            <div className="bg-[rgb(var(--surface-200))] rounded-xl border border-[rgb(var(--border-400))] p-3">
              <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">APT Groups</div>
              <div className="text-lg font-semibold text-rose-400">{indexData.counts.apt}</div>
            </div>
            <div className="bg-[rgb(var(--surface-200))] rounded-xl border border-[rgb(var(--border-400))] p-3">
              <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">With MITRE</div>
              <div className="text-lg font-semibold text-brand-400">{indexData.counts.withMitre}</div>
            </div>
            <div className="bg-[rgb(var(--surface-200))] rounded-xl border border-[rgb(var(--border-400))] p-3">
              <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sectors</div>
              <div className="text-lg font-semibold text-amber-400">{indexData.counts.totalSectors}</div>
            </div>
          </div>
        )}

        {/* Actor grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredActors.map((actor: ActorEntry) => (
            <button
              key={actor.slug}
              onClick={() => setSelectedSlug(actor.slug)}
              className={`text-left rounded-xl border p-4 transition-all hover:border-slate-500 ${
                selectedSlug === actor.slug
                  ? 'border-brand-500/60 bg-[rgb(var(--surface-200))]'
                  : 'border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{actor.name}</div>
                  {actor.aliases.length > 0 && (
                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{actor.aliases.slice(0, 3).join(', ')}</div>
                  )}
                </div>
                <span className={`shrink-0 font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${CATEGORY_BADGE[actor.category] || ''}`}>
                  {CATEGORY_LABELS[actor.category] || actor.category}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                {actor.country && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <Globe className="w-3 h-3" />
                    {actor.country.length === 2 ? getCountryFlag(actor.country) + ' ' : ''}{actor.country}
                  </span>
                )}
                {actor.toolCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <Wrench className="w-3 h-3" /> {actor.toolCount} tools
                  </span>
                )}
                {actor.sectorCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <Crosshair className="w-3 h-3" /> {actor.sectorCount} sectors
                  </span>
                )}
                {actor.firstSeen && (
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500">since {actor.firstSeen}</span>
                )}
              </div>
              {actor.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{actor.description}</p>
              )}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {!loading && filteredActors.length === 0 && (
          <div className="text-center py-16">
            <Globe className="w-8 h-8 mx-auto mb-3 opacity-40 text-slate-500 dark:text-slate-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No actors match your filters</p>
          </div>
        )}

        {/* Detail modal */}
        {selectedSlug && detailData && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 pb-8 px-4 overflow-y-auto"
            onClick={() => setSelectedSlug(null)}
          >
            <div
              className="relative w-full max-w-2xl bg-[rgb(var(--surface-100))] border border-[rgb(var(--border-500))] rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 p-5 border-b border-[rgb(var(--border-400))]">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{detailData.name}</h2>
                  {detailData.aliases.length > 0 && (
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      aka {detailData.aliases.join(', ')}
                    </p>
                  )}
                </div>
                <button onClick={() => setSelectedSlug(null)} className="shrink-0 text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 p-1">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Attributions */}
                <div className="grid grid-cols-2 gap-3">
                  {detailData.country && (
                    <div className="bg-[rgb(var(--surface-200))] rounded-xl p-3">
                      <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Country</p>
                      <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailData.country}</p>
                    </div>
                  )}
                  {detailData.sponsor && (
                    <div className="bg-[rgb(var(--surface-200))] rounded-xl p-3">
                      <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sponsor</p>
                      <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailData.sponsor}</p>
                    </div>
                  )}
                  {detailData.motivation && (
                    <div className="bg-[rgb(var(--surface-200))] rounded-xl p-3">
                      <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Motivation</p>
                      <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{detailData.motivation}</p>
                    </div>
                  )}
                  {detailData.firstSeen && (
                    <div className="bg-[rgb(var(--surface-200))] rounded-xl p-3">
                      <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Period</p>
                      <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                        {detailData.firstSeen}{detailData.lastSeen ? ` — ${detailData.lastSeen}` : ''}
                      </p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {detailData.fullDescription && (
                  <div className="bg-[rgb(var(--surface-200))] rounded-xl p-4">
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Description</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{detailData.fullDescription}</p>
                  </div>
                )}

                {/* Sectors */}
                {detailData.sectors.length > 0 && (
                  <div>
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Target Sectors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailData.sectors.map((s: string) => (
                        <span key={s} className="font-mono text-[10px] font-bold text-cyan-400 bg-cyan-950/30 border border-cyan-800/40 px-2 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools */}
                {detailData.toolsUsed.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Tools ({detailData.toolCount})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailData.toolsUsed.slice(0, 30).map((t: string) => (
                        <span key={t} className="font-mono text-[10px] font-bold text-amber-400 bg-amber-950/30 border border-amber-800/40 px-2 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                      {detailData.toolsUsed.length > 30 && (
                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500 self-center">+{detailData.toolsUsed.length - 30} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Operations */}
                {detailData.operations.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Operations ({detailData.operations.length})
                    </p>
                    <ul className="space-y-1">
                      {detailData.operations.slice(0, 10).map((op: { title: string; url: string | null }, i: number) => (
                        <li key={i} className="font-mono text-xs">
                          {op.url ? (
                            <a href={op.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline inline-flex items-center gap-1">
                            {op.title} <ExternalLink className="w-3 h-3" />
                          </a>
                          ) : (
                            <span className="text-slate-700 dark:text-slate-300">{op.title}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Subgroups */}
                {detailData.subgroups.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Subgroups</p>
                    <div className="space-y-1">
                      {detailData.subgroups.map((sg: { name: string; period: string | null }, i: number) => (
                        <div key={i} className="font-mono text-xs text-slate-700 dark:text-slate-300">
                          {sg.name}{sg.period ? ` (${sg.period})` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MITRE link */}
                {detailData.mitreLink && (
                  <a
                    href={detailData.mitreLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-brand-400 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> MITRE ATT&CK {detailData.mitreId}
                  </a>
                )}

                {/* Information links */}
                {detailData.informationLinks.length > 0 && (
                  <div className="pt-3 border-t border-[rgb(var(--border-400))]">
                    <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">References</p>
                    <ul className="space-y-0.5">
                      {detailData.informationLinks.map((url: string, i: number) => (
                        <li key={i}>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-brand-400 hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> {new URL(url).hostname}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {indexData && (
          <div className="text-xs text-slate-500 dark:text-slate-500 border-t border-[rgb(var(--border-400))] pt-3 mt-6">
            Source: {indexData.source} &middot; License: {indexData.license}
            {indexData.lastSyncedAt && (
              <> &middot; Last synced: {new Date(indexData.lastSyncedAt).toLocaleDateString()}</>
            )}
            {indexData.aptmap && (
              <> &middot; APTmap: {indexData.aptmap.aptNodes} groups, {indexData.aptmap.nodes} nodes, {indexData.aptmap.links} edges</>
            )}
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}