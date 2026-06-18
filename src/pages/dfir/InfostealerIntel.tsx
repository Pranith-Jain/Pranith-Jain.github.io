import { useCallback, useEffect, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  KeyRound,
  Search,
  Globe,
  User,
  MapPin,
  Bug,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Shield,
  Clock,
  Building2,
} from 'lucide-react';

type TabId = 'email' | 'domain' | 'username' | 'ip' | 'overview' | 'infection';

const TABS: Array<{ id: TabId; label: string; icon: typeof KeyRound; placeholder: string; description: string }> = [
  {
    id: 'email',
    label: 'Email',
    icon: Search,
    placeholder: '[email protected]',
    description: 'Search compromised credentials by email address',
  },
  {
    id: 'domain',
    label: 'Domain',
    icon: Globe,
    placeholder: 'example.com',
    description: 'Search domain-wide infostealer compromises',
  },
  {
    id: 'username',
    label: 'Username',
    icon: User,
    placeholder: 'johndoe',
    description: 'Search compromised credentials by username',
  },
  {
    id: 'ip',
    label: 'IP / CIDR',
    icon: MapPin,
    placeholder: '192.168.1.1',
    description: 'Search compromises by IP address or CIDR range',
  },
  {
    id: 'overview',
    label: 'Domain Overview',
    icon: Building2,
    placeholder: 'example.com',
    description: 'Domain compromise statistics and risk posture',
  },
  {
    id: 'infection',
    label: 'Infection Analysis',
    icon: Bug,
    placeholder: '[IN]175.101.37.65',
    description: 'AI-powered infection source tracing (stealer ID)',
  },
];

interface StealerEntry {
  stealer_id: string;
  stealer_family: string;
  date_compromised: string;
  date_uploaded: string;
  ip: string;
  computer_name: string;
  operating_system: string;
  employee_at?: string[];
  client_at?: string[];
  credentials: Array<{ url: string; domain: string; username: string; type: string }>;
}

interface SearchResult {
  api_version: string;
  found: boolean;
  total_infections: number;
  total_credentials?: number;
  has_more?: boolean;
  results: StealerEntry[];
  generated_at: string;
  error?: string;
}

interface DomainOverview {
  domain: string;
  overview: {
    compromised_employees: number;
    compromised_users: number;
    last_employee_compromised?: string;
    last_user_compromised?: string;
  } | null;
  generated_at: string;
  error?: string;
}

interface AssessmentResult {
  domain: string;
  assessment: {
    employee_urls: Array<{ url: string; occurrence: number }>;
    third_party_urls: Array<{ url: string; occurrence: number; domain: string }>;
    user_urls: Array<{ url: string; occurrence: number }>;
  };
  generated_at: string;
  error?: string;
}

interface InfectionResult {
  stealer: string;
  analysis: {
    likely_infection_url: string;
    infection_confidence: number;
    infection_reasoning: string;
    infection_flow: Array<{ timestamp: string; url: string; notes: string }>;
    analyst_summary: string;
  };
  generated_at: string;
  error?: string;
}

function formatDate(s: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return s;
  }
}

function formatDateTime(s: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    employee: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    user: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    third_party: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    client: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${colors[type] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}
    >
      {type}
    </span>
  );
}

