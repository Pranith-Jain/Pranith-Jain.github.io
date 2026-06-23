import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Radar, Globe, Shield, Code, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { RadarStructuredData } from '../../components/ToolStructuredData';
import { FaqStructuredData } from '../../components/FaqStructuredData';
import { PageMeta } from '../../components/PageMeta';
import { RADAR_FAQ } from '../../data/radar-faq';

export default function RadarHome() {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleScan = useCallback(async () => {
    const target = url.trim();
    if (!target) return;
    setError('');
    setScanning(true);

    try {
      const res = await fetch('/api/v1/radar/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      navigate(`/radar/scan/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [url, navigate]);

  return (
    <>
      <PageMeta
        title="Domain Recon Scanner"
        description="Free, browser-driven recon for any domain or URL: HTTP headers, redirect chains, server fingerprint, JavaScript inventory, exposed endpoints, security headers, and a 0-100 security score."
        canonicalPath="/radar"
      />
      <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 py-16">
        <RadarStructuredData />
        <FaqStructuredData entries={RADAR_FAQ} />
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/10">
              <Radar className="h-8 w-8 text-brand-600" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Domain Recon Scanner
            </h1>
            <p className="max-w-xl text-base text-slate-500 dark:text-slate-400">
              Enter any domain or URL to instantly analyze HTTP headers, technologies, JavaScript files, endpoints,
              security headers, and more.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder="Enter domain or URL (e.g., example.com)"
                className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-brand-400"
                disabled={scanning}
              />
            </div>
            <button
              onClick={handleScan}
              disabled={!url.trim() || scanning}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  Start Scan
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { Icon: Globe, label: 'DNS & WHOIS', desc: 'Resolved records and registrar data' },
              { Icon: Shield, label: 'Security Headers', desc: 'HSTS, CSP, X-Frame-Options' },
              { Icon: Code, label: 'JavaScript Files', desc: 'Enumerate scripts and endpoints' },
              { Icon: Lock, label: 'TLS & Certificate', desc: 'Issuer, expiry, and cipher suite' },
            ].map(({ Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]"
              >
                <Icon className="h-5 w-5 text-brand-500" />
                <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
