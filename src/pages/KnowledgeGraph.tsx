import { useState, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useDataFetch } from '../hooks/useDataFetch';
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
    <div className="min-h-screen [background:rgb(var(--surface-100))] text-slate-100 dark:text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 bg-brand-500 rounded" />
            <div>
              <h1 className="text-lg font-bold tracking-wider text-slate-100 dark:text-white">KNOWLEDGE GRAPH</h1>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-muted">
                THREAT ACTOR · CVE · TTP RELATIONSHIPS
              </p>
            </div>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Filter by actor, CVE, or technique..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-[rgb(var(--hover-100))] border border-[rgb(var(--border-400))] text-slate-200 placeholder:text-muted focus:outline-none focus:border-brand-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
          <button
            onClick={() => {
              setSeed('');
              setInputValue('');
              refetch();
            }}
            className="p-2 text-muted hover:text-slate-300 transition-colors"
            title="Reset"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="surface-card p-8 text-center">
            <div className="w-8 h-8 border-2 border-[rgb(var(--border-500))] border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted text-sm">Building knowledge graph...</p>
          </div>
        )}

        {graph && !loading && (
          <div className="surface-card overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  Loading graph renderer...
                </div>
              }
            >
              <RelationshipGraphCanvas graphData={graph} onNodeClick={() => {}} />
            </React.Suspense>
          </div>
        )}

        {graph && !loading && (
          <div className="flex items-center gap-4 mt-3 text-xs text-muted">
            <span>{graph.nodes.length} nodes</span>
            <span>{graph.edges.length} edges</span>
            {graph.truncated && <span className="text-yellow-400">Truncated at {graph.nodes.length} nodes</span>}
            {graph.seed !== 'all' && <span>Seed: {graph.seed}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
