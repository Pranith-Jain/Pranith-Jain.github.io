import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  Crosshair,
  Database,
  FileText,
  Github,
  Layers,
  Map,
  Plug,
  Search,
  Shield,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { McpStatusBanner } from '../../components/ti-mindmap-mcp/McpStatusBanner';
import { useMcp } from '../../components/ti-mindmap-mcp/McpContext';
import { CrossSearchWorkbench } from '../../components/ti-mindmap-mcp/CrossSearchWorkbench';

export default function McpSearch(): JSX.Element {
  const { apiKey, status } = useMcp();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toolCategories = useMemo(
    () => [
      { id: 'reports', label: 'Reports', icon: FileText, count: 5, color: 'text-blue-600 dark:text-blue-400' },
      { id: 'cves', label: 'CVE Intel', icon: Shield, count: 5, color: 'text-orange-600 dark:text-orange-400' },
      { id: 'briefings', label: 'Briefings', icon: BookOpen, count: 3, color: 'text-purple-600 dark:text-purple-400' },
      { id: 'iocs', label: 'IOC Search', icon: Crosshair, count: 1, color: 'text-rose-600 dark:text-rose-400' },
      { id: 'stix', label: 'STIX Bundles', icon: Layers, count: 3, color: 'text-emerald-600 dark:text-emerald-400' },
      { id: 'knowledge', label: 'Knowledge Graph', icon: Map, count: 6, color: 'text-cyan-600 dark:text-cyan-400' },
      { id: 'stats', label: 'Platform', icon: Database, count: 2, color: 'text-slate-600 dark:text-slate-400' },
    ],
    []
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Plug className="h-6 w-6" />}
      title="MCP Search · TI-Mindmap-Hub"
      description={
        <span>
          Live gateway to the 1,628+ reports and 25 MCP tools on{' '}
          <a
            href="https://ti-mindmap-hub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ti-mindmap-hub.com
          </a>
          . Add your API key below to search reports, CVEs, IOCs, knowledge graph, briefings, and STIX bundles — all in
          parallel.
        </span>
      }
      headerExtra={<McpStatusBanner className="max-w-2xl" />}
      maxWidthClass="max-w-7xl"
    >
      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="hidden lg:block w-52 shrink-0">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3 sticky top-24">
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Tool Explorer
            </p>
            {status !== 'connected' && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 italic">Add key to explore</p>
            )}
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveCategory(null)}
                className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium text-left
                    ${
                      !activeCategory
                        ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
                    }`}
              >
                <Search className="h-3.5 w-3.5" />
                <span>Cross Search</span>
                <span className="ml-auto text-micro text-slate-400">25 tools</span>
              </button>
              {toolCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium text-left
                        ${
                          activeCategory === cat.id
                            ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'
                        }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${cat.color}`} />
                    <span>{cat.label}</span>
                    <span className="ml-auto text-micro text-slate-400">{cat.count}</span>
                  </button>
                );
              })}
            </div>
            {apiKey && (
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                <p className="text-micro font-mono uppercase text-slate-500 dark:text-slate-400 mb-1">Quick Links</p>
                <Link
                  to="/threatintel/research-hub/ai"
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <BrainCircuit className="h-3 w-3 text-brand-500" />
                  AI Report Showcase
                </Link>
                <a
                  href="https://docs.ti-mindmap-hub.com/mcp/server/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <Github className="h-3 w-3 text-slate-400" />
                  MCP Docs
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 space-y-4">
          {!apiKey && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">Connect to TI-Mindmap-HUB</p>
                <p>
                  Most features need an API key from{' '}
                  <a
                    href="https://ti-mindmap-hub.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    ti-mindmap-hub.com
                  </a>
                  . Get one free from My Profile → MCP Server API Keys.
                </p>
              </div>
            </div>
          )}

          <CrossSearchWorkbench showHeader={false} />
        </div>
      </div>
    </DataPageLayout>
  );
}
