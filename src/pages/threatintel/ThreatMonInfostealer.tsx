import { useState, useEffect } from 'react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';
import { PageMeta } from '../../components/PageMeta';
import { Search, Globe, Lock, User, ExternalLink, Loader2, AlertTriangle, Shield, Hash } from 'lucide-react';

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

const HASHTAGS = ['StealerLogs', 'CredentialExposure', 'MalwareIntelligence'];

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

  const openThreatMon = () =>
    window.open('https://intelhub.threatmon.io/infostealer-investigation', '_blank', 'noopener,noreferrer');

  const employeeCount = data?.records.filter((r) => r.isEmployee).length ?? 0;
  const userCount = data?.records.filter((r) => !r.isEmployee).length ?? 0;

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
              <div
                key={s.label}
                className="text-center p-3 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] hover:bg-[rgb(var(--surface-300))]/50 transition-colors"
              >
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
                onChange={(e) => {
                  setDomain(e.target.value);
                  if (!e.target.value.trim()) {
                    setSubmitted(false);
                    setCfBlocked(false);
                  }
                }}
                placeholder="Enter a domain to search"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-shadow"
                minLength={2}
              />
            </div>
            <button
              type="submit"
              disabled={domain.trim().length < 2 || loading}
              className="px-5 py-2.5 rounded-xl bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 disabled:opacity-50 transition-all inline-flex items-center gap-2 shadow-e1 hover:shadow-e1"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {/* Hashtags */}
          <div className="flex items-center gap-1.5">
            {HASHTAGS.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-[10px] font-mono text-muted"
              >
                <Hash className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
          </div>

          {/* CF blocked */}
          {cfBlocked && (
            <div className="text-center py-12 px-6 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))]">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="text-lg font-semibold text-foreground mb-2">Search on ThreatMon directly</div>
              <p className="text-sm text-muted mb-6 max-w-md mx-auto leading-relaxed">
                ThreatMon IntelHub is protected by Cloudflare managed challenge. Server-side API access is restricted —
                use their platform to search.
              </p>
              <button
                onClick={openThreatMon}
                className="px-6 py-2.5 rounded-xl bg-brand-600 dark:bg-brand-500 text-white font-semibold text-sm hover:brightness-110 transition-all inline-flex items-center gap-2 shadow-e1 hover:shadow-e1"
              >
                Open ThreatMon IntelHub <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Results */}
          {submitted && !loading && !cfBlocked && data && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center justify-between text-sm">
                <div className="text-muted">
                  <span className="font-semibold text-foreground">
                    {(data.totalCount ?? data.records.length).toLocaleString()}
                  </span>{' '}
                  record{(data.totalCount ?? 0) === 1 ? '' : 's'} found
                </div>
                {data.records.length > 0 && (
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    {employeeCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        {employeeCount} employee{employeeCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {userCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        {userCount} user{userCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Empty */}
              {data.records.length === 0 && (
                <div className="text-center py-14 text-muted text-sm border border-dashed border-[rgb(var(--border-400))] rounded-xl bg-[rgb(var(--surface-200))]">
                  <Shield className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  {data.totalCount === 0 ? (
                    <>
                      No compromised records found for "<span className="font-mono text-foreground">{domain}</span>".
                    </>
                  ) : (
                    'No records in current scope.'
                  )}
                </div>
              )}

              {/* Record cards */}
              {data.records.length > 0 && (
                <div className="space-y-1.5">
                  {data.records.map((r, i) => (
                    <div
                      key={`${r.id}-${i}`}
                      className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] hover:bg-[rgb(var(--surface-300))]/40 hover:border-[rgb(var(--border-500))] transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-brand-600 dark:text-brand-400 truncate group-hover:underline">
                          {r.url || '—'}
                        </div>
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
                      <div className="flex items-center gap-5 shrink-0 text-xs text-muted font-mono">
                        <span className="inline-flex items-center gap-1.5 min-w-[100px]">
                          <Lock className="h-3 w-3 text-foreground/40" /> {mask(r.ip, 8)}
                        </span>
                        <span className="min-w-[80px]">{mask(r.username, 6)}</span>
                        <span className="min-w-[70px] text-foreground/50">{fmtDate(r.date)}</span>
                        <span className="text-foreground/30 tracking-widest">*****</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* About */}
          <div className="mt-6 p-5 rounded-xl border border-[rgb(var(--border-400))] bg-[rgb(var(--surface-200))] text-xs text-muted space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <p className="font-semibold text-foreground text-sm">About ThreatMon Infostealer Intelligence</p>
            </div>
            <p className="leading-relaxed">
              ThreatMon continuously collects and processes infostealer malware logs from underground sources,
              correlating each one back to the affected organization. Their intelligence surfaces:
            </p>
            <ul className="space-y-1.5 ml-4">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" /> Newly leaked corporate credentials
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" /> Infected devices linked to your
                domain
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Exposed sessions and access tokens
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" /> The malware families behind each log
              </li>
            </ul>
            <p>
              <a
                href="https://intelhub.threatmon.io/infostealer-investigation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Open ThreatMon IntelHub <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </DataPageLayout>
    </>
  );
}
