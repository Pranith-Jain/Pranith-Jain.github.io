/**
 * /threatintel/mcp-search -- a live workbench for the 1,628+ reports on
 * ti-mindmap-hub.com, queryable through their MCP server. Two surfaces:
 *
 *   1. McpSearchWorkbench -- free-text search across IOC / CVE / report /
 *      briefing with persisted query history.
 *   2. McpReportBrowser   -- paginated catalog browser (search, time-range
 *      filter). Each row has a 'load into analyzer' action that pulls
 *      the report's raw text via get_report_content and hands it to our
 *      local /api/v1/report-analyzer pipeline.
 *
 * No TI-Mindmap-Hub content is cached in the platform bundle -- every
 * report is fetched on demand through the same MCP session, so we
 * always show whatever the upstream platform has today.
 */

import { useState } from 'react';
import { Plug, Sparkles } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { McpKeyBar } from '../../components/ti-mindmap-mcp/McpKeyBar';
import { McpSearchWorkbench } from '../../components/ti-mindmap-mcp/McpSearchWorkbench';
import { McpReportBrowser, type LoadedReport } from '../../components/ti-mindmap-mcp/McpReportBrowser';
import { useMcp } from '../../components/ti-mindmap-mcp/McpContext';
// Mirror the AI Report showcase types so the loaded report renders
// the same 8 sections in the same side panel.
type IocKind = 'ip' | 'url' | 'domain' | 'hash' | 'cve' | 'email';
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
interface DiamondModel {
  adversary: string[];
  capability: { id: string; name: string; tactic: string; evidence: string }[];
  infrastructure: string[];
  victim: { sector: string; geography: string; asset: string };
}
interface AttackFlowPhase {
  phase: string;
  techniques: { id: string; name: string; evidence: string }[];
}
interface AnalyzerOutput {
  title: string;
  source?: string;
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
  stix: { bundle: { type: string; id: string; objects: unknown[] }; view: unknown } | null;
  errors: { branch: string; message: string }[];
  elapsed_ms: number;
}

const IOC_PILL: Record<IocKind, string> = {
  ip: 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800',
  url: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800',
  domain: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  hash: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  cve: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  email: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
};

function fmtConfidence(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const CONFIDENCE_PILL: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  medium: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  low: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
};

