import { useState, useRef, useCallback, useEffect } from 'react';
import { ExternalLink, Lock, User, Search, X, ArrowRight, Loader2 } from 'lucide-react';

const TM = {
  bg: '#0d1117',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.1)',
  borderLight: 'rgba(255,255,255,0.06)',
  red: '#ed3726',
  blue: '#60a5fa',
  green: '#4cd964',
  purple: '#A78BFA',
  orange: '#ff9800',
  rose: '#ff365d',
  text: '#ffffff',
  muted: '#aab4c0',
  dim: '#6f7d8c',
  dimmer: '#465260',
};

const STATS = [
  { value: '~2.18B', label: 'Compromised Users', color: TM.blue },
  { value: '~10.47B', label: 'Leaked Credentials', color: TM.green },
  { value: '~4.09B', label: 'Infected Devices', color: TM.purple },
  { value: '~357.81M', label: 'Affected Services', color: TM.rose },
  { value: '~813.65M', label: 'Compromised IPs', color: TM.orange },
];

interface InfostealerRecord {
  id: number;
  domain: string;
  url: string;
  ip: string;
  username: string;
  date: string;
  isEmployee: boolean;
}

interface SearchState {
  loading: boolean;
  records: InfostealerRecord[];
  totalCount: number;
  error: string | null;
}

const INITIAL: SearchState = { loading: false, records: [], totalCount: 0, error: null };

function mask(s: string, keep = 6): string {
  if (!s || s.length <= keep) return s;
  return s.slice(0, keep) + '*'.repeat(Math.min(s.length - keep, 12));
}

function formatDate(d: string): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : d;
}

