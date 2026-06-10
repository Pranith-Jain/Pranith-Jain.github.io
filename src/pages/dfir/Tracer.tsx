import { useCallback, useMemo, useState } from 'react';
import { Coins, Loader2, AlertTriangle, ExternalLink, Check, ArrowLeft, Crosshair } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import RelationshipGraphCanvas from '../../pages/threatintel/RelationshipGraphCanvas';
import type { GraphNodeData } from '../../pages/threatintel/relationship-graph-shared';
import {
  emptyGraph,
  mergeExpand,
  toGraphResponse,
  confirmEdge,
  findPathToCategory,
  type TracerGraph,
  type TracerNode,
  type TracerChain,
  type ExpandResponse,
  type CoInputCluster,
  serializeGraph,
  deserializeGraph,
} from '../../lib/dfir/tracer-graph';
import { buildDorkQueries, deriveOsintTargets, tier2Pivots } from '../../lib/dfir/osint-pivots';
import { toJSON, toCSV } from '../../lib/dfir/tracer-export';

const CHAINS: { id: TracerChain; label: string }[] = [
  { id: 'evm', label: 'EVM (ETH)' },
  { id: 'btc', label: 'Bitcoin' },
  { id: 'tron', label: 'Tron' },
];

interface CalldataResult {
  hash: string;
  analysis: {
    selector: string | null;
    known_method: string | null;
    input_size: number;
    flags: string[];
    embedded_pointers: { value: string; offset: number }[];
    verdict: string;
  };
  resolved_pointer?: { value: string; chain: string; found: boolean; input_excerpt: string };
}

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
  const [cluster, setCluster] = useState<CoInputCluster[] | null>(null);
  const [highlightPath, setHighlightPath] = useState<string[] | undefined>(undefined);
  const [calldata, setCalldata] = useState<CalldataResult | null>(null);
  const [calldataLoading, setCalldataLoading] = useState(false);
  const [unifiedResult, setUnifiedResult] = useState<string | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<{ alert_type: string; detail: string; detected_at: string }[] | null>(null);
  const [savedList, setSavedList] = useState<
    { id: string; title: string; seed_address: string; chain: string }[] | null
  >(null);

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
        setCluster(data.cluster ?? null);
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
    setHighlightPath(undefined);
    setCalldata(null);
    void expand(a, chain, fresh);
  }, [seed, chain, expand]);

  const inspectCalldata = useCallback(async (txHash: string, forChain: TracerChain) => {
    if (forChain === 'btc') return; // calldata is EVM/Tron only
    setCalldataLoading(true);
    setCalldata(null);
    try {
      const res = await fetch(`/api/v1/tracer/calldata?chain=${forChain}&hash=${encodeURIComponent(txHash)}`);
      if (res.ok) setCalldata((await res.json()) as CalldataResult);
    } finally {
      setCalldataLoading(false);
    }
  }, []);

  const graphData = useMemo(() => (graph ? toGraphResponse(graph) : null), [graph]);

  const runUnifiedSearch = useCallback(async (q: string) => {
    setUnifiedResult('searching…');
    try {
      const res = await fetch(`/api/v1/unified-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return setUnifiedResult('search unavailable');
      const data = (await res.json()) as { results?: unknown[]; total?: number };
      const n = data.total ?? data.results?.length ?? 0;
      setUnifiedResult(`${n} result${n === 1 ? '' : 's'} — open in Unified Search`);
    } catch {
      setUnifiedResult('search unavailable');
    }
  }, []);

  const resolveEns = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/v1/crypto-trace?address=${encodeURIComponent(address)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { context?: { ens_name?: string | null } };
      if (data.context?.ens_name) setEnsName(data.context.ens_name);
    } catch {
      /* ignore — Tier-1 unaffected */
    }
  }, []);

  const watchAddress = useCallback(async () => {
    if (!selected) return;
    const res = await fetch('/api/v1/crypto-monitor/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: selected.address,
        chain: selected.chain,
        alert_types: ['new_transfer', 'suspicious_counterparty'],
      }),
    });
    if (res.status === 401 || res.status === 403) setError('Watching requires an admin session.');
    else setError(res.ok ? null : `Watch failed (${res.status})`);
  }, [selected]);

  const loadAlerts = useCallback(async () => {
    if (!selected) return;
    const res = await fetch(
      `/api/v1/crypto-monitor/alerts?address=${encodeURIComponent(selected.address)}&chain=${selected.chain}`
    );
    if (res.status === 401 || res.status === 403) return setError('Alerts require an admin session.');
    if (res.ok) setAlerts(((await res.json()) as { alerts: typeof alerts }).alerts);
  }, [selected]);

  const onNodeClick = useCallback(
    (node: GraphNodeData | null) => {
      if (!node || !graph) return setSelected(null);
      const tn = graph.nodes.get(node.id) ?? null;
      setSelected(tn);
      setUnifiedResult(null);
      setEnsName(null);
      setAlerts(null);
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

  const download = useCallback((filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const saveTrace = useCallback(async () => {
    if (!graph) return;
    const title = window.prompt('Save trace as:', `${chain}:${seed.slice(0, 10)}`);
    if (!title) return;
    const res = await fetch('/api/v1/tracer/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        seed_address: graph.nodes.get(graph.seedId)?.address ?? seed,
        chain,
        graph_json: JSON.stringify(serializeGraph(graph)),
      }),
    });
    if (res.status === 401 || res.status === 403) setError('Saving requires an admin session.');
    else if (!res.ok) setError(`Save failed (${res.status})`);
    else setError(null);
  }, [graph, chain, seed]);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/v1/tracer/graphs');
    if (res.status === 401 || res.status === 403) return setError('Saved traces require an admin session.');
    if (res.ok) setSavedList(((await res.json()) as { graphs: typeof savedList }).graphs);
  }, [savedList]);

  const loadTrace = useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/tracer/graphs/${id}`);
    if (!res.ok) return setError('Could not load that trace.');
    const row = (await res.json()) as { graph_json: string; seed_address: string; chain: TracerChain };
    try {
      setGraph(deserializeGraph(JSON.parse(row.graph_json)));
      setSeed(row.seed_address);
      setChain(row.chain);
      setSelected(null);
    } catch {
      setError('Saved trace is corrupted.');
    }
  }, []);

  const exportTrace = useCallback(
    async (fmt: 'json' | 'csv' | 'png') => {
      if (!graph) return;
      const base = `tracer-${chain}-${(graph.nodes.get(graph.seedId)?.address ?? 'trace').slice(0, 10)}`;
      if (fmt === 'json') return download(`${base}.json`, toJSON(graph), 'application/json');
      if (fmt === 'csv') return download(`${base}.csv`, toCSV(graph), 'text/csv');
      try {
        const { toPng } = await import('html-to-image');
        const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
        const flow = document.querySelector('.react-flow') as HTMLElement | null;
        const target = vp ?? flow;
        if (!target) return setError('Canvas not ready for export.');
        const dataUrl = await toPng(target, { backgroundColor: '#0b0f1a', pixelRatio: 2 });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${base}.png`;
        a.click();
      } catch {
        setError('PNG export failed — JSON/CSV still work.');
      }
    },
    [graph, chain, download]
  );

  const pinToInvestigation = useCallback(async (value: string, type: 'crypto-address' | 'tx-hash') => {
    const listRes = await fetch('/api/v1/investigations');
    if (listRes.status === 401 || listRes.status === 403) return setError('Pinning requires an admin session.');
    if (!listRes.ok) return setError('Could not load investigations.');
    const { investigations } = (await listRes.json()) as { investigations: { id: string; title: string }[] };
    if (!investigations?.length) return setError('No investigations exist yet — create one in the workspace first.');
    const choice = window.prompt(
      `Pin to which investigation?\n${investigations.map((i, n) => `${n + 1}. ${i.title}`).join('\n')}`,
      '1'
    );
    const inv = investigations[choice ? Number(choice) - 1 : -1];
    if (!inv) return;
    const res = await fetch(`/api/v1/investigations/${inv.id}/observables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, type }),
    });
    setError(res.ok ? null : `Pin failed (${res.status})`);
  }, []);

  const findCashOut = useCallback(() => {
    if (!graph) return;
    const path = findPathToCategory(graph, ['exchange', 'mixer']);
    setHighlightPath(path ?? undefined);
    if (!path) setError('No cash-out (CEX/Mixer) path in the loaded graph — expand further.');
  }, [graph]);

  const incidentEdges = useMemo(
    () =>
      graph && selected
        ? [...graph.edges.values()].filter((e) => e.source === selected.id || e.target === selected.id).slice(0, 6)
        : [],
    [graph, selected]
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
          <button
            className="flex w-full items-center justify-center gap-2 rounded border border-amber-600 p-2 text-xs text-amber-300 hover:bg-amber-950 disabled:opacity-40"
            disabled={!graph}
            onClick={findCashOut}
          >
            <Crosshair className="h-3 w-3" /> Find cash-out (CEX/Mixer)
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800 disabled:opacity-40"
              disabled={!graph}
              onClick={saveTrace}
            >
              Save trace
            </button>
            <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800" onClick={loadList}>
              Load…
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40"
              disabled={!graph}
              onClick={() => void exportTrace('json')}
            >
              JSON
            </button>
            <button
              className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40"
              disabled={!graph}
              onClick={() => void exportTrace('csv')}
            >
              CSV
            </button>
            <button
              className="rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800 disabled:opacity-40"
              disabled={!graph}
              onClick={() => void exportTrace('png')}
            >
              PNG
            </button>
          </div>
          {savedList ? (
            <div className="rounded border border-gray-700 p-2 text-xs">
              <span className="text-gray-400">Saved traces</span>
              {savedList.length ? (
                <ul className="mt-1 space-y-1">
                  {savedList.map((sv) => (
                    <li key={sv.id}>
                      <button
                        className="w-full truncate text-left hover:text-blue-400"
                        onClick={() => void loadTrace(sv.id)}
                      >
                        {sv.title} <span className="text-gray-500">({sv.chain})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">none yet</p>
              )}
            </div>
          ) : null}
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
              highlightedPath={highlightPath}
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
                <button
                  className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800"
                  onClick={() => void pinToInvestigation(selected.address, 'crypto-address')}
                >
                  Pin to investigation
                </button>
              </div>

              {/* Transactions → calldata inspector */}
              {incidentEdges.length ? (
                <div className="border-t border-gray-700 pt-2">
                  <span className="text-gray-400">Transactions</span>
                  <ul className="mt-1 space-y-1">
                    {incidentEdges.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] text-gray-400">{e.tx_hash.slice(0, 14)}…</span>
                        <button
                          className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800 disabled:opacity-40"
                          disabled={selected.chain === 'btc' || calldataLoading}
                          onClick={() => void inspectCalldata(e.tx_hash, selected.chain)}
                        >
                          Inspect calldata
                        </button>
                        <button
                          className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
                          onClick={() => void pinToInvestigation(e.tx_hash, 'tx-hash')}
                        >
                          pin
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {calldataLoading ? <p className="text-xs text-gray-500">Analyzing calldata…</p> : null}
              {calldata ? (
                <div className="rounded border border-gray-700 p-2 text-xs">
                  <div>
                    Verdict:{' '}
                    <span
                      className={
                        calldata.analysis.verdict === 'data-hiding'
                          ? 'font-semibold text-red-400'
                          : calldata.analysis.verdict === 'suspicious'
                            ? 'font-semibold text-amber-400'
                            : 'text-emerald-400'
                      }
                    >
                      {calldata.analysis.verdict}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    {calldata.analysis.known_method ?? calldata.analysis.selector ?? 'no selector'} ·{' '}
                    {calldata.analysis.input_size}B
                  </div>
                  {calldata.analysis.flags.length ? (
                    <ul className="list-inside list-disc text-gray-400">
                      {calldata.analysis.flags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  ) : null}
                  {calldata.resolved_pointer ? (
                    <div className="mt-1 border-t border-gray-700 pt-1">
                      Cross-chain pointer →{' '}
                      {calldata.resolved_pointer.found ? `${calldata.resolved_pointer.chain} (resolved)` : 'unresolved'}
                      <div className="break-all font-mono text-[10px] text-gray-500">
                        {calldata.resolved_pointer.value}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* BTC common-input cluster */}
              {cluster && cluster.length ? (
                <div className="border-t border-gray-700 pt-2">
                  <span className="text-gray-400">Likely same-owner (common-input)</span>
                  <ul className="mt-1 space-y-1">
                    {cluster.slice(0, 8).map((c) => (
                      <li key={c.address} className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px]">{c.address}</span>
                        <button
                          className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
                          onClick={() => setSeed(c.address)}
                        >
                          seed
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* OSINT pivots (Phase D) */}
              <div className="border-t border-gray-700 pt-2">
                <span className="text-gray-400">OSINT pivots</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {buildDorkQueries(selected.address).map((d) => (
                    <a
                      key={d.label}
                      href={d.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
                    >
                      {d.label}
                    </a>
                  ))}
                </div>
                <button
                  className="mt-1 w-full rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800"
                  onClick={() => void runUnifiedSearch(selected.address)}
                >
                  Run unified search
                </button>
                {unifiedResult ? <p className="mt-1 text-[10px] text-gray-400">{unifiedResult}</p> : null}
                {selected.chain === 'evm' && !selected.label && !ensName ? (
                  <button
                    className="mt-1 w-full rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800"
                    onClick={() => void resolveEns(selected.address)}
                  >
                    Resolve ENS
                  </button>
                ) : null}
                {(() => {
                  const targets = deriveOsintTargets(selected.label, ensName);
                  const links = tier2Pivots(targets);
                  return links.length ? (
                    <div className="mt-1">
                      <span className="text-gray-500">
                        Identity pivots ({targets.ens ?? targets.domains[0] ?? targets.usernames[0]})
                      </span>
                      <ul className="mt-1 space-y-1">
                        {links.map((l) => (
                          <li key={l.label}>
                            <a
                              className="text-[10px] text-blue-400 hover:underline"
                              href={l.apiPath}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {l.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Monitoring (Phase E) */}
              <div className="border-t border-gray-700 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800"
                    onClick={watchAddress}
                  >
                    Watch address
                  </button>
                  <button className="rounded border border-gray-600 p-2 text-xs hover:bg-gray-800" onClick={loadAlerts}>
                    Load alerts
                  </button>
                </div>
                {alerts ? (
                  alerts.length ? (
                    <ul className="mt-1 space-y-1 text-[10px]">
                      {alerts.slice(0, 8).map((al, i) => (
                        <li key={i} className="text-gray-400">
                          <span className="font-semibold text-amber-400">{al.alert_type}</span> ·{' '}
                          {al.detected_at.slice(0, 16)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[10px] text-gray-500">no alerts yet</p>
                  )
                ) : null}
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
