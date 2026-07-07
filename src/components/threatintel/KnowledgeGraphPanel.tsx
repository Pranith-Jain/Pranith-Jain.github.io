import { useState, useCallback } from 'react';
import { RefreshCw, X, Network } from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
  label: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  confidence: string;
}

interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const NODE_COLORS: Record<string, string> = {
  actor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  campaign: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ttp: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  victim: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  infrastructure: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const EDGE_COLORS: Record<string, string> = {
  uses: 'text-orange-400',
  targets: 'text-rose-400',
  attributed_to: 'text-purple-400',
  communicates_with: 'text-cyan-400',
  employs: 'text-amber-400',
};

interface KnowledgeGraphPanelProps {
  actors?: string[];
  campaigns?: string[];
  ttps?: string[];
  context?: string;
  onClose: () => void;
}

export function KnowledgeGraphPanel({ actors, campaigns, ttps, context, onClose }: KnowledgeGraphPanelProps) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/knowledge-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actors, campaigns, ttps, context }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGraph(data.graph);
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actors, campaigns, ttps, context]);

  useState(() => {
    fetchGraph();
  });

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15">
            <Network size={16} className="text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Knowledge Graph</h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-500">Threat actor relationships</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
        {loading && !graph && (
          <div className="flex items-center gap-2 justify-center py-6">
            <RefreshCw size={14} className="animate-spin text-brand-400" />
            <span className="text-xs text-slate-400">Building knowledge graph…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}

        {graph && (
          <>
            <div className="text-micro font-mono text-slate-500">
              {graph.nodes.length} nodes · {graph.edges.length} relationships
            </div>

            {/* Nodes by type */}
            {['actor', 'campaign', 'ttp', 'victim', 'infrastructure'].map((type) => {
              const nodes = graph.nodes.filter((n) => n.type === type);
              if (!nodes.length) return null;
              return (
                <div key={type}>
                  <span className="text-micro font-mono uppercase text-slate-500 block mb-1">{type}s</span>
                  <div className="flex flex-wrap gap-1">
                    {nodes.map((n) => (
                      <span
                        key={n.id}
                        className={`text-micro font-mono px-2 py-0.5 rounded border ${NODE_COLORS[type] || 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}
                      >
                        {n.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Edges */}
            {graph.edges.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Relationships</span>
                <div className="space-y-1">
                  {graph.edges.slice(0, 15).map((e, i) => {
                    const src = graph.nodes.find((n) => n.id === e.source);
                    const tgt = graph.nodes.find((n) => n.id === e.target);
                    return (
                      <div key={i} className="flex items-center gap-1 text-xs">
                        <span className="text-slate-300">{src?.label || e.source}</span>
                        <span className={`font-mono ${EDGE_COLORS[e.relationship] || 'text-slate-500'}`}>
                          →{e.relationship.replace('_', ' ')}→
                        </span>
                        <span className="text-slate-300">{tgt?.label || e.target}</span>
                        <span className="text-micro text-slate-600 ml-auto">{e.confidence}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