export default function ThreatMonInfostealer() {
  const [domain, setDomain] = useState('');
  const [scope] = useState<'company' | 'third-party'>('company');
  const [state, setState] = useState<SearchState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (d: string, s: 'company' | 'third-party') => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ loading: true, records: [], totalCount: 0, error: null });
    setSubmitted(true);
    try {
      const res = await fetch(`/api/v1/threatmon/infostealer?domain=${encodeURIComponent(d)}&scope=${s}`, {
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (data.diagnostics?.[0]?.status === 'failed' && data.diagnostics[0].error?.includes('Cloudflare')) {
        setState({ loading: false, records: [], totalCount: 0, error: 'cf_blocked' });
        return;
      }
      setState({
        loading: false,
        records: data.records ?? [],
        totalCount: data.totalCount ?? 0,
        error: null,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setState({ loading: false, records: [], totalCount: 0, error: String(e) });
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = domain.trim();
    if (t.length >= 2) doSearch(t, scope);
  };

  const openThreatMon = () => window.open('https://intelhub.threatmon.io/infostealer-investigation', '_blank', 'noopener,noreferrer');

  return (
    <div style={{ background: TM.bg, minHeight: '100vh', color: TM.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill={TM.red} opacity="0.8"/>
              <circle cx="12" cy="12" r="10" stroke={TM.red} strokeWidth="1.5" fill="none"/>
            </svg>
            <span>Infostealer Investigation</span>
          </div>
          <p style={{ fontSize: 14, fontWeight: 300, color: TM.muted, lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
            Search stolen credentials, infected devices, and exposed identities linked to your domain using ThreatMon's Infostealer Intelligence platform.
          </p>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', border: `1px solid ${TM.border}`, borderRadius: 12, overflow: 'hidden', background: TM.card, backdropFilter: 'blur(12px)', marginBottom: 48 }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderRight: i < STATS.length - 1 ? `1px solid ${TM.borderLight}` : 'none' }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: s.color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.4px' }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: TM.dimmer, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4, minHeight: 28 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search box */}
        <div style={{ position: 'relative', marginBottom: submitted ? 40 : 120 }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: `1px solid ${TM.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
            <div style={{ padding: '0 14px', height: 52, display: 'flex', alignItems: 'center', color: TM.dim, flexShrink: 0 }}>
              <Search size={20} />
            </div>
            <input
              autoFocus
              value={domain}
              onChange={(e) => { setDomain(e.target.value); if (!e.target.value.trim()) { setState(INITIAL); setSubmitted(false); } }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              placeholder="Enter a domain to search"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TM.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 14.5, padding: '14px 0' }}
            />
            {state.loading ? (
              <div style={{ padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', color: TM.red }}>
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : submitted && !state.loading ? (
              <div onClick={() => { setDomain(''); setState(INITIAL); setSubmitted(false); }} style={{ padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', color: TM.dim, cursor: 'pointer' }} role="button" aria-label="Clear">
                <X size={18} />
              </div>
            ) : (
              <div onClick={handleSubmit} style={{ padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', color: TM.text, cursor: 'pointer', background: TM.red, borderRadius: '0 12px 12px 0' }} role="button" aria-label="Search">
                <ArrowRight size={20} />
              </div>
            )}
          </div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, marginTop: 8 }}>
            {['StealerLogs', 'CredentialExposure', 'MalwareIntelligence'].map(t => (
              <span key={t} style={{ fontSize: 11, color: TM.dimmer, letterSpacing: '0.07em' }}>#{t}</span>
            ))}
          </div>
        </div>

        {/* CF blocked → deep-link */}
        {state.error === 'cf_blocked' && (
          <div style={{ textAlign: 'center', padding: '48px 24px', border: `1px solid ${TM.border}`, borderRadius: 12, background: TM.card, backdropFilter: 'blur(12px)', marginBottom: 40 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: TM.text, marginBottom: 8 }}>Search on ThreatMon directly</div>
            <div style={{ fontSize: 13, fontWeight: 300, color: TM.muted, marginBottom: 24, lineHeight: 1.6 }}>
              ThreatMon IntelHub requires browser-side access. Click below to search on their platform.
            </div>
            <button onClick={openThreatMon} style={{ padding: '10px 24px', borderRadius: 8, background: TM.red, color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: `0 6px 20px -4px ${TM.red}60` }}>
              Open ThreatMon IntelHub <ExternalLink size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
            </button>
          </div>
        )}

        {/* Results */}
        {submitted && !state.loading && state.error !== 'cf_blocked' && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontWeight: 300, color: TM.muted, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Results for "<span style={{ color: TM.text, fontWeight: 500 }}>{domain}</span>"
            </div>
            {state.records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px', border: `1px solid ${TM.border}`, borderRadius: 12, background: TM.card, backdropFilter: 'blur(12px)' }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: TM.text }}>No matches found</div>
                <div style={{ fontSize: 13, fontWeight: 300, color: TM.muted }}>No records for <span style={{ color: TM.blue }}>{domain}</span> in the dataset.</div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${TM.border}`, borderRadius: 12, overflow: 'hidden', background: TM.card, backdropFilter: 'blur(12px)' }}>
                {state.records.map((r, i) => (
                  <div key={`${r.id}-${i}`} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottom: `1px solid ${TM.borderLight}`, background: 'rgba(0,0,0,0.08)' }}>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TM.blue, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{r.url || '—'}</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: r.isEmployee ? TM.rose : TM.dim, fontWeight: r.isEmployee ? 600 : 500, marginTop: 4 }}>
                        <User size={12} /> {r.isEmployee ? 'Employee' : 'User'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '120px 120px', gap: '8px 20px', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: TM.dim, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Lock size={12} /> {mask(r.ip, 8)}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: TM.dim, fontFamily: "'JetBrains Mono', monospace", justifyContent: 'flex-end' }}>
                        {mask(r.username, 6)}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: TM.dim, fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatDate(r.date)}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: TM.dim, fontFamily: "'JetBrains Mono', monospace", justifyContent: 'flex-end' }}>
                        *****
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Center */}
        <div style={{ borderTop: `1px solid ${TM.borderLight}`, paddingTop: 48, paddingBottom: 48, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TM.dimmer, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Action Center</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: TM.text, marginBottom: 40, letterSpacing: '-0.3px' }}>What You Need to Know</div>
          <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { title: 'Understand the Threat', color: TM.blue, bullets: [], paras: ['Infostealer malware silently harvests credentials, session cookies, browser autofill data, and crypto-wallet details from infected devices.', 'These logs routinely expose corporate email/password pairs, live VPN and SSO sessions, and SaaS access.'] },
              { title: 'Assess Your Exposure', color: TM.green, bullets: ['Employee and administrator credentials', 'Active session / cookie hijacking risk', 'VPN and SSO access', 'Third-party SaaS logins', 'Credential reuse across services'] },
              { title: 'Take Action', color: TM.rose, bullets: ['Resetting exposed credentials immediately', 'Invalidating active sessions and tokens', 'Enforcing MFA on every account', 'Scanning and reimaging infected endpoints', 'Monitoring for credential reuse'] },
              { title: 'ThreatMon Intelligence', color: TM.purple, bullets: ['Newly leaked corporate credentials', 'Infected devices linked to your domain', 'Exposed sessions and access tokens', 'The malware families behind each log', 'Actionable indicators for incident response'] },
            ].map((item, idx) => (
              <details key={idx} style={{ border: `1px solid ${TM.border}`, borderRadius: 12, overflow: 'hidden', background: TM.card, backdropFilter: 'blur(12px)' }}>
                <summary style={{ padding: 12, cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{item.title}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6, transition: 'transform 0.25s' }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </summary>
                <div style={{ padding: '0 24px 16px', paddingLeft: 32 }}>
                  {item.paras?.map((p, i) => <p key={i} style={{ fontSize: 14, fontWeight: 300, color: TM.muted, lineHeight: 1.75, marginBottom: 16 }}>{p}</p>)}
                  {item.bullets.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, marginTop: 8, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 300, color: TM.muted, lineHeight: 1.6 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${TM.borderLight}`, paddingTop: 20, paddingBottom: 28, textAlign: 'center', fontSize: 14, fontWeight: 300, color: TM.dim }}>
          Powered by <a href="https://threatmon.io" target="_blank" rel="noopener noreferrer" style={{ color: TM.blue, textDecoration: 'none' }}>ThreatMon</a> IntelHub · Data from ~2.18B compromised users
        </div>
      </div>
    </div>
  );
}
