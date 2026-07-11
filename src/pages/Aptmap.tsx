import { useState, useEffect, useMemo } from 'react';
import { DataPageLayout } from '../components/DataPageLayout';
import { Globe, Crosshair, Wrench, FileCode, Cpu, Database, Shield, Search, X } from 'lucide-react';

interface AptmapIndex {
  aptmap: {
    nodes: number;
    links: number;
    aptNodes: number;
    countries: number;
    tools: number;
    ttps: number;
  } | null;
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
}

interface AptmapGraph {
  nodes: Array<{
    id: string;
    name: string;
    group: string;
    color: string;
    description: string;
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
}

interface CountItem {
  id: number;
  count: number;
  [key: string]: unknown;
}

type TabId = 'overview' | 'graph' | 'files' | 'imports' | 'certificates';

function TopBarChart({ items, labelKey, maxItems = 15 }: { items: CountItem[]; labelKey: string; maxItems?: number }) {
  const top = items.slice(0, maxItems);
  const maxCount = top[0]?.count ?? 1;
  return (
    <div className="space-y-1">
      {top.map((item) => {
        const label = String(item[labelKey] ?? '');
        const pct = Math.round((item.count / maxCount) * 100);
        return (
          <div key={item.id} className="flex items-center gap-2">
            <span className="w-32 truncate text-xs font-mono text-slate-300 shrink-0" title={label}>
              {label}
            </span>
            <div className="flex-1 h-4 bg-slate-800/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500/60 rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="w-16 text-right text-xs font-mono text-slate-400 tabular-nums shrink-0">
              {item.count.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalStackedChart({
  items,
  labelKey,
  maxItems = 10,
}: {
  items: CountItem[];
  labelKey: string;
  maxItems?: number;
}) {
  const top = items.slice(0, maxItems);
  const total = top.reduce((s, i) => s + i.count, 0) || 1;
  const colors = [
    'bg-rose-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-sky-500',
    'bg-violet-500',
    'bg-teal-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-orange-500',
    'bg-cyan-500',
  ];

  return (
    <div className="space-y-1.5">
      {top.map((item, idx) => {
        const label = String(item[labelKey] ?? '');
        const pct = (item.count / total) * 100;
        return (
          <div key={item.id} className="flex items-center gap-2">
            <span className="w-40 truncate text-xs font-mono text-slate-300 shrink-0" title={label}>
              {label}
            </span>
            <div className="flex-1 h-5 bg-slate-800/50 rounded-full overflow-hidden flex">
              <div
                className={`h-full ${colors[idx % colors.length]} rounded-full transition-all`}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs font-mono text-slate-400 tabular-nums shrink-0">
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AptmapPage() {
  const [index, setIndex] = useState<AptmapIndex | null>(null);
  const [graph, setGraph] = useState<AptmapGraph | null>(null);
  const [filetypes, setFiletypes] = useState<CountItem[]>([]);
  const [filesizes, setFilesizes] = useState<CountItem[]>([]);
  const [sections, setSections] = useState<CountItem[]>([]);
  const [resources, setResources] = useState<CountItem[]>([]);
  const [imports, setImports] = useState<CountItem[]>([]);
  const [certificates, setCertificates] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<AptmapGraph['nodes'][0] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const sig = AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]);
    (async () => {
      try {
        const [idxRes, graphRes, ftRes, fsRes, secRes, resRes, impRes, certRes] = await Promise.all([
          fetch('/api/v1/apt-actors/', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/filetypes_count.json', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/filesizes_count.json', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/sections_count.json', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/resources_count.json', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/imports_count.json', { signal: sig }),
          fetch('/api/v1/apt-actors/aptmap/data/certificates_count.json', { signal: sig }),
        ]);
        if (!idxRes.ok || !graphRes.ok) throw new Error('Failed to load APTmap data');
        setIndex(await idxRes.json());
        const graphJson = await graphRes.json();
        // API wraps graph inside { nodes: count, links: count, graph: { nodes, links } }
        setGraph(graphJson.graph ?? graphJson);
        setFiletypes(ftRes.ok ? (await ftRes.json()).slice(0, 50) : []);
        setFilesizes(fsRes.ok ? await fsRes.json() : []);
        setSections(secRes.ok ? (await secRes.json()).slice(0, 50) : []);
        setResources(resRes.ok ? (await resRes.json()).slice(0, 50) : []);
        setImports(impRes.ok ? (await impRes.json()).slice(0, 50) : []);
        setCertificates(certRes.ok ? (await certRes.json()).slice(0, 50) : []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const graphStats = useMemo(() => {
    if (!graph) return null;
    const aptGroups = graph.nodes.filter((n) => n.group === 'APT');
    const tools = graph.nodes.filter((n) => n.group === 'Tool');
    const countries = graph.nodes.filter((n) => n.group === 'Country');
    const ttps = graph.nodes.filter((n) => n.group === 'TTP');
    return { aptGroups, tools, countries, ttps };
  }, [graph]);

  const filteredNodes = useMemo(() => {
    if (!graph || !searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return graph.nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.group.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)
    );
  }, [graph, searchQuery]);

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Database size={14} /> },
    { id: 'graph', label: 'Relationship Graph', icon: <Globe size={14} /> },
    { id: 'files', label: 'File Analysis', icon: <FileCode size={14} /> },
    { id: 'imports', label: 'PE Metadata', icon: <Cpu size={14} /> },
    { id: 'certificates', label: 'Certificates', icon: <Shield size={14} /> },
  ];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Crosshair size={28} />}
      title="APTmap — Malware Analysis"
      description="Cross-sample analysis of 18,000+ malware samples across 400+ APT groups from the ETDA Threat Group Cards dataset. Shows file-type distributions, PE metadata patterns, DLL import trends, and APT-to-tool relationships."
      loading={loading}
      error={error}
      onRetry={() => window.location.reload()}
      maxWidthClass="max-w-7xl"
    >
      {/* Stats Bar */}
      {index?.aptmap && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
            <div className="text-eyebrow uppercase text-slate-500 mb-1">Total Samples</div>
            <div className="text-2xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
              {index.aptmap.nodes.toLocaleString()}
            </div>
            <div className="text-micro font-mono text-slate-500 mt-1">malware samples analyzed</div>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div className="text-eyebrow uppercase text-rose-400 mb-1">APT Groups</div>
            <div className="text-2xl font-display font-bold text-rose-400 tabular-nums">{index.aptmap.aptNodes}</div>
            <div className="text-micro font-mono text-rose-400/70 mt-1">unique threat groups</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="text-eyebrow uppercase text-amber-400 mb-1">Tools &amp; Malware</div>
            <div className="text-2xl font-display font-bold text-amber-400 tabular-nums">{index.aptmap.tools}</div>
            <div className="text-micro font-mono text-amber-400/70 mt-1">unique families</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-eyebrow uppercase text-emerald-400 mb-1">Countries</div>
            <div className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
              {index.aptmap.countries}
            </div>
            <div className="text-micro font-mono text-emerald-400/70 mt-1">attribution origins</div>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="text-eyebrow uppercase text-sky-400 mb-1">TTPs</div>
            <div className="text-2xl font-display font-bold text-sky-400 tabular-nums">{index.aptmap.ttps}</div>
            <div className="text-micro font-mono text-sky-400/70 mt-1">MITRE techniques</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-[rgb(var(--border-400))] pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-b-2 border-brand-500'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Overview ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {graphStats && (
            <>
              {/* Graph summary cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* APT Groups */}
                <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                  <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Crosshair size={14} className="text-rose-400" />
                    Top APT Groups
                  </h3>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {graphStats.aptGroups.slice(0, 30).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setSelectedNode(n);
                          setActiveTab('graph');
                        }}
                        className="w-full text-left px-2 py-1 rounded text-xs font-mono text-slate-300 hover:bg-slate-800/40 transition-colors truncate"
                        title={n.description || n.name}
                      >
                        {n.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tools */}
                <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                  <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Wrench size={14} className="text-amber-400" />
                    Tools &amp; Malware Families
                  </h3>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {graphStats.tools.slice(0, 40).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setSelectedNode(n);
                          setActiveTab('graph');
                        }}
                        className="w-full text-left px-2 py-1 rounded text-xs font-mono text-slate-300 hover:bg-slate-800/40 transition-colors truncate"
                        title={n.description || n.name}
                      >
                        {n.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Countries + TTPs */}
                <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                  <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Globe size={14} className="text-emerald-400" />
                    Countries &amp; TTPs
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-mono text-emerald-400 mb-1">
                        Countries ({graphStats.countries.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {graphStats.countries.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setSelectedNode(n);
                              setActiveTab('graph');
                            }}
                            className="px-2 py-0.5 rounded text-xs font-mono text-slate-300 bg-slate-800/40 hover:bg-slate-700/50 transition-colors"
                          >
                            {n.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-sky-400 mb-1">TTPs ({graphStats.ttps.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {graphStats.ttps.slice(0, 20).map((n) => (
                          <span key={n.id} className="px-2 py-0.5 rounded text-xs font-mono text-sky-300 bg-sky-900/30">
                            {n.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Relationship summary */}
              <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-2">
                  Graph Structure
                </h3>
                <div className="text-xs font-mono text-slate-400 space-y-1">
                  <p>Total nodes: {graph?.nodes.length.toLocaleString()}</p>
                  <p>Total edges: {graph?.links.length.toLocaleString()}</p>
                  <p>
                    {graphStats.aptGroups.length} APT groups &middot; {graphStats.tools.length} tools &middot;{' '}
                    {graphStats.countries.length} countries &middot; {graphStats.ttps.length} TTPs
                  </p>
                  <p className="text-slate-500 mt-1">
                    Click any node name above to view its details in the Relationship Graph tab.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* File type + size previews */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filetypes.length > 0 && (
              <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3">
                  File Type Distribution
                </h3>
                <TopBarChart items={filetypes} labelKey="filetype" maxItems={10} />
              </div>
            )}
            {filesizes.length > 0 && (
              <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3">
                  File Size Distribution
                </h3>
                <TopBarChart items={filesizes} labelKey="filesize" maxItems={10} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Relationship Graph ─── */}
      {activeTab === 'graph' && graph && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search nodes by name, group, or description..."
              aria-label="Search graph nodes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
            />
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: selectedNode.color || '#666' }}
                    />
                    <span className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                      {selectedNode.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-micro font-mono uppercase bg-slate-800/40 text-slate-400">
                      {selectedNode.group}
                    </span>
                  </div>
                  {selectedNode.description && (
                    <p className="text-xs text-slate-400 leading-relaxed mt-2 max-w-3xl">{selectedNode.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-300 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Adjacent nodes */}
          {selectedNode && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <h3 className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Connected Nodes
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {graph.links
                  .filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
                  .map((l) => {
                    const connectedId = l.source === selectedNode.id ? l.target : l.source;
                    const node = graph.nodes.find((n) => n.id === connectedId);
                    if (!node) return null;
                    return (
                      <button
                        key={`${l.source}-${l.target}`}
                        type="button"
                        onClick={() => setSelectedNode(node)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/20 hover:bg-slate-700/30 transition-colors text-left"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: node.color || '#666' }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-slate-300 truncate">{node.name}</div>
                          <div className="text-micro font-mono text-slate-500 uppercase">{node.group}</div>
                        </div>
                      </button>
                    );
                  })}
              </div>
              {graph.links.filter((l) => l.source === selectedNode.id || l.target === selectedNode.id).length === 0 && (
                <p className="text-xs text-slate-500">No direct connections found.</p>
              )}
            </div>
          )}

          {/* Node browser */}
          <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
            <h3 className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {searchQuery ? `Search Results (${filteredNodes?.length ?? 0})` : 'All Nodes'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-96 overflow-y-auto">
              {(searchQuery && filteredNodes ? filteredNodes : graph.nodes).slice(0, 200).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNode(node)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left ${
                    selectedNode?.id === node.id ? 'bg-brand-500/15 ring-1 ring-brand-500/30' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color || '#666' }} />
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-300 truncate">{node.name}</div>
                    <div className="text-micro font-mono text-slate-500 uppercase">{node.group}</div>
                  </div>
                </button>
              ))}
              {searchQuery && filteredNodes && filteredNodes.length === 0 && (
                <p className="text-xs text-slate-500 col-span-full">No nodes match your search.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: File Analysis ─── */}
      {activeTab === 'files' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filetypes.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                  File Type Distribution
                </h3>
                <span className="text-micro font-mono text-slate-500">{filetypes.length} types</span>
              </div>
              <HorizontalStackedChart items={filetypes} labelKey="filetype" maxItems={15} />
              <div className="text-micro font-mono text-slate-500 mt-3">
                Total: {filetypes.reduce((s, i) => s + i.count, 0).toLocaleString()} samples
              </div>
            </div>
          )}
          {filesizes.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                  File Size Distribution
                </h3>
                <span className="text-micro font-mono text-slate-500">{filesizes.length} buckets</span>
              </div>
              <HorizontalStackedChart items={filesizes} labelKey="filesize" maxItems={10} />
            </div>
          )}
          {sections.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                  PE Section Distribution
                </h3>
                <span className="text-micro font-mono text-slate-500">{sections.length} sections</span>
              </div>
              <TopBarChart items={sections} labelKey="section" maxItems={15} />
            </div>
          )}
          {resources.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                  PE Resource Distribution
                </h3>
                <span className="text-micro font-mono text-slate-500">{resources.length} types</span>
              </div>
              <TopBarChart items={resources} labelKey="resource" maxItems={15} />
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: PE Metadata ─── */}
      {activeTab === 'imports' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {imports.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">Top DLL Imports</h3>
                <span className="text-micro font-mono text-slate-500">{imports.length} DLLs</span>
              </div>
              <TopBarChart items={imports} labelKey="import" maxItems={20} />
              <p className="text-micro font-mono text-slate-500 mt-3">
                KERNEL32, USER32, and ADVAPI32 dominate — standard Windows PE patterns.
              </p>
            </div>
          )}
          <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
            <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3">
              PE Analysis Summary
            </h3>
            <div className="space-y-2 text-xs font-mono text-slate-400">
              {filetypes.length > 0 && (
                <div className="flex justify-between">
                  <span>PE32 GUI samples</span>
                  <span className="tabular-nums">
                    {filetypes.find((f) => String(f.filetype).includes('GUI Intel'))?.count.toLocaleString() ?? '—'}
                  </span>
                </div>
              )}
              {sections.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>.text section present</span>
                    <span className="tabular-nums">
                      {sections.find((s) => s.section === '.text')?.count.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>.rsrc section present</span>
                    <span className="tabular-nums">
                      {sections.find((s) => s.section === '.rsrc')?.count.toLocaleString() ?? '—'}
                    </span>
                  </div>
                </>
              )}
              {certificates.length > 0 && (
                <div className="flex justify-between">
                  <span>Signed (Microsoft)</span>
                  <span className="tabular-nums">
                    {certificates.find((c) => String(c.certificate).includes('Microsoft'))?.count.toLocaleString() ??
                      '—'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: Certificates ─── */}
      {activeTab === 'certificates' && (
        <div className="space-y-4">
          {certificates.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                  Certificate Authority Distribution
                </h3>
                <span className="text-micro font-mono text-slate-500">{certificates.length} unique certs</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-500 border-b border-[rgb(var(--border-400))]">
                      <th className="text-left py-2 pr-4 font-medium">#</th>
                      <th className="text-left py-2 pr-4 font-medium">Organization</th>
                      <th className="text-left py-2 pr-4 font-medium">Issuer</th>
                      <th className="text-right py-2 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.slice(0, 30).map((c, idx) => {
                      const parts = String(c.certificate ?? '').split(' ');
                      const issuer = parts[0] === 'n/a' ? null : parts[0];
                      const org = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-[rgb(var(--border-400))]/50 hover:bg-slate-800/20 transition-colors"
                        >
                          <td className="py-1.5 pr-4 text-slate-500">{idx + 1}</td>
                          <td className="py-1.5 pr-4 text-slate-300">{org || '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-500">{issuer || '—'}</td>
                          <td className="py-1.5 text-right text-slate-300 tabular-nums">{c.count.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-micro font-mono text-slate-500 mt-3">
                {certificates[0] && String(certificates[0].certificate).startsWith('n/a')
                  ? `${(certificates[0]?.count ?? 0).toLocaleString()} samples are unsigned (no certificate).`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}
