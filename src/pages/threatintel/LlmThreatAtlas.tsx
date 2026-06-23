import { useEffect, useMemo, useState } from 'react';
import { Search, Shield, AlertTriangle, Info, BookOpen, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

const SOURCE_URL = 'https://mr-akuma.github.io/llm-threat-coverage-atlas.json';

const ARCH_LABELS: Record<string, string> = {
  chatbot: 'Prompt-only chatbot',
  rag: 'RAG / knowledge assistant',
  tool: 'Tool-using agent',
  multiagent: 'Multi-agent / quorum',
  mcp: 'MCP / plugin ecosystem',
  multimodal: 'Multimodal / voice / computer-use',
  training: 'Training / fine-tuning / model ops',
  governance: 'Governance / privacy / audit',
};

const TIER_COLORS: Record<string, string> = {
  Critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800',
  High: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  Medium:
    'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
  Low: 'text-muted bg-slate-100 dark:bg-[rgb(var(--surface-200))] border-slate-300 dark:border-[rgb(var(--border-400))]',
};

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  A: 'Prompt injection, instruction hierarchy, templates, metadata, hidden fields, and role impersonation.',
  B: 'RAG, embeddings, vector stores, memory, cache bleed, corpus poisoning, and stale authorization.',
  C: 'Training data extraction, model inversion, membership inference, and sensitive-feature reconstruction.',
  D: 'Function calls, browser automation, code execution, file access, APIs, side effects, and egress.',
  E: 'Quorum, human review, autonomous loops, multi-agent delegation, rubber-stamping, and race conditions.',
  F: 'User, tenant, service account, delegated identity, token scope, and authorization propagation.',
  G: 'Models, adapters, prompts, datasets, guardrails, parsers, providers, and deployment changes.',
  H: 'Generated HTML, Markdown, SQL, code, reports, citations, UI wording, and downstream ingestion.',
  I: 'Logging, telemetry, cost abuse, kill switches, rollback, memory purge, and incident reconstruction.',
  J: 'Model stealing, inference API probing, output side-channels, and safety fine-tuning reversal.',
  K: 'Inter-agent communication, delegation loops, agent-of-agent injection, and cascading failures.',
  L: 'Multi-modal inputs (vision, audio, files), document parsing, and cross-modal injection.',
  M: 'Over-reliance, automation bias, UI trust indicators, human-in-the-loop bypass, and social engineering.',
  N: 'System prompt extraction, chat-log leaks, prompt-sharing risks, and model-gateway monitoring.',
  O: 'MCP plugin security, third-party tool integration, plugin supply chain, and sandbox boundaries.',
};

interface AtlasItem {
  id: string;
  domain: string;
  domain_title: string;
  attack_vector: string;
  threat_model_question: string;
  architectures: string[];
  score_likelihood: number;
  score_impact: number;
  score_total: number;
  score_tier: string;
  owasp_llm_2025: string[];
  owasp_agentic: string[];
  owasp_mcp: string[];
  mitre_atlas: string[];
  mitre_attack: string[];
  nist_ai_rmf: string[];
  governance: string[];
  abuse_path: string;
  preconditions_to_check: string;
  concrete_test: string;
  hard_controls: string;
  evidence_to_keep: string;
  escalate_when: string;
}

interface AtlasResponse {
  title: string;
  version: string;
  count: number;
  items: AtlasItem[];
}

const ALL_TIERS = ['Critical', 'High', 'Medium', 'Low'] as const;

function chip(active: boolean): string {
  return `text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
    active
      ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
  }`;
}

