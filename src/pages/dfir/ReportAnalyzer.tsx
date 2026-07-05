import { useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import {
  Link2,
  RefreshCw,
  FileText,
  Search,
  ExternalLink,
  AlertTriangle,
  Network,
  Bug,
  Users,
  Diamond,
  GitBranch,
  Globe2,
  Download,
  Shield,
  CheckCircle,
  Terminal,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

// ── Response types (mirrors api/src/lib/report-analyzer.ts) ──────────

type IocKind = 'ip' | 'ipv6' | 'url' | 'domain' | 'hash' | 'cve' | 'email';
interface ExtractedIoc {
  value: string;
  kind: IocKind;
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  evidence: string;
  source: 'report-text' | 'image-ocr';
}
interface TtpHit {
  id: string;
  name: string;
  tactic: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}
interface ExtractedCve {
  id: string;
  context: string;
}
interface FiveW {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  attribution_basis?: string;
  confidence: number;
}
interface MindmapNode {
  id: string;
  label: string;
  kind: 'actor' | 'malware' | 'ttp' | 'ioc' | 'cve' | 'finding';
}
interface MindmapEdge {
  source: string;
  target: string;
  label: string;
}

/** Diamond Model — 4-axis view of an intrusion. */
interface DiamondModel {
  adversary: string[];
  capability: { id: string; name: string; tactic: string; evidence: string }[];
  infrastructure: string[];
  victim: { sector: string; geography: string; asset: string };
}

/** Attack Flow — kill-chain phases, each holding the TTPs observed in that phase. */
interface AttackFlowPhase {
  phase: string;
  techniques: { id: string; name: string; evidence: string }[];
}

interface AnalyzerOutput {
  title: string;
  source?: string;
  sourceText: string;
  textLength: number;
  generatedAt: string;
  summary: { text: string; model: string } | null;
  fiveW: FiveW | null;
  iocs: ExtractedIoc[];
  ttp: TtpHit[];
  cves: ExtractedCve[];
  mindmap: { nodes: MindmapNode[]; edges: MindmapEdge[] };
  diamond: DiamondModel | null;
  attackFlow: AttackFlowPhase[];
  detection: {
    siemRules: {
      title: string;
      description: string;
      severity: string;
      mitreId?: string;
      query?: string;
      platform?: string;
    }[];
    monitoringGuidance: { category: string; items: string[] }[];
    cliCommands: { purpose: string; command: string; platform?: string }[];
    detectionLimitations: string[];
    model?: string;
  } | null;
  conclusion: {
    keyTakeaways: string[];
    recommendedActions: { priority: string; action: string; rationale?: string }[];
    riskAssessment: string;
    model?: string;
  } | null;
  stix: { bundle: { type: string; id: string; objects: unknown[] }; view: unknown } | null;
  errors: { branch: string; message: string }[];
  elapsed_ms: number;
}

// ── Mindmap renderer (light-mode + dark: tokens, in-page xyflow) ─────

const NODE_STYLES: Record<MindmapNode['kind'], { light: string; dark: string; ring: string }> = {
  finding: {
    light: 'border-slate-400 bg-slate-50 text-slate-900',
    dark: 'dark:border-slate-500 dark:bg-[rgb(var(--surface-200))] dark:text-slate-100',
    ring: '#64748b',
  },
  actor: {
    light: 'border-rose-300 bg-rose-50 text-rose-900',
    dark: 'dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100',
    ring: '#e11d48',
  },
  malware: {
    light: 'border-orange-300 bg-orange-50 text-orange-900',
    dark: 'dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-100',
    ring: '#ea580c',
  },
  ttp: {
    light: 'border-violet-300 bg-violet-50 text-violet-900',
    dark: 'dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100',
    ring: '#7c3aed',
  },
  ioc: {
    light: 'border-sky-300 bg-sky-50 text-sky-900',
    dark: 'dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100',
    ring: '#0284c7',
  },
  cve: {
    light: 'border-amber-300 bg-amber-50 text-amber-900',
    dark: 'dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100',
    ring: '#d97706',
  },
};

function MindmapNode({ data }: { data: { label: string; kind: MindmapNode['kind']; subtitle?: string } }) {
  const s = NODE_STYLES[data.kind] ?? NODE_STYLES.finding;
  return (
    <div
      className={`rounded-lg border-2 px-2.5 py-1.5 text-xs font-mono shadow-sm bg-white ${s.light} ${s.dark}`}
      style={{ minWidth: 100, maxWidth: 220 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: s.ring, width: 6, height: 6 }} />
      <div className="font-semibold leading-tight">{data.label}</div>
      {data.subtitle && <div className="text-[10px] opacity-70 mt-0.5">{data.subtitle}</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: s.ring, width: 6, height: 6 }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { mindmap: MindmapNode };

function layoutNodes(rawNodes: MindmapNode[], rawEdges: MindmapEdge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of rawNodes) g.setNode(n.id, { width: 180, height: 36 });
  for (const e of rawEdges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const nodes: Node[] = rawNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'mindmap',
      position: { x: pos.x - 90, y: pos.y - 18 },
      data: { label: n.label, kind: n.kind, subtitle: n.kind === 'ttp' ? '' : n.kind },
    };
  });
  const edges: Edge[] = rawEdges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fontFamily: 'monospace' },
  }));
  return { nodes, edges };
}

