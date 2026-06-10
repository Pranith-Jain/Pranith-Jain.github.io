import { useCallback, useMemo, useState } from 'react';
import { Coins, Loader2, AlertTriangle, ExternalLink, Check, ArrowLeft } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import RelationshipGraphCanvas from '../../pages/threatintel/RelationshipGraphCanvas';
import type { GraphNodeData } from '../../pages/threatintel/relationship-graph-shared';
import {
  emptyGraph,
  mergeExpand,
  toGraphResponse,
  confirmEdge,
  type TracerGraph,
  type TracerNode,
  type TracerChain,
  type ExpandResponse,
} from '../../lib/dfir/tracer-graph';

const CHAINS: { id: TracerChain; label: string }[] = [
  { id: 'evm', label: 'EVM (ETH)' },
  { id: 'btc', label: 'Bitcoin' },
  { id: 'tron', label: 'Tron' },
];

export default function Tracer(): JSX.Element {
  const [seed, setSeed] = useState('');
  const [chain, setChain] = useState<TracerChain>('evm');
  const [direction, setDirection] = useState<'in' | 'out' | 'both'>('both');
  const [around, setAround] = useState('');
  const [toleranceMin, setToleranceMin] = useState('');
  const [token, setToken] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [graph, setGraph] = useState<TracerGraph | null>(null);
  const [selected, setSelected] = useState<TracerNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const expand = useCallback(
    async (address: string, forChain: TracerChain, base: TracerGraph | null) => {
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { address, chain: forChain, direction };
        if (around && toleranceMin) {
          body.around = new Date(around).toISOString();
          body.toleranceMin = Number(toleranceMin);
        }
        if (token) body.token = token;
        if (minAmount) body.minAmount = Number(minAmount);
        const res = await fetch('/api/v1/tracer/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError(`Expand failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as ExpandResponse;
        setWarning(data.warning ?? null);
        setGraph((prev) => mergeExpand(prev ?? base ?? emptyGraph(data.root.id), data));
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    },
    [direction, around, toleranceMin, token, minAmount]
  );

  const onSeed = useCallback(() => {
    const a = seed.trim();
    if (!a) return;
    const fresh = emptyGraph(`${chain}:${a}`);
    setGraph(fresh);
    setSelected(null);
    void expand(a, chain, fresh);
  }, [seed, chain, expand]);

  const graphData = useMemo(() => (graph ? toGraphResponse(graph) : null), [graph]);

  const onNodeClick = useCallback(
    (node: GraphNodeData | null) => {
      if (!node || !graph) return setSelected(null);
      const tn = graph.nodes.get(node.id) ?? null;
      setSelected(tn);
    },
    [graph]
  );

  const onExpandNode = useCallback(
    (node: GraphNodeData) => {
      const tn = graph?.nodes.get(node.id);
      if (tn) void expand(tn.address, tn.chain, graph);
    },
    [graph, expand]
  );

  const confirmHopsTo = useCallback(
    (nodeId: string) => {
      if (!graph) return;
      let g = graph;
      for (const e of graph.edges.values()) {
        if (e.source === nodeId || e.target === nodeId) g = confirmEdge(g, e.id);
      }
      setGraph(g);
    },
    [graph]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <BackLink to="/dfir" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-blue-400">
        <ArrowLeft size={14} /> DFIR Toolkit
      </BackLink>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Coins className="h-6 w-6" /> Fund-Flow Tracer
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Seed an address, then click a node to expand the next hop. Edges are <strong>candidates</strong> until you
        confirm them.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_300px]">
        {/* Control rail */}
        <div className="space-y-3 rounded-lg border border-gray-700 p-3 text-sm">
          <label className="block">
            <span className="text-gray-400">Chain</span>
            <select
              className="mt-1 w-full rounded bg-gray-800 p-2"
              value={chain}
              onChange={(e) => setChain(e.target.value as TracerChain)}
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-400">Seed address</span>
            <input
              className="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-xs"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="0x… / bc1… / T…"
            />
          </label>
          <label className="block">
            <span className="text-gray-400">Direction</span>
            <select
              className="mt-1 w-full rounded bg-gray-800 p-2"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'in' | 'out' | 'both')}
            >
              <option value="both">Both</option>
              <option value="out">Outgoing</option>
              <option value="in">Incoming</option>
            </select>
          </label>
          <div className="border-t border-gray-700 pt-2">
            <span className="text-gray-400">Time tolerance (optional)</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded bg-gray-800 p-2 text-xs"
              value={around}
              onChange={(e) => setAround(e.target.value)}
            />
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded bg-gray-800 p-2 text-xs"
              value={toleranceMin}
              onChange={(e) => setToleranceMin(e.target.value)}
              placeholder="± minutes"
            />
          </div>
          <input
            className="w-full rounded bg-gray-800 p-2 text-xs"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token symbol filter (e.g. USDT)"
          />
          <input
            type="number"
            className="w-full rounded bg-gray-800 p-2 text-xs"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min amount"
          />
          <button
            className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 p-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            onClick={onSeed}
            disabled={loading || !seed.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Trace
          </button>
          {error ? (
            <p className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" /> {error}
            </p>
          ) : null}
          {warning ? <p className="text-xs text-amber-400">{warning}</p> : null}
        </div>

        {/* Canvas */}
        <div className="min-h-[560px] rounded-lg border border-gray-700">
          {graphData ? (
            <RelationshipGraphCanvas
              graphData={graphData}
              onNodeClick={onNodeClick}
              onExpandNode={onExpandNode}
              layoutMode="force"
            />
          ) : (
            <div className="flex h-[560px] items-center justify-center text-gray-500">Seed an address to begin.</div>
          )}
        </div>

        {/* Detail panel */}
        <div className="space-y-3 rounded-lg border border-gray-700 p-3 text-sm">
          {selected ? (
            <>
              <div className="break-all font-mono text-xs">{selected.address}</div>
              <div>
                <span className="text-gray-400">Label: </span>
                {selected.label ?? '—'} <span className="text-gray-500">({selected.category})</span>
              </div>
              <div>
                <span className="text-gray-400">Risk: </span>
                <span className="font-semibold uppercase">{selected.risk.level}</span> ({selected.risk.score})
              </div>
              {selected.risk.signals.length ? (
                <ul className="list-inside list-disc text-xs text-gray-400">
                  {selected.risk.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  className="rounded bg-blue-600 p-2 text-xs hover:bg-blue-500"
                  onClick={() => void expand(selected.address, selected.chain, graph)}
                >
                  Expand this node
                </button>
                <button
                  className="flex items-center justify-center gap-1 rounded bg-emerald-700 p-2 text-xs hover:bg-emerald-600"
                  onClick={() => confirmHopsTo(selected.id)}
                >
                  <Check className="h-3 w-3" /> Confirm hops
                </button>
                <a
                  className="flex items-center justify-center gap-1 rounded border border-gray-600 p-2 text-xs hover:bg-gray-800"
                  href={selected.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3 w-3" /> Open explorer
                </a>
              </div>
            </>
          ) : (
            <p className="text-gray-500">Click a node to inspect it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
