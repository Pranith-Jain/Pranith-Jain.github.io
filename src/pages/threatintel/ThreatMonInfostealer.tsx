import { useState, useEffect } from 'react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';
import { PageMeta } from '../../components/PageMeta';
import { Search, Globe, Lock, User, ExternalLink, Loader2 } from 'lucide-react';

interface InfostealerRecord {
  id: number;
  domain: string;
  url: string;
  ip: string;
  username: string;
  date: string;
  isEmployee: boolean;
}

interface ThreatMonResponse {
  query: string;
  scope: string;
  records: InfostealerRecord[];
  totalCount: number;
  diagnostics: Array<{ provider: string; status: string; ms: number; error?: string }>;
}

const STATS = [
  { value: '~2.18B', label: 'Compromised Users', color: 'text-blue-500 dark:text-blue-400' },
  { value: '~10.47B', label: 'Leaked Credentials', color: 'text-emerald-500 dark:text-emerald-400' },
  { value: '~4.09B', label: 'Infected Devices', color: 'text-purple-500 dark:text-purple-400' },
  { value: '~357.81M', label: 'Affected Services', color: 'text-rose-500 dark:text-rose-400' },
  { value: '~813.65M', label: 'Compromised IPs', color: 'text-amber-500 dark:text-amber-400' },
];

function mask(s: string, keep = 6): string {
  if (!s || s.length <= keep) return s;
  return s.slice(0, keep) + '*'.repeat(Math.min(s.length - keep, 12));
}

function fmtDate(d: string): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : d;
}

export default function ThreatMonInfostealer() {
  const [domain, setDomain] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [cfBlocked, setCfBlocked] = useState(false);

  const { data, loading } = useDataFetch<ThreatMonResponse>({
    url: submitted ? `/api/v1/threatmon/infostealer?domain=${encodeURIComponent(domain.trim())}` : null,
    ttl: 60_000,
  });

  useEffect(() => {
    if (data?.diagnostics?.[0]?.status === 'failed' && data.diagnostics[0].error?.includes('Cloudflare')) {
      setCfBlocked(true);
    }
  }, [data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = domain.trim();
    if (t.length >= 2) {
      setSubmitted(true);
      setCfBlocked(false);
    }
  };

  const openThreatMon = () => window.open('https://intelhub.threatmon.io/infostealer-investigation', '_blank', 'noopener,noreferrer');

  return (
    <>
      <PageMeta
        title="ThreatMon Infostealer"
        description="Search stolen credentials, infected devices, and exposed identities linked to a domain via ThreatMon Infostealer Intelligence."
        section="Threat Intel"
        canonicalPath="/threatintel/external/threatmon"
      />
      <DataPageLayout
        backTo="/threatintel/catalog"
        backLabel="Catalog"
        icon={<Globe size={28} />}
        title="ThreatMon Infostealer"
        description="Search for compromised credentials and infected devices linked to a domain via real stealer malware logs."
      >
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-2">
            {STATS.map((s) => (
              <div key={s.label} className="text-center p-2.5 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]">
                <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); if (!e.target.value.trim()) { setSubmitted(false); setCfBlocked(false); } }}
                placeholder="Enter a domain to search"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                minLength={2}
              />
            </div>
            <button
              type="submit"
              disabled={domain.trim().length < 2 || loading}
              className="px-5 py-2.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 disabled:opacity-50 transition inline-flex items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {/* CF blocked */}
          {cfBlocked && (
            <div className="text-center py-10 px-6 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]">
              <div className="text-lg font-semibold text-foreground mb-2">Search on ThreatMon directly</div>
              <p className="text-sm text-muted mb-5 max-w-md mx-auto">
                ThreatMon IntelHub requires browser-side access due to Cloudflare protection.
              </p>
              <button onClick={openThreatMon} className="px-5 py-2.5 rounded-lg bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 transition inline-flex items-center gap-2">
                Open ThreatMon IntelHub <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Results */}
          {submitted && !loading && !cfBlocked && data && (
            <div className="space-y-3">
              <div className="text-sm text-muted">
                <span className="font-semibold text-foreground">{(data.totalCount ?? data.records.length).toLocaleString()}</span> record{(data.totalCount ?? 0) === 1 ? '' : 's'} found
              </div>

              {data.records.length === 0 ? (
                <div className="text-center py-10 text-muted text-sm border border-[rgb(var(--border-400))] rounded-lg bg-[rgb(var(--surface-200))]">
                  {data.totalCount === 0 ? 'No compromised records found for this domain.' : 'No records in current scope.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.records.map((r, i) => (
                    <div
                      key={`${r.id}-${i}`}
                      className="flex items-center gap-4 p-3 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] hover:bg-[rgb(var(--surface-300))]/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-brand-600 dark:text-brand-400 truncate">{r.url || '—'}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {r.isEmployee ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 dark:text-rose-400 font-semibold">
                              <User className="h-3 w-3" /> Employee
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                              <User className="h-3 w-3" /> User
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-xs text-muted font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" /> {mask(r.ip, 8)}
                        </span>
                        <span>{mask(r.username, 6)}</span>
                        <span>{fmtDate(r.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="mt-4 p-4 rounded-lg border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-xs text-muted space-y-2">
            <p className="font-semibold text-foreground text-sm">About ThreatMon Infostealer Intelligence</p>
            <p>
              ThreatMon continuously collects and processes infostealer malware logs from underground sources,
              correlating each one back to the affected organization.
            </p>
            <ul className="space-y-1 ml-4">
              <li>Newly leaked corporate credentials</li>
              <li>Infected devices linked to your domain</li>
              <li>Exposed sessions and access tokens</li>
              <li>The malware families behind each log</li>
            </ul>
            <p>
              <a href="https://intelhub.threatmon.io/infostealer-investigation" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
                Open ThreatMon IntelHub <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </DataPageLayout>
    </>
  );
}