// ── Page ──────────────────────────────────────────────────────────────

const TABS = [
  'summary',
  'detection',
  'conclusion',
  'iocs',
  'ttps',
  'cves',
  '5w',
  'diamond',
  'attackflow',
  'heatmap',
  'mindmap',
  'stix',
  'source',
] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  summary: { label: 'Summary', icon: <FileText className="h-3.5 w-3.5" /> },
  detection: { label: 'Detection', icon: <Shield className="h-3.5 w-3.5" /> },
  conclusion: { label: 'Conclusion', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  iocs: { label: 'IOCs', icon: <Link2 className="h-3.5 w-3.5" /> },
  ttps: { label: 'TTPs', icon: <Bug className="h-3.5 w-3.5" /> },
  cves: { label: 'CVEs', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  '5w': { label: '5W', icon: <Users className="h-3.5 w-3.5" /> },
  mindmap: { label: 'Mindmap', icon: <Network className="h-3.5 w-3.5" /> },
  stix: { label: 'STIX', icon: <Globe2 className="h-3.5 w-3.5" /> },
  diamond: { label: 'Diamond', icon: <Diamond className="h-3.5 w-3.5" /> },
  attackflow: { label: 'Attack Flow', icon: <GitBranch className="h-3.5 w-3.5" /> },
  heatmap: { label: 'ATT&CK Heatmap', icon: <Search className="h-3.5 w-3.5" /> },
  source: { label: 'Source', icon: <Terminal className="h-3.5 w-3.5" /> },
};

const IOC_PILL: Record<IocKind, string> = {
  ip: 'text-sky-700 dark:text-sky-300 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800',
  ipv6: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800',
  url: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800',
  domain: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  hash: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  cve: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  email: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
};
const CONFIDENCE_PILL: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  medium: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  low: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
};

/**
 * Report Analyzer — paste a URL or text, get a unified per-report
 * analysis: AI summary, IOCs (with allowlist filtering + confidence),
 * MITRE ATT&CK TTPs (LLM + keyword merged), CVEs, 5W context, an
 * auto-generated mindmap, and a STIX 2.1 bundle.
 *
 * Single round-trip to /api/v1/report-analyzer, which fans out the
 * four LLM branches in parallel and applies the same ioc-normalize
 * pipeline as the live feeds.
 */