export default function InfostealerIntel(): JSX.Element {
  const [tab, setTab] = useState<TabId>('email');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Results
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [overviewResult, setOverviewResult] = useState<DomainOverview | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [infectionResult, setInfectionResult] = useState<InfectionResult | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const reset = useCallback(() => {
    setSearchResult(null);
    setOverviewResult(null);
    setAssessmentResult(null);
    setInfectionResult(null);
    setError(null);
  }, []);

  const handleTab = useCallback(
    (t: TabId) => {
      setTab(t);
      setQuery('');
      reset();
    },
    [reset]
  );

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    reset();
    try {
      let url = '';
      if (tab === 'email') url = `/api/v1/breach/hudsonrock?email=${encodeURIComponent(query.trim())}`;
      else if (tab === 'domain') url = `/api/v1/breach/hudsonrock/domain?domain=${encodeURIComponent(query.trim())}`;
      else if (tab === 'username') url = `/api/v1/hudsonrock/username?username=${encodeURIComponent(query.trim())}`;
      else if (tab === 'ip') url = `/api/v1/hudsonrock/ip?ip=${encodeURIComponent(query.trim())}`;
      else if (tab === 'overview')
        url = `/api/v1/hudsonrock/domain-overview?domain=${encodeURIComponent(query.trim())}`;
      else if (tab === 'infection')
        url = `/api/v1/hudsonrock/infection-analysis?stealer=${encodeURIComponent(query.trim())}`;

      const res = await fetch(url);
      if (!mountedRef.current) return;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!mountedRef.current) return;

      if (tab === 'overview') setOverviewResult(data as DomainOverview);
      else if (tab === 'infection') setInfectionResult(data as InfectionResult);
      else setSearchResult(data as SearchResult);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tab, query, reset]);

  const handleCopyJson = useCallback(() => {
    const data = tab === 'overview' ? overviewResult : tab === 'infection' ? infectionResult : searchResult;
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [tab, overviewResult, infectionResult, searchResult]);

  const currentTab = TABS.find((t) => t.id === tab)!;
  const Icon = currentTab.icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <BackLink to="/dfir" />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <KeyRound className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Infostealer Intelligence</h1>
            <p className="text-sm text-zinc-400">
              Hudson Rock Cavalier API — compromised credential & infection data from 30M+ infostealer-infected machines
            </p>
          </div>
        </div>

        {/* API key notice */}
        {!searchResult && !overviewResult && !infectionResult && !loading && !error && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6 text-sm text-zinc-400">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p>
                  This tool requires a <code className="text-amber-400">HUDSONROCK_API_KEY</code> secret. Set it with:
                </p>
                <code className="block mt-1 text-xs bg-zinc-800 px-2 py-1 rounded">
                  wrangler secret put HUDSONROCK_API_KEY
                </code>
                <p className="mt-1">
                  Free key:{' '}
                  <a
                    href="https://www.hudsonrock.com/free-api-key"
                    target="_blank"
                    rel="noopener"
                    className="text-amber-400 hover:underline"
                  >
                    hudsonrock.com/free-api-key
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map((t) => {
            const TIcon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => handleTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <TIcon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={currentTab.placeholder}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 bg-amber-500 text-black font-medium rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
          {(searchResult || overviewResult || infectionResult) && (
            <button
              onClick={handleCopyJson}
              className="px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-500 mb-4">{currentTab.description}</p>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400 mb-4">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Querying Hudson Rock...
          </div>
        )}

        {/* Search results (email / domain / username / ip) */}
        {!loading && searchResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              <span>
                API: <span className="text-zinc-200">{searchResult.api_version}</span>
              </span>
              <span>
                Infections: <span className="text-zinc-200">{searchResult.total_infections}</span>
              </span>
              {searchResult.total_credentials != null && (
                <span>
                  Credentials: <span className="text-zinc-200">{searchResult.total_credentials}</span>
                </span>
              )}
              {searchResult.has_more && <span className="text-amber-400">More results available</span>}
              <span className="ml-auto text-xs text-zinc-600">{formatDateTime(searchResult.generated_at)}</span>
            </div>

            {!searchResult.found && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                No infostealer compromises found.
              </div>
            )}

            {searchResult.results.map((entry, i) => (
              <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-amber-400 text-xs">{entry.stealer_family}</span>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-400">{formatDate(entry.date_compromised)}</span>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-400">{entry.ip}</span>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-400">{entry.computer_name}</span>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-500 text-xs">{entry.operating_system}</span>
                  {entry.employee_at?.length ? (
                    <>
                      <span className="text-zinc-500">|</span>
                      <span className="text-blue-400 text-xs">
                        <Building2 className="w-3 h-3 inline mr-0.5" />
                        {entry.employee_at.join(', ')}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {entry.credentials.map((cred, j) => (
                    <div key={j} className="px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
                      <TypeBadge type={cred.type} />
                      <span className="text-zinc-300 font-mono truncate max-w-[300px]" title={cred.url}>
                        {cred.url}
                      </span>
                      <span className="text-zinc-500">|</span>
                      <span className="text-zinc-400">{cred.domain}</span>
                      <span className="text-zinc-500">|</span>
                      <span className="text-zinc-500 font-mono">{cred.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Domain Overview */}
        {!loading && overviewResult && (
          <div className="space-y-4">
            {overviewResult.error ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                {overviewResult.error}
              </div>
            ) : overviewResult.overview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Compromised Employees"
                  value={overviewResult.overview.compromised_employees}
                  color="blue"
                />
                <StatCard label="Compromised Users" value={overviewResult.overview.compromised_users} color="emerald" />
                <StatCard
                  label="Last Employee Compromised"
                  value={formatDate(overviewResult.overview.last_employee_compromised ?? '')}
                  color="amber"
                  isText
                />
                <StatCard
                  label="Last User Compromised"
                  value={formatDate(overviewResult.overview.last_user_compromised ?? '')}
                  color="purple"
                  isText
                />
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                No overview data available for this domain.
              </div>
            )}
          </div>
        )}

        {/* Infection Analysis */}
        {!loading && infectionResult && (
          <div className="space-y-4">
            {infectionResult.error ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                {infectionResult.error}
              </div>
            ) : infectionResult.analysis ? (
              <div className="space-y-4">
                {/* Confidence + summary */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Shield className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">Infection Confidence</span>
                    <span
                      className={`text-lg font-bold ${infectionResult.analysis.infection_confidence >= 0.7 ? 'text-emerald-400' : infectionResult.analysis.infection_confidence >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}
                    >
                      {(infectionResult.analysis.infection_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 mb-2">{infectionResult.analysis.analyst_summary}</p>
                  <p className="text-xs text-zinc-500">
                    Likely source:{' '}
                    <a
                      href={infectionResult.analysis.likely_infection_url}
                      target="_blank"
                      rel="noopener"
                      className="text-amber-400 hover:underline break-all inline-flex items-center gap-1"
                    >
                      {infectionResult.analysis.likely_infection_url} <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>

                {/* Timeline */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-400" /> Infection Flow
                  </h3>
                  <div className="space-y-3">
                    {infectionResult.analysis.infection_flow.map((step, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                          {i < infectionResult.analysis.infection_flow.length - 1 && (
                            <div className="w-px flex-1 bg-zinc-700" />
                          )}
                        </div>
                        <div className="pb-3">
                          <div className="text-xs text-zinc-500 mb-0.5">{formatDateTime(step.timestamp)}</div>
                          <div className="text-amber-400 font-mono text-xs break-all">{step.url}</div>
                          <div className="text-zinc-400 text-xs mt-0.5">{step.notes}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                No infection analysis available for this stealer.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-zinc-800 text-xs text-zinc-600 flex items-center gap-2">
          <KeyRound className="w-3 h-3" />
          Powered by Hudson Rock Cavalier API v3
          <span className="mx-1">·</span>
          <a
            href="https://docs.hudsonrock.com/"
            target="_blank"
            rel="noopener"
            className="text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            API Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  isText,
}: {
  label: string;
  value: string | number;
  color: string;
  isText?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
  };
  const textMap: Record<string, string> = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
  };
  return (
    <div className={`border rounded-lg p-4 ${colorMap[color]}`}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textMap[color]} ${isText ? 'text-base' : ''}`}>{value}</div>
    </div>
  );
}
