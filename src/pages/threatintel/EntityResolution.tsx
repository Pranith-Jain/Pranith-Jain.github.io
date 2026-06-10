import { useState, useRef, useEffect } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Search,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  Hash,
  Globe,
  Monitor,
  Users,
  Bug,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

// ── Types mirroring the backend API ──────────────────────────────────────

type EntityType =
  | 'actor'
  | 'ransomware'
  | 'cve'
  | 'malware'
  | 'ip'
  | 'domain'
  | 'hash'
  | 'product'
  | 'sector'
  | 'unknown';

interface ResolvedEntity {
  type: EntityType;
  id: string;
  label: string;
  confidence: number;
  aliases: string[];
  source: string;
  context?: Record<string, unknown>;
}

interface EntityLink {
  source_id: string;
  source_type: EntityType;
  target_id: string;
  target_type: EntityType;
  relationship: string;
  confidence: number;
}

interface EntityProfile {
  entity: ResolvedEntity;
  links: EntityLink[];
  techniques?: Array<{ id: string; name: string; tactic: string }>;
  dna_profile?: Record<string, unknown>;
  cves?: string[];
  cross_references: Array<{ source_id: string; source_name: string; label: string }>;
}

type ViewMode = 'resolve' | 'extract';

const ENTITY_TYPE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  actor: { label: 'Actor', icon: Users, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  ransomware: {
    label: 'Ransomware',
    icon: Bug,
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  cve: { label: 'CVE', icon: Shield, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  malware: {
    label: 'Malware',
    icon: Bug,
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  ip: { label: 'IP', icon: Monitor, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  domain: { label: 'Domain', icon: Globe, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  hash: {
    label: 'Hash',
    icon: Hash,
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  unknown: {
    label: 'Unknown',
    icon: AlertTriangle,
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

function EntityBadge({ type, size = 'sm' }: { type: EntityType; size?: 'sm' | 'md' }) {
  const cfg = ENTITY_TYPE_CONFIG[type] ?? ENTITY_TYPE_CONFIG.unknown;
  const Icon = cfg.icon;
  const s = size === 'sm' ? 'text-micro px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded font-mono font-medium ${s} ${cfg.color}`}>
      <Icon size={size === 'sm' ? 10 : 12} />
      {cfg.label}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-mini font-mono text-slate-500">
      <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

export default function EntityResolution(): JSX.Element {
  const [mode, setMode] = useState<ViewMode>('resolve');
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState<ResolvedEntity | null>(null);
  const [profile, setProfile] = useState<EntityProfile | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [extracted, setExtracted] = useState<ResolvedEntity[]>([]);
  const [relevantPirs, setRelevantPirs] = useState<PirRef[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── PIR relevance ───────────────────────────────────────────────────
  async function fetchRelevantPirs(q: string) {
    try {
      const res = await fetch(`/api/v1/threat-intel/pirs/relevant?q=${encodeURIComponent(q.trim())}`, {
        headers: adminAuthHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { results: PirRef[] };
        setRelevantPirs(data.results);
      }
    } catch {
      /* non-fatal */
    }
  }

  interface PirRef {
    id: string;
    title: string;
    priority: string;
    status: string;
    category: string;
    consumer: string;
    matched_in: string[];
  }

  const resolve = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setEntity(null);
    setProfile(null);
    setShowFull(false);
    setRelevantPirs([]);
    try {
      const res = await fetch(`/api/v1/threat-intel/entities/resolve?q=${encodeURIComponent(q.trim())}&full=true`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Resolution failed');
      }
      const data = await res.json();
      if (!data.resolved) {
        setError(`No entity found for "${q.trim()}"`);
        return;
      }
      setEntity(data.entity);
      setProfile({
        entity: data.entity,
        links: data.links ?? [],
        techniques: data.techniques,
        dna_profile: data.dna_profile,
        cves: data.cves,
        cross_references: data.cross_references ?? [],
      });
      fetchRelevantPirs(q.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const extract = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setExtracted([]);
    try {
      const res = await fetch('/api/v1/threat-intel/entities/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Extraction failed');
      }
      const data = await res.json();
      setExtracted(data.entities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'resolve') resolve(query);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Search size={22} className="text-brand-600 dark:text-brand-400" />
          <h1 className="font-display font-bold text-2xl">Entity Resolution</h1>
        </div>
        <p className="text-tool font-mono text-slate-500 dark:text-slate-400">
          Resolve threat actor names, ransomware groups, CVEs, IPs, domains, and hashes against curated intelligence.
          Powered by a 500+ entry alias index and CVE-to-actor mapping.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-6 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setMode('resolve')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
            mode === 'resolve'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Resolve entity
        </button>
        <button
          type="button"
          onClick={() => setMode('extract')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
            mode === 'extract'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Extract from text
        </button>
      </div>

      {mode === 'resolve' ? (
        <>
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. LockBit, CVE-2024-1709, 8.8.8.8, Scattered Spider, 185.234.72.0"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-20 font-mono text-tool text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-3 py-1 text-mini font-mono font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : 'Resolve'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300 font-mono">
              {error}
            </div>
          )}

          {entity && (
            <div className="space-y-4 animate-fade-in-up">
              {/* Entity header */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <EntityBadge type={entity.type} size="md" />
                      <span className="text-micro font-mono text-slate-400">
                        source: {entity.source.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
                      {entity.label}
                    </h2>
                    <p className="font-mono text-meta text-slate-400 mt-0.5">{entity.id}</p>
                  </div>
                  <ConfidenceBar score={entity.confidence} />
                </div>

                {entity.aliases.length > 0 && (
                  <div className="mt-3">
                    <span className="text-mini font-mono font-medium text-slate-500 uppercase tracking-wider">
                      Aliases
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {entity.aliases.map((a) => (
                        <span
                          key={a}
                          className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-mini font-mono text-slate-600 dark:text-slate-400"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entity.context && Object.keys(entity.context).length > 0 && (
                  <div className="mt-3">
                    <span className="text-mini font-mono font-medium text-slate-500 uppercase tracking-wider">
                      Context
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {Object.entries(entity.context).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-mini font-mono text-slate-600 dark:text-slate-400"
                        >
                          {k}={Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowFull(!showFull)}
                    className="inline-flex items-center gap-1 text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {showFull ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {showFull ? 'Hide full profile' : 'Show full profile'}
                  </button>
                </div>

                {/* PIR relevance */}
                {relevantPirs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-micro font-mono font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Relevant PIRs ({relevantPirs.length})
                    </p>
                    <div className="space-y-1.5">
                      {relevantPirs.map((pir) => (
                        <a
                          key={pir.id}
                          href={`/threatintel/pir-dashboard`}
                          className="flex items-center gap-2 text-mini font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          <span
                            className={`px-1 py-0.5 rounded text-micro uppercase ${
                              pir.priority === 'critical'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                : pir.priority === 'high'
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {pir.priority}
                          </span>
                          <span className="flex-1 truncate">{pir.title}</span>
                          <span className="text-micro text-slate-400">{pir.matched_in.join(', ')}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Full profile (conditionally shown) */}
              {showFull && profile && (
                <>
                  {/* Cross-references */}
                  {profile.cross_references.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                      <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Cross-references
                      </h3>
                      <div className="grid gap-2">
                        {profile.cross_references.map((ref) => (
                          <div key={ref.source_id} className="flex items-center gap-2 text-meta font-mono">
                            <ExternalLink size={12} className="text-slate-400 shrink-0" />
                            <span className="text-slate-600 dark:text-slate-400">{ref.source_name}:</span>
                            <span className="text-slate-900 dark:text-slate-100">{ref.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CVEs */}
                  {profile.cves && profile.cves.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                      <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Linked CVEs ({profile.cves.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.cves.map((cve) => (
                          <span
                            key={cve}
                            className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-mini font-mono text-amber-700 dark:text-amber-300"
                          >
                            {cve}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Links */}
                  {profile.links.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                      <h3 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Relationships ({profile.links.length})
                      </h3>
                      <div className="grid gap-2">
                        {profile.links.map((link, i) => (
                          <div key={i} className="flex items-center gap-2 text-meta font-mono">
                            <EntityBadge type={link.source_type} />
                            <span className="text-slate-500 text-mini">{link.relationship.replace(/_/g, ' ')}</span>
                            <EntityBadge type={link.target_type} />
                            <span className="text-slate-900 dark:text-slate-100">{link.target_id}</span>
                            <ConfidenceBar score={link.confidence} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-8">
            <label
              htmlFor="extract-text"
              className="block mb-2 text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider"
            >
              Paste text to extract entities
            </label>
            <textarea
              id="extract-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste a threat report, blog post, or any text containing CVE IDs, threat actor names, ransomware group references, IPs, domains, or hashes..."
              className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-tool text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => void extract()}
                disabled={loading || !text.trim()}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-mini font-mono font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {loading ? 'Extracting...' : 'Extract entities'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300 font-mono">
              {error}
            </div>
          )}

          {extracted.length > 0 && (
            <div className="animate-fade-in-up">
              <p className="text-xs font-mono text-slate-500 mb-3">
                Found {extracted.length} entit{extracted.length === 1 ? 'y' : 'ies'}
              </p>
              <div className="grid gap-2">
                {extracted.map((e) => {
                  const cfg = ENTITY_TYPE_CONFIG[e.type] ?? ENTITY_TYPE_CONFIG.unknown;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={e.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} className="text-slate-400 shrink-0" />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <EntityBadge type={e.type} />
                            <span className="font-mono font-medium text-sm text-slate-900 dark:text-slate-100">
                              {e.label}
                            </span>
                          </div>
                          <span className="font-mono text-mini text-slate-400">{e.id}</span>
                        </div>
                      </div>
                      <ConfidenceBar score={e.confidence} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && text && extracted.length === 0 && !error && (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-tool text-slate-500 font-mono">
              No entities found in the provided text. Try pasting something with CVE IDs, actor names, IPs, domains, or
              hashes.
            </div>
          )}
        </>
      )}
    </div>
  );
}
