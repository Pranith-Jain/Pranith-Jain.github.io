import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Loader2, FileSearch } from 'lucide-react';
import { streamIoc } from '../../lib/dfir/api';
import { detectType } from '../../lib/dfir/indicator-client';
import type { ProviderResultWire, DoneEvent } from '../../lib/dfir/types';

/**
 * IOC Pivot Graph — enrich one indicator across the 26-source checker
 * (reuses /api/v1/ioc/check SSE), then render a radial relationship graph:
 * indicator → sources (verdict-coloured) → derived pivot indicators
 * (IPs / domains / hashes / ASNs / CVEs found in the evidence). Every
 * pivot node is clickable to re-centre the graph on it — the core CTI
 * pivoting workflow. Nothing is stored; analysis is per-request.
 */

const VERDICT_COLOR: Record<string, string> = {
  malicious: '#e11d48', // rose-600
  suspicious: '#d97706', // amber-600
  clean: '#059669', // emerald-600
  unknown: '#64748b', // slate-500
};

// Pivot extraction over result tags + stringy raw_summary values.
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const RE_DOMAIN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
const RE_HASH = /\b[a-f0-9]{64}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{32}\b/gi;
const RE_ASN = /\bAS\d{2,6}\b/gi;
const RE_CVE = /\bCVE-\d{4}-\d{4,7}\b/gi;
const refang = (s: string) =>
  s
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .replace(/\[dot\]/gi, '.')
    .replace(/h(?:xx|tt)ps?:\/\//gi, '');

interface Pivot {
  value: string;
  kind: 'ipv4' | 'domain' | 'hash' | 'asn' | 'cve';
}

function extractPivots(results: ProviderResultWire[], center: string): Pivot[] {
  const c = center.toLowerCase();
  const seen = new Set<string>();
  const out: Pivot[] = [];
  const add = (value: string, kind: Pivot['kind']) => {
    const v = value.trim();
    const key = `${kind}:${v.toLowerCase()}`;
    if (!v || v.toLowerCase() === c || seen.has(key)) return;
    seen.add(key);
    out.push({ value: v, kind });
  };
  for (const r of results) {
    const blobs = [
      ...r.tags,
      ...Object.values(r.raw_summary)
        .filter((v) => typeof v === 'string')
        .map((v) => v as string),
    ];
    for (const raw of blobs) {
      const b = refang(raw);
      for (const m of b.match(RE_CVE) ?? []) add(m.toUpperCase(), 'cve');
      for (const m of b.match(RE_ASN) ?? []) add(m.toUpperCase(), 'asn');
      for (const m of b.match(RE_HASH) ?? []) add(m.toLowerCase(), 'hash');
      for (const m of b.match(RE_IPV4) ?? []) if (!/^0\.|^255\.|\.0$/.test(m)) add(m, 'ipv4');
      for (const m of b.match(RE_DOMAIN) ?? [])
        if (!/\.(png|jpg|svg|css|js|json|html?)$/i.test(m)) add(m.toLowerCase(), 'domain');
    }
  }
  return out.slice(0, 28);
}

const PIVOT_FILL: Record<Pivot['kind'], string> = {
  ipv4: '#0ea5e9',
  domain: '#8b5cf6',
  hash: '#0d9488',
  asn: '#f59e0b',
  cve: '#e11d48',
};

export default function IocPivot(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');
  const [active, setActive] = useState(params.get('q')?.trim() ?? '');
  const [results, setResults] = useState<ProviderResultWire[]>([]);
  const [summary, setSummary] = useState<DoneEvent | null>(null);
  const [streaming, setStreaming] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    setResults([]);
    setSummary(null);
    setStreaming(true);
    stopRef.current?.();
    const stop = streamIoc(active, {
      onMeta: () => {},
      onResult: (r) => setResults((p) => [...p, r]),
      onDone: (s) => {
        setSummary(s);
        setStreaming(false);
      },
      onError: () => setStreaming(false),
    });
    stopRef.current = stop;
    return () => stop();
  }, [active]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setParams({ q: v }, { replace: false });
    setActive(v);
  };
  const pivotTo = (v: string) => {
    // Ignore pivot clicks while the previous stream is still open — two
    // concurrent EventSources would race their results into the same state.
    // The submit button is already disabled during `streaming`, but the
    // graph node clicks aren't, so they need their own guard.
    if (streaming) return;
    setInput(v);
    setParams({ q: v }, { replace: false });
    setActive(v);
  };

  const centerType = active ? detectType(active) : 'unknown';
  // Sources that actually returned a signal (drop pure unknown/no-data noise).
  const sources = results.filter((r) => r.verdict !== 'unknown' || r.score > 0);
  const pivots = extractPivots(results, active);

  function pipeToExtractor() {
    const text = [active, ...pivots.map((p) => p.value)].join('\n');
    sessionStorage.setItem('ioc-extractor-pipe', text);
    navigate('/dfir/extract?from=pivot');
  }

  // Radial layout.
  const W = 820;
  const cx = W / 2;
  const cy = W / 2;
  const r1 = 190; // sources ring
  const r2 = 350; // pivots ring
  const pt = (radius: number, i: number, n: number) => {
    const a = (i / Math.max(1, n)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">IOC Pivot Graph</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl">
          Enrich an indicator across 26 sources and graph what it touches — verdict-coloured sources plus derived IPs /
          domains / hashes / ASNs / CVEs. Click any derived node to re-centre the graph on it. Nothing is stored.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-wrap gap-2 mb-6">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="IP · domain · URL · file hash"
            aria-label="Indicator"
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          {streaming && <Loader2 size={14} className="animate-spin" />}
          {streaming ? 'enriching…' : 'pivot'}
        </button>
      </form>

      {active && (
        <>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 mb-4">
            <svg viewBox={`0 0 ${W} ${W}`} className="w-full h-auto" role="img" aria-label="IOC pivot graph">
              {/* edges: centre → sources */}
              {sources.map((s, i) => {
                const p = pt(r1, i, sources.length);
                return (
                  <line
                    key={`es-${s.source}`}
                    x1={cx}
                    y1={cy}
                    x2={p.x}
                    y2={p.y}
                    stroke={VERDICT_COLOR[s.verdict] ?? VERDICT_COLOR.unknown}
                    strokeOpacity="0.35"
                    strokeWidth="1.5"
                  />
                );
              })}
              {/* edges: centre → pivots */}
              {pivots.map((pv, i) => {
                const p = pt(r2, i, pivots.length);
                return (
                  <line
                    key={`ep-${pv.kind}-${pv.value}`}
                    x1={cx}
                    y1={cy}
                    x2={p.x}
                    y2={p.y}
                    stroke="#94a3b8"
                    strokeOpacity="0.18"
                    strokeWidth="1"
                  />
                );
              })}
              {/* pivot nodes (clickable) */}
              {pivots.map((pv, i) => {
                const p = pt(r2, i, pivots.length);
                return (
                  <g key={`pn-${pv.kind}-${pv.value}`} className="cursor-pointer" onClick={() => pivotTo(pv.value)}>
                    <circle cx={p.x} cy={p.y} r="7" fill={PIVOT_FILL[pv.kind]} />
                    <text
                      x={p.x}
                      y={p.y - 12}
                      textAnchor="middle"
                      className="fill-slate-600 dark:fill-slate-300"
                      fontSize="12"
                      fontFamily="monospace"
                    >
                      {pv.value.length > 28 ? pv.value.slice(0, 26) + '…' : pv.value}
                    </text>
                  </g>
                );
              })}
              {/* source nodes */}
              {sources.map((s, i) => {
                const p = pt(r1, i, sources.length);
                return (
                  <g key={`sn-${s.source}`}>
                    <circle cx={p.x} cy={p.y} r="9" fill={VERDICT_COLOR[s.verdict] ?? VERDICT_COLOR.unknown} />
                    <text
                      x={p.x}
                      y={p.y + 24}
                      textAnchor="middle"
                      className="fill-slate-500"
                      fontSize="11"
                      fontFamily="monospace"
                    >
                      {s.source}
                    </text>
                  </g>
                );
              })}
              {/* centre */}
              <circle cx={cx} cy={cy} r="16" className="fill-brand-600 dark:fill-brand-500" />
              <text
                x={cx}
                y={cy + 38}
                textAnchor="middle"
                className="fill-slate-900 dark:fill-slate-100"
                fontSize="14"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {active.length > 34 ? active.slice(0, 32) + '…' : active}
              </text>
              <text
                x={cx}
                y={cy + 56}
                textAnchor="middle"
                className="fill-slate-500"
                fontSize="11"
                fontFamily="monospace"
              >
                {centerType}
              </text>
            </svg>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500 px-2 pb-1">
              <span>
                <span style={{ color: VERDICT_COLOR.malicious }}>●</span> malicious
              </span>
              <span>
                <span style={{ color: VERDICT_COLOR.suspicious }}>●</span> suspicious
              </span>
              <span>
                <span style={{ color: VERDICT_COLOR.clean }}>●</span> clean
              </span>
              <span className="ml-auto">
                {sources.length} sources · {pivots.length} pivots
                {streaming ? ' · streaming…' : summary ? ` · verdict ${summary.verdict}` : ''}
              </span>
            </div>
          </div>

          {pivots.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  Pivot indicators ({pivots.length})
                </h3>
                <button
                  type="button"
                  onClick={pipeToExtractor}
                  className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                >
                  <FileSearch size={11} /> Extract IOCs →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pivots.map((pv) => (
                  <button
                    key={`pl-${pv.kind}-${pv.value}`}
                    type="button"
                    onClick={() => pivotTo(pv.value)}
                    title={`Pivot to ${pv.value}`}
                    className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    <span style={{ color: PIVOT_FILL[pv.kind] }}>●</span> {pv.value}{' '}
                    <span className="text-slate-400">{pv.kind}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
