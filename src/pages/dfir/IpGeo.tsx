import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Globe2,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  MapPin,
  Building,
  Network,
  Clock,
} from 'lucide-react';
interface IpGeoResponse {
  ip: string;
  detected_kind: 'ipv4' | 'ipv6';
  geo: {
    ok: boolean;
    error?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    zip?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    isp?: string;
    org?: string;
    asn?: string;
    asname?: string;
    reverse_dns?: string;
    is_proxy?: boolean;
    is_hosting?: boolean;
    is_mobile?: boolean;
    source: string;
    source_url: string;
  };
  reputation: {
    ok: boolean;
    error?: string;
    confidence?: number;
    total_reports?: number;
    usage_type?: string;
    verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
    source: string;
    source_url: string;
  };
  generated_at: string;
}

const SAMPLES: { label: string; ip: string }[] = [
  { label: 'Google DNS', ip: '8.8.8.8' },
  { label: 'Cloudflare DNS', ip: '1.1.1.1' },
  { label: 'AWS edge', ip: '52.84.150.1' },
  { label: 'Tor exit', ip: '185.220.101.1' },
];

const RE_IP = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$|^[0-9a-fA-F:]+$/;

function verdictPill(v?: string): string {
  switch (v) {
    case 'malicious':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'suspicious':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'clean':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    default:
      return 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400';
  }
}

export default function IpGeo(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ip, setIp] = useState(searchParams.get('ip') ?? '');
  const [data, setData] = useState<IpGeoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDone = useRef(false);

  const lookup = async (override?: string) => {
    const t = (override ?? ip).trim();
    if (!t || !RE_IP.test(t)) {
      setError('Enter a valid IPv4 or IPv6 address');
      return;
    }
    if (override) setIp(override);
    setLoading(true);
    setError(null);
    setData(null);
    setSearchParams({ ip: t }, { replace: false });
    try {
      const res = await fetch(`/api/v1/ip-geo?ip=${encodeURIComponent(t)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as IpGeoResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialDone.current) return;
    const initial = searchParams.get('ip');
    if (initial && RE_IP.test(initial)) {
      initialDone.current = true;
      void lookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe2 size={28} className="text-brand-600 dark:text-brand-400" /> IP Geolocation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2">
          Country, ASN, hosting provider, reverse DNS, proxy/mobile/hosting flags — composed from{' '}
          <a
            href="https://ip-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ip-api.com
          </a>{' '}
          (free, no key) plus AbuseIPDB confidence + report count for reputation.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/asn" className="text-brand-600 dark:text-brand-400 hover:underline">
            ASN Lookup
          </Link>{' '}
          for BGP/prefix data and{' '}
          <Link to="/dfir/ioc-check" className="text-brand-600 dark:text-brand-400 hover:underline">
            IOC Checker
          </Link>{' '}
          for full multi-provider scoring.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="Enter IPv4 or IPv6 — e.g. 8.8.8.8 or 2606:4700:4700::1111"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !ip.trim()}
              className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'looking up…' : 'lookup'}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 self-center mr-1">samples:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.ip}
              type="button"
              onClick={() => void lookup(s.ip)}
              className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Address
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                {data.detected_kind}
              </span>
            </div>
            <code className="block font-mono text-sm text-slate-900 dark:text-slate-100 break-all bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-2">
              {data.ip}
            </code>
            {data.geo.ok && data.geo.reverse_dns && (
              <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 mt-2">
                reverse: <span className="text-slate-900 dark:text-slate-100">{data.geo.reverse_dns}</span>
              </p>
            )}
          </section>

          {/* Reputation banner */}
          <section
            className={`rounded-lg border-2 p-4 mb-6 ${
              data.reputation.ok && data.reputation.verdict === 'malicious'
                ? 'border-rose-500/60 bg-rose-500/10'
                : data.reputation.ok && data.reputation.verdict === 'suspicious'
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : data.reputation.ok && data.reputation.verdict === 'clean'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2">
                <ShieldAlert size={12} /> Reputation
              </h2>
              {data.reputation.ok && data.reputation.verdict && (
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${verdictPill(data.reputation.verdict)}`}
                >
                  {data.reputation.verdict}
                </span>
              )}
            </div>
            {data.reputation.ok ? (
              <div className="grid sm:grid-cols-3 gap-3 mt-2">
                <div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">AbuseIPDB confidence</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {data.reputation.confidence ?? 0}
                    <span className="text-sm font-normal text-slate-500"> / 100</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">Total reports (90d)</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {data.reputation.total_reports ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500">Usage type</div>
                  <div className="text-base font-mono text-slate-900 dark:text-slate-100">
                    {data.reputation.usage_type ?? '—'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] font-mono text-slate-500 dark:text-slate-500 inline-flex items-center gap-2">
                <CheckCircle2 size={12} /> {data.reputation.error}
              </p>
            )}
            <a
              href={data.reputation.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 mt-3"
            >
              full report on {data.reputation.source} <ExternalLink size={10} />
            </a>
          </section>

          {/* Geolocation */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
              <MapPin size={12} /> Geolocation & network
            </h2>
            {data.geo.ok ? (
              <>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500">Country</span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {data.geo.country ?? '—'} {data.geo.country_code && `(${data.geo.country_code})`}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500">Region / city</span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {[data.geo.region, data.geo.city].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500 inline-flex items-center gap-1">
                      <Clock size={10} /> Timezone
                    </span>
                    <span className="text-slate-900 dark:text-slate-100">{data.geo.timezone ?? '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500">Coordinates</span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {data.geo.lat !== undefined && data.geo.lon !== undefined ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${data.geo.lat}&mlon=${data.geo.lon}#map=8/${data.geo.lat}/${data.geo.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                        >
                          {data.geo.lat.toFixed(2)}, {data.geo.lon.toFixed(2)} <ExternalLink size={10} />
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500 inline-flex items-center gap-1">
                      <Building size={10} /> ISP
                    </span>
                    <span className="text-slate-900 dark:text-slate-100 text-right break-words">
                      {data.geo.isp ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1">
                    <span className="text-slate-500 dark:text-slate-500">Org</span>
                    <span className="text-slate-900 dark:text-slate-100 text-right break-words">
                      {data.geo.org ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 py-1 sm:col-span-2">
                    <span className="text-slate-500 dark:text-slate-500 inline-flex items-center gap-1">
                      <Network size={10} /> ASN
                    </span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {data.geo.asn ? (
                        // ip-api returns asn as "AS15169 Google LLC" — the ASN tool
                        // accepts that shape directly via its ?asn= prefill.
                        <Link
                          to={`/dfir/asn?asn=${encodeURIComponent(data.geo.asn)}`}
                          className="text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          {data.geo.asn} {data.geo.asname && `(${data.geo.asname})`}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-4">
                  {data.geo.is_hosting && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                      hosting
                    </span>
                  )}
                  {data.geo.is_proxy && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      proxy / VPN
                    </span>
                  )}
                  {data.geo.is_mobile && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                      mobile network
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm font-mono text-slate-500 dark:text-slate-500 inline-flex items-center gap-2">
                <AlertTriangle size={12} /> {data.geo.error}
              </p>
            )}
            <p className="text-[10px] font-mono text-slate-500 dark:text-slate-500 mt-3">
              Geo data via{' '}
              <a href={data.geo.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {data.geo.source}
              </a>{' '}
              · cached 1h at the edge · resolved {new Date(data.generated_at).toLocaleTimeString()}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