export default function ReportAnalyzer(): JSX.Element {
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [includeStix, setIncludeStix] = useState(false);
  const [data, setData] = useState<AnalyzerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('summary');
  const [filter, setFilter] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    if (!inputText.trim() && !inputUrl.trim()) {
      setError('Provide a URL or paste text.');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const body: Record<string, unknown> = {};
      if (inputText.trim()) body.text = inputText;
      if (inputUrl.trim()) body.url = inputUrl;
      const imgs = imageUrls
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (imgs.length > 0) body.imageUrls = imgs;
      if (includeStix) body.includeStix = true;
      const res = await fetch('/api/v1/report-analyzer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as AnalyzerOutput);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to threat intel"
      icon={<FileText className="h-6 w-6" />}
      title="Report Analyzer"
      description="Paste a report URL or text. The analyzer runs AI summary, IOC extraction, MITRE ATT&CK TTP mapping, 5W context, CVE extraction, image-OCR, detection opportunities, conclusion with recommendations, and a STIX 2.1 bundle — in a single round-trip."
      maxWidthClass="max-w-6xl"
    >
      {/* Input card */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label
              htmlFor="report-analyzer-text"
              className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1"
            >
              Paste report text
            </label>
            <textarea
              id="report-analyzer-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste the report here. Plain text or markdown. Up to 80KB."
              className="w-full h-40 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="report-analyzer-url"
              className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1"
            >
              …or fetch from URL
            </label>
            <input
              id="report-analyzer-url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com/report"
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
            />
            <label
              htmlFor="report-analyzer-images"
              className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1 mt-3"
            >
              Image URLs to OCR (one per line, optional)
            </label>
            <textarea
              id="report-analyzer-images"
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              placeholder="https://example.com/screenshot1.png"
              className="w-full h-20 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
            />
            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                id="report-analyzer-stix"
                type="checkbox"
                checked={includeStix}
                onChange={(e) => setIncludeStix(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                aria-label="Include STIX bundle"
              />
              <label htmlFor="report-analyzer-stix" className="cursor-pointer">
                <span className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Include STIX bundle
                </span>
                <span className="block mt-0.5 normal-case">
                  Off by default — STIX enrichment (Maltiverse / RDAP / NVD) can exceed the free-plan subrequest budget
                  on larger reports. Turn on for short / high-value reports where you specifically need the STIX tab
                  populated.
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-brand-500 bg-brand-500 text-white px-3 py-2 text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Analyzing…' : 'Run analyzer'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 p-2 text-sm text-rose-700 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Results */}
      {data && (
        <>
          {/* Status bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              title <span className="text-slate-700 dark:text-slate-200">{data.title}</span>
            </span>
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {data.textLength.toLocaleString()} chars
            </span>
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {data.elapsed_ms} ms
            </span>
            {data.errors.length > 0 && (
              <span
                className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 font-mono text-amber-700 dark:text-amber-300"
                title={data.errors.map((e) => `${e.branch}: ${e.message}`).join('\n')}
              >
                {data.errors.length} branch{data.errors.length > 1 ? 'es' : ''} degraded
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`inline-flex items-center gap-1.5 text-mini font-mono rounded-full border px-2.5 py-1 transition-colors ${
                  tab === t
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {TAB_META[t].icon} {TAB_META[t].label}
                {t === 'iocs' && data.iocs.length > 0 && <span className="opacity-60">· {data.iocs.length}</span>}
                {t === 'ttps' && data.ttp.length > 0 && <span className="opacity-60">· {data.ttp.length}</span>}
                {t === 'cves' && data.cves.length > 0 && <span className="opacity-60">· {data.cves.length}</span>}
                {t === 'detection' && data.detection && data.detection.siemRules.length > 0 && (
                  <span className="opacity-60">· {data.detection.siemRules.length}</span>
                )}
                {t === 'conclusion' && data.conclusion && data.conclusion.recommendedActions.length > 0 && (
                  <span className="opacity-60">· {data.conclusion.recommendedActions.length}</span>
                )}
                {t === 'mindmap' && data.mindmap.nodes.length > 0 && (
                  <span className="opacity-60">· {data.mindmap.nodes.length}</span>
                )}
                {t === 'stix' && data.stix && (
                  <span className="opacity-60">
                    ·{' '}
                    {Array.isArray((data.stix.bundle as { objects?: unknown[] }).objects)
                      ? (data.stix.bundle as { objects: unknown[] }).objects.length
                      : 0}
                  </span>
                )}
                {t === 'heatmap' && data.ttp.length > 0 && <span className="opacity-60">· {data.ttp.length}</span>}
              </button>
            ))}
          </div>

          {/* Tab body */}
          {tab === 'summary' && <SummaryTab data={data} />}
          {tab === 'detection' && <DetectionTab detection={data.detection} />}
          {tab === 'conclusion' && <ConclusionTab conclusion={data.conclusion} />}
          {tab === 'iocs' && <IocsTab iocs={data.iocs} filter={filter} setFilter={setFilter} />}
          {tab === 'ttps' && <TtpsTab ttp={data.ttp} filter={filter} setFilter={setFilter} />}
          {tab === 'cves' && <CvesTab cves={data.cves} filter={filter} setFilter={setFilter} />}
          {tab === '5w' && <FiveWTab fiveW={data.fiveW} />}
          {tab === 'mindmap' && <MindmapTab mindmap={data.mindmap} />}
          {tab === 'stix' && <StixTab data={data} />}
          {tab === 'diamond' && <DiamondTab diamond={data.diamond} />}
          {tab === 'attackflow' && <AttackFlowTab phases={data.attackFlow} />}
          {tab === 'heatmap' && <HeatmapTab ttp={data.ttp} />}
          {tab === 'source' && <SourceTab url={inputUrl} data={data} />}
        </>
      )}
    </DataPageLayout>
  );
}

// ── Tab bodies ────────────────────────────────────────────────────────

function FilterInput({
  value,
  setValue,
  placeholder,
}: {
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-1.5 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
      />
    </div>
  );
}

function SummaryTab({ data }: { data: AnalyzerOutput }) {
  if (!data.summary) {
    return <EmptyState message="Summary branch failed. Check the degraded-branches badge for details." />;
  }
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        model <span className="text-slate-700 dark:text-slate-200">{data.summary.model}</span>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
        {data.summary.text}
      </p>
    </section>
  );
}

function IocsTab({
  iocs,
  filter,
  setFilter,
}: {
  iocs: ExtractedIoc[];
  filter: string;
  setFilter: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return iocs;
    return iocs.filter((i) => `${i.value} ${i.kind} ${i.evidence}`.toLowerCase().includes(q));
  }, [iocs, filter]);
  if (iocs.length === 0) return <EmptyState message="No indicators survived allowlist filtering." />;
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <FilterInput value={filter} setValue={setFilter} placeholder={`Filter ${iocs.length} IOCs…`} />
      <ul className="space-y-1.5">
        {filtered.map((i, idx) => (
          <li
            key={`${i.kind}-${i.value}-${idx}`}
            className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-[rgb(var(--border-400))]/60 pb-1.5 last:border-b-0"
          >
            <span
              className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${IOC_PILL[i.kind]}`}
            >
              {i.kind}
            </span>
            <span
              className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${CONFIDENCE_PILL[i.confidence_band]}`}
            >
              {Math.round(i.confidence * 100)}%
            </span>
            {i.source === 'image-ocr' && (
              <span className="text-micro font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5 text-slate-500 dark:text-slate-400">
                ocr
              </span>
            )}
            <code className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{i.value}</code>
            {i.evidence && (
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 truncate max-w-[40%]">
                {i.evidence}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TtpsTab({ ttp, filter, setFilter }: { ttp: TtpHit[]; filter: string; setFilter: (v: string) => void }) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ttp;
    return ttp.filter((t) => `${t.id} ${t.name} ${t.tactic} ${t.evidence}`.toLowerCase().includes(q));
  }, [ttp, filter]);
  // Group by tactic for nicer reading.
  const grouped = useMemo(() => {
    const m = new Map<string, TtpHit[]>();
    for (const t of filtered) {
      if (!m.has(t.tactic)) m.set(t.tactic, []);
      m.get(t.tactic)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  if (ttp.length === 0) return <EmptyState message="No MITRE ATT&CK techniques identified." />;
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <FilterInput value={filter} setValue={setFilter} placeholder={`Filter ${ttp.length} techniques…`} />
      <div className="space-y-3">
        {grouped.map(([tactic, hits]) => (
          <div key={tactic}>
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              {tactic}
            </div>
            <ul className="space-y-1.5">
              {hits.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-1 border-b border-slate-100 dark:border-[rgb(var(--border-400))]/60 pb-2 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`https://attack.mitre.org/techniques/${t.id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {t.id}
                    </a>
                    <span className="text-sm text-slate-700 dark:text-slate-200">{t.name}</span>
                    <span
                      className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${CONFIDENCE_PILL[t.confidence]}`}
                    >
                      {t.confidence}
                    </span>
                  </div>
                  {t.evidence && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-6 line-clamp-2">{t.evidence}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function CvesTab({
  cves,
  filter,
  setFilter,
}: {
  cves: ExtractedCve[];
  filter: string;
  setFilter: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cves;
    return cves.filter((c) => `${c.id} ${c.context}`.toLowerCase().includes(q));
  }, [cves, filter]);
  if (cves.length === 0) return <EmptyState message="No CVEs mentioned in the report." />;
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <FilterInput value={filter} setValue={setFilter} placeholder={`Filter ${cves.length} CVEs…`} />
      <ul className="space-y-1.5">
        {filtered.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-[rgb(var(--border-400))]/60 pb-1.5 last:border-b-0"
          >
            <a
              href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              {c.id} <ExternalLink className="h-3 w-3" />
            </a>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">{c.context}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FiveWTab({ fiveW }: { fiveW: FiveW | null }) {
  if (!fiveW) return <EmptyState message="5W extraction failed." />;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Who', value: fiveW.who },
    { label: 'What', value: fiveW.what },
    { label: 'When', value: fiveW.when },
    { label: 'Where', value: fiveW.where },
    { label: 'Why', value: fiveW.why },
  ];
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        confidence <span className="text-slate-700 dark:text-slate-200">{Math.round(fiveW.confidence * 100)}%</span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
          >
            <dt className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {r.label}
            </dt>
            <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100 break-words">{r.value || '—'}</dd>
          </div>
        ))}
      </dl>
      {fiveW.attribution_basis && (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
            attribution basis:
          </span>
          {fiveW.attribution_basis}
        </div>
      )}
    </section>
  );
}

function DiamondTab({ diamond }: { diamond: DiamondModel | null }): JSX.Element {
  if (!diamond) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <Diamond className="mx-auto mb-2 h-8 w-8 text-slate-400 dark:text-slate-500" />
        No adversary/capability/infrastructure/victim signal could be derived from this report.
      </div>
    );
  }
  const facets: Array<{
    pillar: 'adversary' | 'capability' | 'infrastructure' | 'victim';
    title: string;
    tone: string;
    ring: string;
    items: JSX.Element[];
  }> = [
    {
      pillar: 'adversary',
      title: 'Adversary',
      tone: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20',
      ring: 'ring-rose-400/40',
      items:
        diamond.adversary.length === 0
          ? [
              <span key="none" className="text-xs text-slate-500">
                not identified in the report
              </span>,
            ]
          : diamond.adversary.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/40 px-2 py-0.5 text-xs font-mono text-rose-700 dark:text-rose-300"
              >
                {a}
              </span>
            )),
    },
    {
      pillar: 'capability',
      title: 'Capability',
      tone: 'border-violet-200 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20',
      ring: 'ring-violet-400/40',
      items:
        diamond.capability.length === 0
          ? [
              <span key="none" className="text-xs text-slate-500">
                none extracted
              </span>,
            ]
          : diamond.capability.slice(0, 8).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded border border-violet-300 dark:border-violet-800 bg-white dark:bg-violet-950/40 px-2 py-0.5 text-xs font-mono text-violet-700 dark:text-violet-300"
                title={c.tactic}
              >
                {c.id.startsWith('T') && /^T\d{4}(\.\d{3})?$/.test(c.id) ? (
                  <span className="text-[10px] text-slate-500">{c.id}</span>
                ) : null}
                <span className="truncate max-w-[180px]">{c.name}</span>
              </span>
            )),
    },
    {
      pillar: 'infrastructure',
      title: 'Infrastructure',
      tone: 'border-sky-200 dark:border-sky-900/60 bg-sky-50/40 dark:bg-sky-950/20',
      ring: 'ring-sky-400/40',
      items:
        diamond.infrastructure.length === 0
          ? [
              <span key="none" className="text-xs text-slate-500">
                no network IOCs
              </span>,
            ]
          : diamond.infrastructure.slice(0, 8).map((i) => (
              <span
                key={i}
                className="inline-flex items-center rounded border border-sky-300 dark:border-sky-800 bg-white dark:bg-sky-950/40 px-2 py-0.5 text-xs font-mono text-sky-700 dark:text-sky-300 truncate max-w-[200px]"
              >
                {i}
              </span>
            )),
    },
    {
      pillar: 'victim',
      title: 'Victim',
      tone: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20',
      ring: 'ring-emerald-400/40',
      items: [
        <div key="v" className="space-y-1 text-xs">
          <p>
            <span className="text-micro font-mono uppercase text-slate-500">sector</span> ·{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">{diamond.victim.sector}</span>
          </p>
          <p>
            <span className="text-micro font-mono uppercase text-slate-500">geography</span> ·{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">{diamond.victim.geography}</span>
          </p>
          <p>
            <span className="text-micro font-mono uppercase text-slate-500">asset</span> ·{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">{diamond.victim.asset}</span>
          </p>
        </div>,
      ],
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {facets.map((f) => (
        <div key={f.pillar} className={`rounded-lg border ${f.tone} p-4 shadow-e1`}>
          <div className="mb-2 flex items-center gap-2">
            <Diamond className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{f.title}</h3>
            <span className="ml-auto text-micro font-mono uppercase text-slate-500">{f.pillar}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">{f.items}</div>
        </div>
      ))}
    </div>
  );
}

function AttackFlowTab({ phases }: { phases: AttackFlowPhase[] }): JSX.Element {
  if (phases.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <GitBranch className="mx-auto mb-2 h-8 w-8 text-slate-400 dark:text-slate-500" />
        No TTP signal to render as a kill chain.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {phases.map((p) => (
        <div
          key={p.phase}
          className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] shadow-e1 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] px-4 py-2">
            <GitBranch className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.phase}</h3>
            <span className="ml-auto text-micro font-mono uppercase text-slate-500">
              {p.techniques.length} technique{p.techniques.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {p.techniques.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 inline-flex h-5 items-center rounded border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 px-1.5 text-[10px] font-mono uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  {t.id}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
                  {t.evidence && <p className="mt-0.5 text-xs text-muted line-clamp-2">{t.evidence}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MindmapTab({ mindmap }: { mindmap: { nodes: MindmapNode[]; edges: MindmapEdge[] } }) {
  const { nodes, edges } = useMemo(() => layoutNodes(mindmap.nodes, mindmap.edges), [mindmap]);
  if (mindmap.nodes.length === 0) return <EmptyState message="Mindmap is empty (no entities extracted)." />;
  return (
    <section
      className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1"
      style={{ height: 540 }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={16} />
          <Controls position="bottom-right" />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </section>
  );
}

function StixTab({ data }: { data: AnalyzerOutput }) {
  const bundle = data.stix
    ? (data.stix.bundle as { type: string; id: string; objects: Array<{ type: string; id: string; name?: string }> })
    : null;
  const byType = useMemo(() => {
    if (!bundle) return [] as Array<[string, number]>;
    const m = new Map<string, number>();
    for (const o of bundle.objects) m.set(o.type, (m.get(o.type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [bundle]);
  if (!bundle) return <EmptyState message="STIX bundle generation failed." />;
  const downloadHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(bundle, null, 2))}`;
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          STIX 2.1 bundle · {bundle.objects.length} objects
        </span>
        <a
          href={downloadHref}
          download={`stix-${data.title
            .replace(/[^a-z0-9]+/gi, '-')
            .toLowerCase()
            .slice(0, 50)}.json`}
          className="ml-auto inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> download
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-3 md:grid-cols-4">
        {byType.map(([type, n]) => (
          <div
            key={type}
            className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-2 py-1.5"
          >
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {type}
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n}</div>
          </div>
        ))}
      </div>
      <details className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2">
        <summary className="cursor-pointer text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          view raw JSON
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto text-xs font-mono text-slate-800 dark:text-slate-200">
          {JSON.stringify(bundle, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function DetectionTab({ detection }: { detection: AnalyzerOutput['detection'] }) {
  if (
    !detection ||
    (detection.siemRules.length === 0 &&
      detection.monitoringGuidance.length === 0 &&
      detection.cliCommands.length === 0)
  ) {
    return <EmptyState message="Detection opportunities extraction failed or no rules generated." />;
  }

  const severityColor: Record<string, string> = {
    critical: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
    high: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
    medium:
      'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
    low: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  };

  return (
    <div className="space-y-4">
      {/* SIEM Rules */}
      {detection.siemRules.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">SIEM Detection Rules</h3>
            <span className="ml-auto text-micro font-mono uppercase text-slate-500">
              {detection.siemRules.length} rules
            </span>
          </div>
          <div className="space-y-3">
            {detection.siemRules.map((rule, i) => (
              <div
                key={i}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{rule.title}</span>
                  <span
                    className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityColor[rule.severity] ?? severityColor.medium}`}
                  >
                    {rule.severity}
                  </span>
                  {rule.mitreId && (
                    <span className="text-micro font-mono text-violet-600 dark:text-violet-400">{rule.mitreId}</span>
                  )}
                  {rule.platform && (
                    <span className="text-micro font-mono text-slate-500 dark:text-slate-400">{rule.platform}</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{rule.description}</p>
                {rule.query && (
                  <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded p-2 overflow-x-auto">
                    {rule.query}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Monitoring Guidance */}
      {detection.monitoringGuidance.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monitoring Guidance</h3>
          </div>
          <div className="space-y-3">
            {detection.monitoringGuidance.map((cat, i) => (
              <div key={i}>
                <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  {cat.category}
                </div>
                <ul className="space-y-1">
                  {cat.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CLI Commands */}
      {detection.cliCommands.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">CLI Verification Commands</h3>
          </div>
          <div className="space-y-2">
            {detection.cliCommands.map((cmd, i) => (
              <div
                key={i}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2"
              >
                <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">{cmd.purpose}</div>
                <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded p-2 overflow-x-auto">
                  {cmd.command}
                </pre>
                {cmd.platform && (
                  <div className="mt-1 text-micro font-mono text-slate-500 dark:text-slate-400">{cmd.platform}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detection Limitations */}
      {detection.detectionLimitations.length > 0 && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Detection Limitations</h3>
          </div>
          <ul className="space-y-1">
            {detection.detectionLimitations.map((lim, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                {lim}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ConclusionTab({ conclusion }: { conclusion: AnalyzerOutput['conclusion'] }) {
  if (!conclusion || (conclusion.keyTakeaways.length === 0 && conclusion.recommendedActions.length === 0)) {
    return <EmptyState message="Conclusion extraction failed." />;
  }

  const priorityColor: Record<string, string> = {
    immediate: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
    'short-term':
      'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
    'long-term': 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  };

  return (
    <div className="space-y-4">
      {/* Risk Assessment */}
      {conclusion.riskAssessment && (
        <section className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Risk Assessment</h3>
          </div>
          <p className="text-sm text-rose-700 dark:text-rose-200 leading-relaxed">{conclusion.riskAssessment}</p>
        </section>
      )}

      {/* Key Takeaways */}
      {conclusion.keyTakeaways.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Key Takeaways</h3>
          </div>
          <ul className="space-y-2">
            {conclusion.keyTakeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommended Actions */}
      {conclusion.recommendedActions.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recommended Actions</h3>
          </div>
          <div className="space-y-2">
            {conclusion.recommendedActions.map((action, i) => (
              <div
                key={i}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${priorityColor[action.priority] ?? priorityColor['long-term']}`}
                  >
                    {action.priority}
                  </span>
                </div>
                <p className="text-sm text-slate-900 dark:text-slate-100">{action.action}</p>
                {action.rationale && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{action.rationale}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const MITRE_TACTICS = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
] as const;

const CONFIDENCE_BG: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-200 dark:bg-rose-800/60 border-rose-400 dark:border-rose-600',
  medium: 'bg-amber-100 dark:bg-amber-800/40 border-amber-300 dark:border-amber-700',
  low: 'bg-sky-100 dark:bg-sky-800/30 border-sky-300 dark:border-sky-700',
};

function HeatmapTab({ ttp }: { ttp: TtpHit[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, TtpHit[]>();
    for (const t of ttp) {
      const tactic = t.tactic || 'Other';
      if (!m.has(tactic)) m.set(tactic, []);
      m.get(tactic)!.push(t);
    }
    return m;
  }, [ttp]);

  if (ttp.length === 0) return <EmptyState message="No techniques detected — heatmap is empty." />;

  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 overflow-x-auto">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        MITRE ATT&CK Heatmap · {ttp.length} technique{ttp.length !== 1 ? 's' : ''} across {grouped.size} tactic
        {grouped.size !== 1 ? 's' : ''}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(grouped.size, 7)}, minmax(140px, 1fr))` }}
      >
        {MITRE_TACTICS.filter((t) => grouped.has(t)).map((tactic) => {
          const hits = grouped.get(tactic)!;
          return (
            <div
              key={tactic}
              className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] overflow-hidden"
            >
              <div className="px-2 py-1.5 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-micro font-mono font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">
                {tactic}
              </div>
              <div className="p-1.5 space-y-1">
                {hits.map((t) => (
                  <div
                    key={t.id}
                    title={t.evidence || t.name}
                    className={`rounded border px-1.5 py-1 text-[10px] font-mono leading-tight ${CONFIDENCE_BG[t.confidence]}`}
                  >
                    <span className="font-semibold">{t.id}</span>
                    <span className="ml-1 opacity-70">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SourceTab({ url, data }: { url: string; data: AnalyzerOutput }) {
  const displayText = data.sourceText || '';
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
          {data.textLength.toLocaleString()} chars
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> {url}
          </a>
        )}
      </div>
      {displayText ? (
        <pre className="max-h-[600px] overflow-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
          {displayText}
        </pre>
      ) : (
        <EmptyState message="No source text captured." />
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
      {message}
    </section>
  );
}
