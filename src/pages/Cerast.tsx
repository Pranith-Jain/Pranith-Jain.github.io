import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { Globe, Loader2 } from 'lucide-react';

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

interface CerastResult {
  domain: string;
  path: string;
  category: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  page_rank: number;
  version: string;
  created: string;
  multihost: boolean;
}

interface CerastResponse {
  query: string;
  results: CerastResult[];
  count: number;
  limited: boolean;
  diagnostics: Array<{ provider: string; status: string; ms: number; error?: string }>;
}

const IMPACT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  HIGH: { bg: 'rgba(255,54,93,0.12)', color: TM.rose, border: 'rgba(255,54,93,0.4)' },
  MEDIUM: { bg: 'rgba(245,165,36,0.12)', color: TM.orange, border: 'rgba(245,165,36,0.4)' },
  LOW: { bg: 'rgba(100,116,139,0.12)', color: TM.dim, border: 'rgba(100,116,139,0.3)' },
};
const DEFAULT_IMPACT = IMPACT_STYLES.LOW;

function fmtDate(s: string): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return s;
  }
}

export default function Cerast() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, loading, error } = useDataFetch<CerastResponse>({
    url: submitted ? `/api/v1/cerast/search?q=${encodeURIComponent(submitted)}` : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length >= 3) setSubmitted(trimmed);
  };

  return (
    <div style={{ background: TM.bg, minHeight: '100vh', color: TM.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6 }}>
          <Globe size={32} style={{ color: TM.red, flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Cerast <span style={{ color: TM.muted, fontWeight: 500 }}>Intelligence</span>
            </h1>
          </div>
          <span style={{ marginLeft: 4, color: TM.rose, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', padding: '3px 9px', border: `1px solid ${TM.rose}80`, borderRadius: 999, background: `${TM.rose}1f` }}>
            domain search
          </span>
        </div>
        <p style={{ color: TM.muted, fontSize: 13.5, margin: '0 0 24px', maxWidth: 620 }}>
          Search observed domains for exposed paths and misconfigurations.
        </p>

        {/* Search form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${TM.border}`, borderRadius: 10, padding: '0 15px', transition: 'border-color 0.15s' }}>
            <span style={{ color: TM.red, fontFamily: "'JetBrains Mono', monospace", userSelect: 'none' }}>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="domain contains…"
              minLength={3}
              autoFocus
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TM.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 14.5, padding: '14px 0' }}
            />
          </div>
          <button type="submit" disabled={query.trim().length < 3 || loading} style={{ background: TM.red, color: '#fff', border: 'none', borderRadius: 10, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14, padding: '0 26px', cursor: 'pointer', boxShadow: `0 6px 18px -6px ${TM.red}80`, opacity: loading || query.trim().length < 3 ? 0.5 : 1 }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'search'}
          </button>
        </form>
        <p style={{ color: TM.muted, fontSize: 12.5, margin: '12px 2px 20px' }}>
          Substring search over the domain, case-insensitive, at least 3 characters. E.g. <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>staging.</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>.org</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>test-</code>.
        </p>

        {/* Meta */}
        <div style={{ color: TM.muted, fontSize: 12.5, margin: '20px 2px 10px', minHeight: 16 }}>
          {error && <span style={{ color: TM.rose }}>{error}</span>}
          {data && (
            data.limited
              ? <><b style={{ color: TM.text }}>{data.count.toLocaleString()}+</b> matches · showing latest {data.results.length} · refine to narrow</>
              : <><b style={{ color: TM.text }}>{data.count.toLocaleString()}</b> match{data.count === 1 ? '' : 'es'}</>
          )}
        </div>

        {/* Results table */}
        {data && data.results.length > 0 && (
          <div style={{ border: `1px solid ${TM.borderLight}`, borderRadius: 12, overflow: 'hidden', background: '#ffffff05' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}`, position: 'sticky', top: 0 }}>domain</th>
                  <th style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}` }}>path</th>
                  <th style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}` }}>category</th>
                  <th style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}` }}>impact</th>
                  <th style={{ textAlign: 'right', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}` }}>score</th>
                  <th style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: TM.muted, fontWeight: 600, padding: '11px 15px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${TM.border}` }}>first seen</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r, i) => {
                  const imp = IMPACT_STYLES[r.impact] ?? DEFAULT_IMPACT;
                  return (
                    <tr key={`${r.domain}-${r.path}-${i}`} style={{ borderBottom: `1px solid ${TM.borderLight}` }}>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top' }}>
                        <span style={{ color: TM.text, wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, opacity: r.multihost ? 0.55 : 1 }}>{r.domain}</span>
                        {r.multihost && <span style={{ display: 'inline-block', marginLeft: 6, padding: '1px 7px', borderRadius: 999, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, color: TM.muted, border: `1px dashed ${TM.dim}`, verticalAlign: 'middle', cursor: 'help' }} title="Shared/wildcard infrastructure">multihost</span>}
                      </td>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top' }}>
                        {r.path && r.path !== '/' ? (
                          <a href={`https://${r.domain}${r.path}`} target="_blank" rel="noopener noreferrer" style={{ color: TM.rose, textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, wordBreak: 'break-all' }}>
                            {r.path}
                          </a>
                        ) : <span style={{ opacity: 0.5, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>/</span>}
                      </td>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top' }}>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.04)', color: TM.muted, border: `1px solid ${TM.border}` }}>{r.category}</span>
                      </td>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top' }}>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: imp.bg, color: imp.color, border: `1px solid ${imp.border}` }}>{r.impact}</span>
                      </td>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                        {r.page_rank > 0 ? r.page_rank.toFixed(1) : <span style={{ color: TM.muted, opacity: 0.5 }}>–</span>}
                      </td>
                      <td style={{ padding: '10px 15px', verticalAlign: 'top', color: TM.muted, fontSize: 12, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtDate(r.created)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.results.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: TM.muted }}>No results.</div>
        )}

        {/* Diagnostics */}
        {data && data.diagnostics.length > 0 && (
          <div style={{ color: TM.muted, fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
            {data.diagnostics.map((d, i) => (
              <div key={i}>{d.provider}: {d.status} ({d.ms}ms){d.error ? ` — ${d.error}` : ''}</div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 44, paddingTop: 18, borderTop: `1px solid ${TM.borderLight}`, color: TM.muted, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 20px', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cerast Intelligence</span>
          <span>Responsible use only · <a href="https://cerast-intelligence.com" target="_blank" rel="noopener noreferrer" style={{ color: TM.rose, textDecoration: 'none' }}>cerast-intelligence.com</a></span>
        </div>
      </div>
    </div>
  );
}
