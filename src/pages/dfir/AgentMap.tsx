import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Network, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  buildGraph,
  layoutRing,
  CAPABILITY_COLORS,
  CAPABILITY_LABELS,
  type Capability,
  type ToolNode,
  type RiskPath,
} from '../../lib/dfir/agent-graph';

const SAMPLE_BASIC = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
  }
}`;

const SAMPLE_RISKY = `{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["mcp-server-browser"],
      "tools": [
        { "name": "fetch_url", "description": "Fetch and return the contents of a URL." },
        { "name": "web_search", "description": "Search the web." }
      ]
    },
    "filesystem-full": {
      "command": "node",
      "args": ["fs.js"],
      "tools": [
        { "name": "read_file", "description": "Read any file from disk including ~/.ssh keys and secrets." },
        { "name": "write_file", "description": "Write to any path." }
      ]
    },
    "shell": {
      "command": "node",
      "args": ["sh.js"],
      "tools": [
        { "name": "run_command", "description": "Execute a shell command." }
      ]
    },
    "outbound": {
      "url": "https://example.com/mcp",
      "tools": [
        { "name": "post_webhook", "description": "POST data to any URL." }
      ]
    }
  },
  "permissions": {
    "allow": ["Bash(*)", "Read(/etc/*)", "WebFetch"]
  }
}`;

const SEV_STYLES: Record<RiskPath['severity'], string> = {
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

const VIEW_W = 500;
const VIEW_H = 500;

function NodeBubble({
  tool,
  pos,
  highlighted,
}: {
  tool: ToolNode;
  pos: { x: number; y: number };
  highlighted: boolean;
}): JSX.Element {
  const cap = tool.capabilities[0];
  const color = cap ? CAPABILITY_COLORS[cap] : '#94a3b8';
  return (
    <g>
      <circle
        cx={pos.x}
        cy={pos.y}
        r={highlighted ? 22 : 16}
        fill={color}
        fillOpacity={highlighted ? 0.35 : 0.18}
        stroke={color}
        strokeWidth={highlighted ? 2.5 : 1.5}
      >
        <title>
          {tool.label} ({tool.origin}) — {tool.capabilities.join(', ') || 'no capability classified'}
          {tool.detail ? '\n' + tool.detail : ''}
        </title>
      </circle>
      <text
        x={pos.x}
        y={pos.y + 32}
        textAnchor="middle"
        className="font-mono fill-slate-700 dark:fill-slate-300"
        style={{ fontSize: 9 }}
      >
        {tool.label.length > 14 ? tool.label.slice(0, 13) + '…' : tool.label}
      </text>
    </g>
  );
}

export default function AgentMap(): JSX.Element {
  const [input, setInput] = useState('');

  const { graph, parseError } = useMemo(() => {
    if (!input.trim()) return { graph: null, parseError: null as string | null };
    try {
      const parsed = JSON.parse(input);
      return { graph: buildGraph(parsed), parseError: null };
    } catch (e) {
      return { graph: null, parseError: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  }, [input]);

  const positions = useMemo(() => {
    if (!graph) return [] as ReturnType<typeof layoutRing>;
    return layoutRing(graph.tools, 180, VIEW_W / 2, VIEW_H / 2);
  }, [graph]);

  const posById = useMemo(() => Object.fromEntries(positions.map((p) => [p.id, p])), [positions]);

  // Risk-path edges to draw on top of the graph.
  const riskEdges = useMemo(() => {
    if (!graph) return [] as Array<{ from: string; to: string; severity: RiskPath['severity'] }>;
    const edges: Array<{ from: string; to: string; severity: RiskPath['severity'] }> = [];
    for (const r of graph.risks) {
      for (let i = 0; i < r.nodes.length - 1; i++) {
        edges.push({ from: r.nodes[i], to: r.nodes[i + 1], severity: r.severity });
      }
    }
    return edges;
  }, [graph]);

  const highlightedIds = new Set(graph?.risks.flatMap((r) => r.nodes) ?? []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Network size={28} className="text-brand-600 dark:text-brand-400" /> AI Agent Attack-Surface Mapper
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Paste an MCP server config or a Claude Code <code>settings.json</code>. The mapper classifies each tool by
          capability (ingest, read-sensitive, write, execute, egress) and flags the canonical exfiltration and RCE
          chains that indirect prompt injection would need.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with the{' '}
          <Link to="/dfir/mcp-audit" className="text-brand-600 dark:text-brand-400 hover:underline">
            MCP &amp; Claude Code Auditor
          </Link>{' '}
          (which lints the same configs for misconfigurations) and the{' '}
          <Link to="/dfir/prompt-injection" className="text-brand-600 dark:text-brand-400 hover:underline">
            Prompt Injection Detector
          </Link>{' '}
          (the entry-point side of these chains).
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
            Config JSON
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setInput(SAMPLE_BASIC)}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40"
            >
              Sample · basic
            </button>
            <button
              onClick={() => setInput(SAMPLE_RISKY)}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              Sample · risky
            </button>
            {input && (
              <button
                onClick={() => setInput('')}
                className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder='{ "mcpServers": { "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] } } }'
          className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
        />
        {parseError && (
          <p className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400">JSON parse error: {parseError}</p>
        )}
      </section>

      {graph && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_320px] mb-6">
            {/* Graph */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
                Capability graph ({graph.tools.length} tool{graph.tools.length === 1 ? '' : 's'})
              </h2>
              {graph.tools.length === 0 ? (
                <p className="text-sm font-mono text-slate-500 dark:text-slate-500 py-12 text-center">
                  No tools detected. Add MCP servers, Claude Code allow rules, or a top-level <code>tools</code> array.
                </p>
              ) : (
                <svg
                  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                  className="w-full h-auto max-w-[500px] mx-auto"
                  role="img"
                  aria-label="Agent tool graph"
                >
                  {/* Risk edges */}
                  {riskEdges.map((e, i) => {
                    const a = posById[e.from];
                    const b = posById[e.to];
                    if (!a || !b) return null;
                    const colour =
                      e.severity === 'critical' ? '#f43f5e' : e.severity === 'high' ? '#f97316' : '#f59e0b';
                    return (
                      <line
                        key={i}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={colour}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        opacity={0.7}
                      />
                    );
                  })}
                  {graph.tools.map((t) => {
                    const p = posById[t.id];
                    if (!p) return null;
                    return <NodeBubble key={t.id} tool={t} pos={p} highlighted={highlightedIds.has(t.id)} />;
                  })}
                </svg>
              )}
            </div>

            {/* Capability legend */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
                Capabilities
              </h2>
              <ul className="space-y-1.5 text-sm font-mono">
                {(Object.keys(CAPABILITY_LABELS) as Capability[]).map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: CAPABILITY_COLORS[c] }}
                    />
                    <span className="text-slate-700 dark:text-slate-300">{CAPABILITY_LABELS[c]}</span>
                    <span className="ml-auto text-slate-500 dark:text-slate-500">{graph.capCounts[c]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] font-mono text-slate-500 dark:text-slate-500 leading-relaxed">
                Classification is heuristic — based on tool name, description, and Claude Code permission shape. Hover a
                node to see the source detail.
              </p>
            </div>
          </section>

          {/* Risk paths */}
          {graph.risks.length > 0 ? (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400 font-mono mb-3 inline-flex items-center gap-1.5">
                <AlertTriangle size={12} /> Risk paths ({graph.risks.length})
              </h2>
              <ul className="space-y-3">
                {graph.risks.map((r) => (
                  <li
                    key={r.id}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLES[r.severity]}`}
                      >
                        {r.severity}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">{r.kind}</span>
                    </div>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">{r.detail}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {r.nodes.map((id) => {
                        const t = graph.tools.find((x) => x.id === id);
                        return (
                          <span
                            key={id}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                          >
                            {t?.label ?? id}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">→ {r.remediation}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : graph.tools.length > 0 ? (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mb-6 text-sm font-mono text-emerald-700 dark:text-emerald-300">
              No exfil / RCE chains detected. Heuristic only — re-run after every config change.
            </section>
          ) : null}

          {/* Tool list */}
          {graph.tools.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Tools
              </h2>
              <ul className="space-y-1.5">
                {graph.tools.map((t) => (
                  <li key={t.id} className="text-[12px] font-mono">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{t.label}</span>
                      <span className="text-slate-500 dark:text-slate-500">[{t.origin}]</span>
                      {t.capabilities.length === 0 ? (
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">no capability classified</span>
                      ) : (
                        t.capabilities.map((c) => (
                          <span
                            key={c}
                            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor: CAPABILITY_COLORS[c] + '60',
                              backgroundColor: CAPABILITY_COLORS[c] + '20',
                              color: CAPABILITY_COLORS[c],
                            }}
                          >
                            {CAPABILITY_LABELS[c]}
                          </span>
                        ))
                      )}
                    </div>
                    {t.detail && <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">{t.detail}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <a
              href="https://owasp.org/www-project-top-10-for-large-language-model-applications/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              OWASP LLM Top 10 — LLM06 Excessive Agency, LLM02 Sensitive Information Disclosure
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Invariant Labs — Tool Poisoning attacks against MCP
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
