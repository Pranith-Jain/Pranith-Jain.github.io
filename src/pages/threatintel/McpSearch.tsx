import { Link } from 'react-router-dom';
import { AlertTriangle, BrainCircuit, Github, Plug } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { McpStatusBanner } from '../../components/ti-mindmap-mcp/McpStatusBanner';
import { useMcp } from '../../components/ti-mindmap-mcp/McpContext';
import { McpSearchWorkbench } from '../../components/ti-mindmap-mcp/McpSearchWorkbench';

export default function McpSearch(): JSX.Element {
  const { apiKey } = useMcp();

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
          . Search reports, CVEs, IOCs, briefings, and STIX bundles — all via MCP.
        </span>
      }
      headerExtra={<McpStatusBanner className="max-w-2xl" />}
      maxWidthClass="max-w-4xl"
    >
      {!apiKey && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3 mb-4">
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

      <McpSearchWorkbench />

      {apiKey && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <Link
            to="/threatintel/research-hub/ai"
            className="inline-flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <BrainCircuit className="h-3 w-3 text-brand-500" />
            AI Report Showcase
          </Link>
          <a
            href="https://docs.ti-mindmap-hub.com/mcp/server/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Github className="h-3 w-3 text-slate-400" />
            MCP Docs
          </a>
        </div>
      )}
    </DataPageLayout>
  );
}
