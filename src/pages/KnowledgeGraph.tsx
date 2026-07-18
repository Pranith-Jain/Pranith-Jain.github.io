import { useState, useMemo } from 'react';
import { Search, RefreshCw, Network } from 'lucide-react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import type { GraphResponse } from './threatintel/relationship-graph-shared';

const RelationshipGraphCanvas = React.lazy(() => import('./threatintel/RelationshipGraphCanvas'));

import React from 'react';

export default function KnowledgeGraph() {
  const [seed, setSeed] = useState('');
  const [inputValue, setInputValue] = useState('');

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (seed) params.set('seed', seed);
    params.set('maxNodes', '80');
    return `/api/v1/knowledge-graph?${params}`;
  }, [seed]);

  const { data: graph, loading, refetch } = useDataFetch<GraphResponse>({ url, ttl: 60000 });

  const handleSearch = () => {
    setSeed(inputValue.trim());
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Network className="h-6 w-6" />}
      title="Knowledge Graph"
      description="Threat actor, CVE, and TTP relationship visualization."
      maxWidthClass="max-w-7xl"
      loading={loading}
      headerExtra={
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {graph && (
            <>
              <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
                {graph.nodes.length} nodes · {graph.edges.length} edges
              </span>
              {graph.truncated && (
                <span className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 font-mono text-amber-700 dark:text-amber-300">
                  truncated
                </span>
              )}
            </>
          )}
        </div>
      }
    >
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by actor, CVE, or technique…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            setSeed('');
            setInputValue('');
            refetch();
          }}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))]"
          title="Reset"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Graph canvas */}
      {graph && (
        <div className="surface-card overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}>
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm">
                Loading graph renderer…
              </div>
            }
          >
            <RelationshipGraphCanvas graphData={graph} onNodeClick={() => {}} />
          </React.Suspense>
        </div>
      )}

      {graph && (
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>{graph.nodes.length} nodes</span>
          <span>{graph.edges.length} edges</span>
          {graph.truncated && (
            <span className="text-amber-600 dark:text-amber-400">Truncated at {graph.nodes.length} nodes</span>
          )}
          {graph.seed !== 'all' && <span>Seed: {graph.seed}</span>}
        </div>
      )}
    </DataPageLayout>
  );
}
