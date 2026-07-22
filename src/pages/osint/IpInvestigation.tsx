import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Server } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface IpResult {
  ip: string;
  country?: string;
  city?: string;
  region?: string;
  org?: string;
  asn?: string;
  isp?: string;
  abuseConfidence?: number;
  reports?: number;
  isTor?: boolean;
  openPorts?: number[];
  hostnames?: string[];
}

export default function IpInvestigation() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<IpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/host?ip=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setError('Lookup failed. Try a different IP.');
      }
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  };

  return (
    <>
      <PageMeta
        title="IP Investigation"
        description="Geolocation, ASN, reverse DNS, and abuse reports for IP addresses."
        canonicalPath="/osint/ip"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/osint"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-rose-600 flex items-center justify-center">
                <Server size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">IP Investigation</h1>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter IP address (e.g., 8.8.8.8)"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? 'Looking up...' : 'Investigate'}
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {error && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm mb-4">{error}</div>
          )}
          {loading && (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Server size={18} /> {result.ip}
                </h2>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  {result.country && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Country</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.country}</p>
                    </div>
                  )}
                  {result.city && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">City</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.city}</p>
                    </div>
                  )}
                  {result.org && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Organization</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.org}</p>
                    </div>
                  )}
                  {result.isp && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">ISP</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.isp}</p>
                    </div>
                  )}
                  {result.asn && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">ASN</label>
                      <p className="font-mono text-slate-700 dark:text-slate-300">{result.asn}</p>
                    </div>
                  )}
                  {result.abuseConfidence !== undefined && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Abuse Confidence</label>
                      <p
                        className={`font-mono font-bold ${result.abuseConfidence > 50 ? 'text-rose-600' : result.abuseConfidence > 20 ? 'text-amber-600' : 'text-emerald-600'}`}
                      >
                        {result.abuseConfidence}%
                      </p>
                    </div>
                  )}
                  {result.isTor !== undefined && (
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">Tor Exit Node</label>
                      <p className="text-slate-700 dark:text-slate-300">{result.isTor ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>
              {result.hostnames && result.hostnames.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Reverse DNS
                  </h3>
                  <div className="space-y-1">
                    {result.hostnames.map((h) => (
                      <p key={h} className="font-mono text-sm text-slate-700 dark:text-slate-300">
                        {h}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <a
                  href={`https://www.abuseipdb.com/check/${result.ip}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  AbuseIPDB <ExternalLink size={10} />
                </a>
                <a
                  href={`https://www.shodan.io/host/${result.ip}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  Shodan <ExternalLink size={10} />
                </a>
                <a
                  href={`https://virustotal.com/gui/ip-address/${result.ip}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  VirusTotal <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