export default function LlmThreatAtlas(): JSX.Element {
  const [data, setData] = useState<AtlasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeArch, setActiveArch] = useState<string>('all');
  const [activeTier, setActiveTier] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(SOURCE_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AtlasResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message ?? 'unknown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const domainCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const item of data.items) {
      counts.set(item.domain, (counts.get(item.domain) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const domainOrder = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of data.items) {
      if (!seen.has(item.domain)) {
        seen.add(item.domain);
        order.push(item.domain);
      }
    }
    return order;
  }, [data]);

  const filtered = useMemo(() => {
    const list = data?.items ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter((item) => {
      if (activeArch !== 'all' && !item.architectures.includes(activeArch)) return false;
      if (activeTier !== 'all' && item.score_tier !== activeTier) return false;
      if (!needle) return true;
      return (
        item.id.toLowerCase().includes(needle) ||
        item.attack_vector.toLowerCase().includes(needle) ||
        item.threat_model_question.toLowerCase().includes(needle) ||
        item.domain_title.toLowerCase().includes(needle)
      );
    });
  }, [data, query, activeArch, activeTier]);

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace('#', '');
      if (id.startsWith('LLM-')) setExpandedId(expandedId === id ? null : id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [expandedId]);

  const description = (
    <span>
      LLM/agentic AI threat-modeling coverage map — 480 curated attack vectors across {domainOrder.length} domains. Use
      the bubbles below to review, score, and document controls. Data from{' '}
      <a
        href="https://mr-akuma.github.io/llm-threat-coverage-atlas.html"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 dark:text-brand-400 hover:underline"
      >
        LLM Threat Coverage Atlas
      </a>
      .
    </span>
  );

  const archList = useMemo(
    () => (data ? (['all', ...new Set(data.items.flatMap((i) => i.architectures))] as string[]) : ['all']),
    [data]
  );

  const headerExtra = (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vectors, IDs, or domains…"
          aria-label="Search LLM threat vectors"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500/60"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {archList.map((arch) => (
          <button key={arch} onClick={() => setActiveArch(arch)} className={chip(activeArch === arch)}>
            {arch === 'all' ? 'All architectures' : (ARCH_LABELS[arch] ?? arch)}{' '}
            <span className="opacity-60">
              ·{' '}
              {arch === 'all'
                ? (data?.count ?? 0)
                : (data?.items.filter((i) => i.architectures.includes(arch)).length ?? 0)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ALL_TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => setActiveTier(activeTier === tier ? 'all' : tier)}
            className={chip(activeTier === tier)}
          >
            {tier} <span className="opacity-60">· {data?.items.filter((i) => i.score_tier === tier).length ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="LLM Threat Coverage Atlas"
      description={description}
      headerExtra={headerExtra}
      loading={loading}
      error={error}
      empty={!loading && !error && !!data && filtered.length === 0}
      emptyMessage="No vectors match the search."
    >
      {/* Domain summary cards */}
      {data && !query && activeArch === 'all' && activeTier === 'all' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-6">
          {domainOrder.map((key) => {
            const count = domainCounts.get(key) ?? 0;
            const first = data.items.find((i) => i.domain === key);
            return (
              <div
                key={key}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-lg font-bold text-brand-600 dark:text-brand-400">{key}</span>
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-muted">
                    {count}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
                  {first?.domain_title ?? ''}
                </h3>
                <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">{DOMAIN_DESCRIPTIONS[key] ?? ''}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <p className="mb-3 text-micro font-mono text-slate-400">
        {filtered.length} of {data?.count ?? 0} vectors
        {query.trim() || activeArch !== 'all' || activeTier !== 'all' ? ' (filtered)' : ''}
      </p>

      {/* Vector cards */}
      <div className="grid gap-2">
        {filtered.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              id={item.id}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 scroll-mt-20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400">
                      {item.id}
                    </span>
                    <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400">
                      {item.domain}
                    </span>
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${TIER_COLORS[item.score_tier] ?? ''}`}
                    >
                      {item.score_tier}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                    {item.attack_vector}
                  </h3>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.threat_model_question}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.architectures.slice(0, 3).map((arch) => (
                    <span
                      key={arch}
                      className="hidden sm:inline text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400"
                    >
                      {arch}
                    </span>
                  ))}
                  <button
                    onClick={() => {
                      const next = expanded ? null : item.id;
                      setExpandedId(next);
                      if (next) {
                        window.history.replaceState(null, '', `#${item.id}`);
                      } else {
                        window.history.replaceState(null, '', window.location.pathname);
                      }
                    }}
                    className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    aria-label={expanded ? 'Collapse details' : 'Expand details'}
                  >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] space-y-3 text-xs text-slate-700 dark:text-slate-300">
                  {/* Framework cross-walk chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {item.owasp_llm_2025.map((f) => (
                      <span
                        key={f}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-600 dark:text-sky-400"
                      >
                        {f}
                      </span>
                    ))}
                    {item.owasp_agentic.map((f) => (
                      <span
                        key={f}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-violet-500/40 text-violet-600 dark:text-violet-400"
                      >
                        {f}
                      </span>
                    ))}
                    {item.owasp_mcp.map((f) => (
                      <span
                        key={f}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-orange-500/40 text-orange-600 dark:text-orange-400"
                      >
                        {f}
                      </span>
                    ))}
                    {item.mitre_atlas.map((f) => (
                      <span
                        key={f}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400"
                      >
                        {f}
                      </span>
                    ))}
                    {item.mitre_attack.map((f) => (
                      <span
                        key={f}
                        className="text-micro font-mono px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-400"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {/* Score */}
                  <div className="flex gap-4 text-micro font-mono">
                    <span>
                      Likelihood: <strong>{item.score_likelihood}</strong>/5
                    </span>
                    <span>
                      Impact: <strong>{item.score_impact}</strong>/5
                    </span>
                    <span>
                      Total: <strong>{item.score_total}</strong>/25
                    </span>
                  </div>

                  {/* Detail sections */}
                  <Section icon={AlertTriangle} title="Abuse path" text={item.abuse_path} />
                  <Section icon={Info} title="Preconditions to check" text={item.preconditions_to_check} />
                  <Section icon={BookOpen} title="Concrete test" text={item.concrete_test} />
                  <Section icon={Shield} title="Hard controls" text={item.hard_controls} />
                  <Section icon={Download} title="Evidence to keep" text={item.evidence_to_keep} />
                  <Section icon={AlertTriangle} title="Escalate when" text={item.escalate_when} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* JSON download */}
      {data && (
        <p className="mt-6 text-micro font-mono text-slate-400 text-center">
          480 vectors ·{' '}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            JSON source
          </a>{' '}
          · v{data.version}
        </p>
      )}
    </DataPageLayout>
  );
}

function Section({ icon: Icon, title, text }: { icon: typeof Shield; title: string; text: string }) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
        <Icon size={12} className="text-slate-400" aria-hidden="true" />
        {title}
      </h4>
      <p className="text-muted leading-relaxed">{text}</p>
    </div>
  );
}
