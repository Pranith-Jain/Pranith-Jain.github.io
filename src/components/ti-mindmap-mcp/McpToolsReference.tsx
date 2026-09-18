/**
 * MCP Tools Reference — the 25-tool table for /threatintel/mcp-search.
 *
 * Renders the TI-Mindmap-Hub MCP registry as a searchable table:
 * Tool Name | Description | Parameters — matching the upstream docs.
 * Rows expand to show the parameter list with required/optional and
 * accepted values, plus a copy button for the wire name.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Table2 } from 'lucide-react';
import { TI_MINDMAP_MCP_TOOLS, type McpToolRef } from './mcp-tools-reference';

const INPUT =
  'w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm text-heading placeholder:text-slate-400 focus:outline-none focus:border-rose-500';

function ParamList({ tool }: { tool: McpToolRef }): JSX.Element | null {
  if (tool.params.length === 0) {
    return <span className="text-mini font-mono text-slate-500">None</span>;
  }
  return (
    <ul className="space-y-1">
      {tool.params.map((p) => (
        <li key={p.name} className="text-mini leading-relaxed">
          <code className="font-mono text-rose-600 dark:text-rose-400">{p.name}</code>
          <span className={`ml-1.5 font-mono ${p.required ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500'}`}>
            ({p.required ? 'required' : 'optional'})
          </span>
          {p.values && <span className="ml-1.5 font-mono text-slate-500">: {p.values.join(' · ')}</span>}
        </li>
      ))}
    </ul>
  );
}

function Row({ tool, index }: { tool: McpToolRef; index: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={index % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/60 dark:bg-[rgb(var(--surface-200)/0.4)]'}>
      {/* Table-row header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full grid grid-cols-[10rem_1fr] md:grid-cols-[14rem_1fr_16rem] gap-3 items-start text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200))] transition-colors"
      >
        <code className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400 break-all flex items-start gap-1">
          {open ? (
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-muted" />
          ) : (
            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted" />
          )}
          {tool.name}
        </code>
        <span className="text-xs text-body leading-relaxed">{tool.description}</span>
        <span className="hidden md:block">
          <ParamList tool={tool} />
        </span>
      </button>

      {/* Expanded detail (mobile shows params here; desktop gets a copy row) */}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 md:hidden">
          <ParamList tool={tool} />
        </div>
      )}
      {open && (
        <div className="px-3 pb-3 flex items-center gap-2">
          <span className="text-micro font-mono uppercase text-slate-500">MCP name:</span>
          <code className="text-mini font-mono bg-slate-100 dark:bg-[rgb(var(--surface-200))] rounded px-1.5 py-0.5 text-body">
            {tool.name}
          </code>
          <button
            type="button"
            onClick={copy}
            className="p-1 rounded text-muted hover:text-rose-500 transition-colors"
            title="Copy tool name"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

export function McpToolsReference(): JSX.Element {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TI_MINDMAP_MCP_TOOLS;
    return TI_MINDMAP_MCP_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.params.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [query]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Table2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h3 className="text-sm font-semibold text-heading">MCP Tools Reference</h3>
        <span className="text-micro font-mono uppercase text-slate-500">{TI_MINDMAP_MCP_TOOLS.length} tools</span>
        <div className="ml-auto w-full sm:w-64">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools or params…"
            className={INPUT}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Header row */}
      <div className="hidden md:grid grid-cols-[14rem_1fr_16rem] gap-3 px-3 py-1.5 border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-micro font-mono uppercase tracking-wider text-slate-500">
        <span>Tool Name</span>
        <span>Description</span>
        <span>Parameters</span>
      </div>

      <div className="rounded-b-xl border-x border-b border-slate-200 dark:border-[rgb(var(--border-400))] divide-y divide-slate-100 dark:divide-[rgb(var(--border-400)/0.5)] overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No tools match “{query}”.</p>
        ) : (
          filtered.map((tool, i) => <Row key={tool.name} tool={tool} index={i} />)
        )}
      </div>

      <p className="mt-2 text-micro font-mono text-muted">
        Endpoint: <code className="text-body">https://mcp.ti-mindmap-hub.com/mcp</code> · Auth:{' '}
        <code className="text-body">X-API-Key</code> header (free key at ti-mindmap-hub.com → My Profile → MCP Server
        API Keys). This site proxies calls via <code className="text-body">/api/v1/mcp/proxy</code> to avoid CORS.
      </p>
    </section>
  );
}
