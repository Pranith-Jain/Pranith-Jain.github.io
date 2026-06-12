import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Globe, Shield, Lock, Server, ExternalLink, type LucideIcon } from 'lucide-react';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

interface SecurityCheck {
  header: string;
  present: boolean;
  value?: string;
  secure: boolean;
  recommendation: string;
}

interface TechFingerprint {
  category: string;
  name: string;
  confidence: number;
  evidence: string;
}

interface WebcheckResponse {
  domain: string;
  generated_at: string;
  http: {
    url: string;
    status: number;
    redirect_chain: string[];
    headers: Record<string, string>;
    response_time_ms: number;
    content_length: number;
    content_type: string;
  };
  tls: { protocol?: string; issuer?: string; self_signed?: boolean };
  security_headers: { score: number; grade: string; checks: SecurityCheck[] };
  technology: TechFingerprint[];
  ports: number[];
  shodan?: { ip?: string; org?: string; os?: string; vulns?: string[]; hostnames?: string[] };
}

const GRADE_COLOR: Record<string, string> = {
  'A+': 'text-emerald-400',
  A: 'text-emerald-400',
  B: 'text-sky-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

export default function DomainWebcheck(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('domain') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WebcheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const domain = input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!DOMAIN_RE.test(domain)) {
      setError('Invalid domain');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/v1/domain/webcheck?domain=${encodeURIComponent(domain)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <BackLink to="/dfir">
          <ArrowLeft size={14} /> Back to DFIR
        </BackLink>
        <h1 className="text-2xl font-bold mt-4 flex items-center gap-2">
          <Globe className="text-sky-500" /> Domain Web Check
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          HTTP probe · TLS inspection · Security headers audit · Technology fingerprinting · Open ports
        </p>

        <form onSubmit={handleSearch} className="mt-6 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter domain (e.g. github.com)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Search size={14} /> {loading ? 'Scanning…' : 'Scan'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            {/* HTTP + TLS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="HTTP Status" value={String(result.http.status)} sub={`${result.http.response_time_ms}ms`} />
              <Card label="TLS" value={result.tls.protocol ?? 'N/A'} sub={result.tls.issuer ?? ''} />
              <Card
                label="Security Score"
                value={`${result.security_headers.score}/100`}
                valueClass={GRADE_COLOR[result.security_headers.grade] ?? 'text-slate-300'}
                sub={`Grade: ${result.security_headers.grade}`}
              />
              <Card label="Open Ports" value={result.ports.length ? result.ports.join(', ') : 'None detected'} />
            </div>

            {/* Security Headers */}
            <Section title="Security Headers" icon={Shield}>
              <div className="space-y-1.5">
                {result.security_headers.checks.map((ch) => (
                  <div key={ch.header} className="flex items-center gap-2 text-sm">
                    <span className={ch.secure ? 'text-emerald-400' : ch.present ? 'text-amber-400' : 'text-red-400'}>
                      {ch.secure ? '✓' : ch.present ? '⚠' : '✗'}
                    </span>
                    <span className="font-mono text-xs w-48 truncate">{ch.header}</span>
                    <span className="text-slate-500 text-xs flex-1">
                      {ch.present ? (ch.value?.slice(0, 60) ?? 'present') : 'MISSING'}
                    </span>
                    {!ch.secure && ch.recommendation && (
                      <span className="text-xs text-slate-400 hidden md:block max-w-xs truncate">
                        {ch.recommendation}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {/* Technology */}
            {result.technology.length > 0 && (
              <Section title="Technology Stack" icon={Server}>
                <div className="flex flex-wrap gap-2">
                  {result.technology.map((t, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <span className="text-slate-400">{t.category}:</span> {t.name}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Shodan */}
            {result.shodan && (
              <Section title="Shodan Intelligence" icon={Lock}>
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-slate-400">IP:</span> {result.shodan.ip}
                  </div>
                  <div>
                    <span className="text-slate-400">Org:</span> {result.shodan.org}
                  </div>
                  <div>
                    <span className="text-slate-400">OS:</span> {result.shodan.os}
                  </div>
                  {result.shodan.vulns && result.shodan.vulns.length > 0 && (
                    <div>
                      <span className="text-slate-400">Vulns:</span> {result.shodan.vulns.join(', ')}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Redirect Chain */}
            {result.http.redirect_chain.length > 0 && (
              <Section title="Redirect Chain" icon={ExternalLink}>
                <div className="text-xs font-mono space-y-0.5">
                  {result.http.redirect_chain.map((url, i) => (
                    <div key={i} className="text-slate-500">
                      {url}
                    </div>
                  ))}
                  <div className="text-slate-300">{result.http.url}</div>
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, valueClass, sub }: { label: string; value: string; valueClass?: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${valueClass ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Icon size={14} className="text-sky-400" /> {title}
      </h3>
      {children}
    </div>
  );
}