export default function McpSearch(): JSX.Element {
  useMcp();
  const [loaded, setLoaded] = useState<LoadedReport | null>(null);
  const [analyzerData, setAnalyzerData] = useState<AnalyzerOutput | null>(null);
  const [analyzerBusy, setAnalyzerBusy] = useState(false);
  const [analyzerErr, setAnalyzerErr] = useState<string | null>(null);

  async function runLocalAnalyzer(text: string, title: string, source?: string): Promise<void> {
    setAnalyzerBusy(true);
    setAnalyzerErr(null);
    setAnalyzerData(null);
    try {
      const r = await fetch('/api/v1/report-analyzer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, title, source }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
      setAnalyzerData((await r.json()) as AnalyzerOutput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyzerErr(msg);
    } finally {
      setAnalyzerBusy(false);
    }
  }

  function onLoad(r: LoadedReport): void {
    setLoaded(r);
    setAnalyzerData(null);
    setAnalyzerErr(null);
    void runLocalAnalyzer(r.text, r.title, r.source);
  }

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Plug className="h-6 w-6" />}
      title="MCP Search · TI-Mindmap-Hub"
      description={
        <span>
          Live gateway to the 1,628+ reports on{' '}
          <a
            href="https://ti-mindmap-hub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ti-mindmap-hub.com
          </a>
          . Add your API key in the bar below to enable free-text search and the full report browser. Pick any report to
          run our local{' '}
          <a href="/dfir/report-analyzer" className="text-brand-600 dark:text-brand-400 hover:underline">
            report-analyzer
          </a>{' '}
          pipeline on it (same 8-section PDF-quality output as the{' '}
          <a href="/threatintel/ai-report" className="text-brand-600 dark:text-brand-400 hover:underline">
            AI Report showcase
          </a>
          ).
        </span>
      }
      headerExtra={<McpKeyBar variant="full" />}
      maxWidthClass="max-w-7xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: search workbench */}
        <McpSearchWorkbench />

        {/* Right column: catalog browser */}
        <McpReportBrowser onLoad={onLoad} />
      </div>

      {/* Loaded report side panel */}
      {(loaded || analyzerBusy || analyzerErr || analyzerData) && (
        <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Local analysis of: <span className="text-brand-600 dark:text-brand-400">{loaded?.title ?? '—'}</span>
            </h3>
            <span className="ml-auto text-micro font-mono uppercase text-slate-500">local AI Report pipeline</span>
          </div>
          <div className="p-4">
            {!loaded && <p className="text-xs text-slate-500">No report loaded yet.</p>}
            {loaded && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-mono">
                {loaded.source ?? 'unknown'}
                {loaded.publishedAt ? ` · ${loaded.publishedAt}` : ''} · {loaded.text.length.toLocaleString()} chars · ~
                {Math.ceil(loaded.text.length / 4).toLocaleString()} tokens
              </p>
            )}
            {analyzerBusy && <p className="text-xs text-sky-600 dark:text-sky-300">Running local 8-branch analyzer…</p>}
            {analyzerErr && <p className="text-xs text-rose-600 dark:text-rose-300 font-mono">error: {analyzerErr}</p>}
            {analyzerData && <AnalyzerSummary data={analyzerData} />}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Tip: this page is the live path to all 1,628+ reports. The 3 curated samples on{' '}
        <a href="/threatintel/ai-report" className="text-brand-600 dark:text-brand-400 hover:underline">
          /threatintel/ai-report
        </a>{' '}
        are the offline path -- they ship in the bundle so the showcase works without an MCP key.
      </p>
    </DataPageLayout>
  );
}

function AnalyzerSummary({ data }: { data: AnalyzerOutput }): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="IOCs" value={data.iocs.length} />
        <Stat label="TTPs" value={data.ttp.length} />
        <Stat label="CVEs" value={data.cves.length} />
        <Stat label="elapsed" value={`${(data.elapsed_ms / 1000).toFixed(1)}s`} />
      </div>

      {data.summary?.text && (
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            AI summary · {data.summary.model}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-6 whitespace-pre-wrap">
            {data.summary.text}
          </p>
        </div>
      )}

      {data.fiveW && (
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">5W</p>
          <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
            <li>
              <span className="font-mono text-slate-500">who</span> {data.fiveW.who}
            </li>
            <li>
              <span className="font-mono text-slate-500">what</span> {data.fiveW.what}
            </li>
            <li>
              <span className="font-mono text-slate-500">when</span> {data.fiveW.when}
            </li>
            <li>
              <span className="font-mono text-slate-500">where</span> {data.fiveW.where}
            </li>
            <li>
              <span className="font-mono text-slate-500">why</span> {data.fiveW.why}
            </li>
          </ul>
        </div>
      )}

      {data.iocs.length > 0 && (
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Top IOCs (high/medium confidence)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.iocs
              .filter((i) => i.confidence_band !== 'low')
              .slice(0, 12)
              .map((i, idx) => (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${IOC_PILL[i.kind]}`}
                  title={i.evidence}
                >
                  <span className="font-semibold">{i.kind}</span>
                  <span className="max-w-[12rem] truncate">{i.value}</span>
                  <span className={`rounded px-1 ${CONFIDENCE_PILL[i.confidence_band]}`}>
                    {fmtConfidence(i.confidence)}
                  </span>
                </span>
              ))}
          </div>
        </div>
      )}

      {data.ttp.length > 0 && (
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            TTPs
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.ttp.slice(0, 16).map((t, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 dark:text-violet-300"
                title={t.evidence}
              >
                <span className="font-semibold">{t.id}</span>
                <span>{t.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
      <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-base font-display font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
