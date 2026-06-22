/**
 * /mcp - public catalog of the DFIR-ThreatIntel MCP server.
 *
 * Loads the auto-generated manifest from /mcp-manifest.json (built by
 * `scripts/build-mcp-manifest.mjs` from `worker/mcp-server.ts`) and
 * renders a searchable, category-grouped view of every tool the MCP
 * server exposes.
 *
 * Why a dedicated page?
 *   - The MCP server is the platform's primary interop surface for AI
 *     agents (Claude Desktop, Cursor, VS Code). It deserves a
 *     first-class landing page, not just a route in /api/v1/admin.
 *   - The manifest is the single source of truth: the same JSON file
 *     ships inside Claude/Cursor config snippets, so a tool listed
 *     here is guaranteed to be registered in the worker.
 *   - Copy-pasteable config snippets live alongside the tool list, so
 *     an analyst can go from "what does this do" to "wired up in my
 *     Claude Desktop" in two clicks.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, ExternalLink, Plug, Search, X } from 'lucide-react';
import { DataPageLayout } from '../components/DataPageLayout';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useDataFetch } from '../hooks/useDataFetch';
import { ToolJsonLd } from '../components/seo/ToolJsonLd';

interface McpTool {
  name: string;
  description: string;
  category: string;
}

interface McpManifest {
  name: string;
  version: string;
  endpoint: string;
  transport: string;
  description: string;
  toolCount: number;
  auth: {
    type: string;
    header: string;
    altHeader: string;
    note: string;
  };
  tools: McpTool[];
}

const ENDPOINT = 'https://pranithjain.qzz.io/api/mcp';

const CONFIG_SNIPPETS = {
  claude: {
    title: 'Claude Desktop',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    pathWin: '%APPDATA%\\Claude\\claude_desktop_config.json',
    json: JSON.stringify(
      {
        mcpServers: {
          'dfir-threatintel': {
            transport: 'streamable-http',
            url: ENDPOINT,
            headers: { Authorization: 'Bearer <your-api-key>' },
          },
        },
      },
      null,
      2
    ),
  },
  cursor: {
    title: 'Cursor',
    path: '~/.cursor/mcp.json',
    json: JSON.stringify(
      {
        mcpServers: {
          'dfir-threatintel': {
            url: ENDPOINT,
            transport: 'streamable-http',
            headers: { Authorization: 'Bearer <your-api-key>' },
          },
        },
      },
      null,
      2
    ),
  },
  vscode: {
    title: 'VS Code (Copilot)',
    path: '.vscode/mcp.json',
    json: JSON.stringify(
      {
        servers: {
          'dfir-threatintel': {
            type: 'http',
            url: ENDPOINT,
            headers: { Authorization: 'Bearer <your-api-key>' },
          },
        },
      },
      null,
      2
    ),
  },
} as const;

function CopyableJson({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-900/40 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[rgb(var(--border-400))] px-3 py-1.5 text-meta text-slate-500 dark:text-slate-400">
        <span className="font-mono">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-slate-600 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-meta font-mono text-slate-700 dark:text-slate-200">
        <code>{value}</code>
      </pre>
    </div>
  );
}

export default function McpCatalogPage(): JSX.Element {
  useDocumentMeta({
    title: 'DFIR-ThreatIntel MCP - 98 tools for AI agents',
    description:
      'Connect Claude Desktop, Cursor, or VS Code to the live DFIR + threat-intel platform. 98 MCP tools covering IOC check, CVE/KEV, actor enrichment, ransomware monitoring, MITRE ATT&CK extraction, YARA authoring, Hudson Rock infostealer search, passive DNS, investigation notebooks, and the full security-investigator playbook library.',
    section: 'API',
    canonicalPath: '/mcp',
  });

  const { data: manifest, error } = useDataFetch<McpManifest>({ url: '/mcp-manifest.json', ttl: 300_000 });
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  const filtered = useMemo(() => {
    if (!manifest) return [] as McpTool[];
    const q = query.trim().toLowerCase();
    return manifest.tools.filter((t) => {
      if (activeCat !== 'all' && t.category !== activeCat) return false;
      if (!q) return true;
      return t.name.includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    });
  }, [manifest, query, activeCat]);

  const grouped = useMemo(() => {
    const map = new Map<string, McpTool[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    if (!manifest) return [] as { cat: string; count: number }[];
    const map = new Map<string, number>();
    for (const t of manifest.tools) {
      map.set(t.category, (map.get(t.category) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count);
  }, [manifest]);

  return (
    <DataPageLayout
      backTo="/"
      icon={<Plug size={28} />}
      title="DFIR-ThreatIntel MCP server"
      description={
        manifest
          ? `${manifest.toolCount} tools across IOC check, CVE/KEV, actor enrichment, domain/ASN/WHOIS pivots, ransomware + breach monitoring, phishing analysis, supply-chain attacks, YARA/Sigma authoring, MITRE ATT&CK extraction, Hudson Rock infostealer search, passive DNS, IOC watchlists, investigation notebooks, shift handover, and the full security-investigator playbook library. Streamable HTTP transport.`
          : 'Loading manifest...'
      }
      maxWidthClass="max-w-6xl"
      error={error ? `Failed to load the manifest: ${String(error)}` : null}
      loading={!manifest && !error}
    >
      <ToolJsonLd
        section="mcp"
        toolName="DFIR-ThreatIntel MCP"
        description="Model Context Protocol server exposing 98 DFIR + threat-intel tools for AI agents (Claude Desktop, Cursor, VS Code)."
        path="/mcp"
        category="AI Agent Interop"
        features={[
          'Streamable HTTP transport',
          '98 tools across IOC/CVE/actor/YARA',
          'Claude Desktop / Cursor / VS Code config snippets',
        ]}
      />

      {/* Endpoint / transport strip */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-3 text-meta text-slate-600 dark:text-slate-400">
          <span>
            <span className="text-slate-900 dark:text-slate-100 font-medium">Endpoint</span>{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-meta font-mono text-slate-700 dark:text-slate-200">
              {ENDPOINT}
            </code>
          </span>
          <span>
            <span className="text-slate-900 dark:text-slate-100 font-medium">Transport</span>{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-meta font-mono text-slate-700 dark:text-slate-200">
              streamable-http
            </code>
          </span>
        </div>
        <a
          href="/mcp-manifest.json"
          className="inline-flex items-center gap-1 text-meta text-brand-600 dark:text-brand-400 hover:underline"
        >
          Manifest <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>

      {/* Config snippets */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
          Connect in 30 seconds
        </h2>
        <ol className="mb-5 list-decimal space-y-2 pl-5 text-tool text-slate-600 dark:text-slate-400 leading-relaxed">
          <li>
            Generate an API key at{' '}
            <Link to="/api/v1/admin/keys" className="text-brand-600 dark:text-brand-400 hover:underline">
              <code>/api/v1/admin/keys</code>
            </Link>{' '}
            (admin token required).
          </li>
          <li>Drop one of the snippets below into the matching config file.</li>
          <li>
            Replace <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 text-meta">&lt;your-api-key&gt;</code>{' '}
            with the real key.
          </li>
          <li>
            Restart the client. Tools appear as{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 text-meta">
              mcp__dfir-threatintel__&lt;tool_name&gt;
            </code>
            .
          </li>
        </ol>
        <div className="grid gap-4 lg:grid-cols-3">
          {Object.entries(CONFIG_SNIPPETS).map(([k, s]) => (
            <div key={k}>
              <div className="mb-1.5 flex items-baseline justify-between text-tool">
                <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{s.title}</span>
                <code className="text-micro text-slate-500 dark:text-slate-400">{s.path}</code>
              </div>
              <CopyableJson value={s.json} label={s.title} />
            </div>
          ))}
        </div>
      </section>

      {/* Search + category filter */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${manifest?.toolCount ?? ''} tools...`}
            className="w-full rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] py-2 pl-9 pr-3 text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <FilterPill
            label="all"
            count={manifest?.toolCount ?? 0}
            active={activeCat === 'all'}
            onClick={() => setActiveCat('all')}
            accent="text-brand-600 dark:text-brand-400"
          />
          {categoryCounts.map((c) => (
            <FilterPill
              key={c.cat}
              label={c.cat}
              count={c.count}
              active={activeCat === c.cat}
              onClick={() => setActiveCat(c.cat)}
              accent="text-brand-600 dark:text-brand-400"
            />
          ))}
        </div>
      </section>

      {/* Tool grid */}
      {grouped.length === 0 && manifest && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-6 text-center text-tool text-slate-500 dark:text-slate-400">
          No tools match your filter. Try clearing the search.
        </div>
      )}
      <div className="space-y-8">
        {grouped.map(([cat, tools]) => (
          <section key={cat}>
            <h2 className="mb-3 text-lg font-display font-semibold text-slate-900 dark:text-slate-100 flex items-baseline gap-2">
              {cat}
              <span className="text-meta font-mono font-normal text-slate-500 dark:text-slate-400">
                ({tools.length})
              </span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {tools.map((t) => (
                <li
                  key={t.name}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="text-tool font-semibold text-brand-600 dark:text-brand-400">{t.name}</code>
                    <span className="rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t.category}
                    </span>
                  </div>
                  <p className="mt-1.5 text-meta text-muted leading-relaxed">{t.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 pt-6 text-tool text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
        <p>
          The manifest at <code>/mcp-manifest.json</code> is auto-generated from <code>worker/mcp-server.ts</code> by{' '}
          <code>scripts/build-mcp-manifest.mjs</code> on every build. To add a tool, register it with{' '}
          <code>this.tool(...)</code> in the worker; it appears here on the next deploy.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            to="/api/v1/openapi.json"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            REST API spec <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <Link
            to="/api/docs"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            API browser <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <Link
            to="/dfir"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            DFIR toolkit <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </footer>
    </DataPageLayout>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro transition-colors ${
        active
          ? `${accent} border-current bg-current/10`
          : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
          active ? 'bg-current/15' : 'bg-slate-100 dark:bg-slate-800'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
