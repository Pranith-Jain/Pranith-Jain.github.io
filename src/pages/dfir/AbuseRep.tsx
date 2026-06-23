import { useState } from 'react';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';

/**
 * Abuse reputation lookup — IP / email triage via Stop Forum Spam
 * (stopforumspam.org, free, no key). Crowdsourced abuse registry: how often
 * an address has been reported, last seen, tor-exit flag, and a confidence
 * score. A quick triage signal alongside the heavier IOC enrichments.
 */

interface AbuseResult {
  kind: 'ip' | 'email';
  value: string;
  generated_at: string;
  listed: boolean;
  appears: number;
  frequency: number;
  last_seen: string | null;
  confidence: number | null;
  tor_exit: boolean;
  asn: number | null;
  country: string | null;
}

export default function AbuseRep(): JSX.Element {
  const [input, setInput] = useState('');
  const [data, setData] = useState<AbuseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    const param = v.includes('@') ? `email=${encodeURIComponent(v.toLowerCase())}` : `ip=${encodeURIComponent(v)}`;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/v1/abuse-rep?${param}`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `lookup failed (${r.status})`);
      }
      setData((await r.json()) as AbuseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Abuse reputation
        </h1>
        <p className="text-muted mb-6 max-w-2xl leading-relaxed">
          Quick IP / email abuse triage via{' '}
          <a
            href="https://www.stopforumspam.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Stop Forum Spam
          </a>{' '}
          (free, no key) — report frequency, last-seen, tor-exit flag, and confidence.
        </p>
      </div>

      <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="IP address or email"
          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="IP or email"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />} look up
        </button>
      </form>

      <DataState loading={loading} error={error} empty={false} rows={4}>
        {data && (
          <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-sm break-all">{data.value}</span>
              <span
                className={`text-xs font-mono px-2.5 py-1 rounded border ${
                  data.listed
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {data.listed ? 'listed for abuse' : 'not listed'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'appears', value: data.appears.toLocaleString() },
                { label: 'frequency', value: data.frequency.toLocaleString() },
                { label: 'confidence', value: data.confidence != null ? `${data.confidence.toFixed(1)}%` : '—' },
                { label: 'last seen', value: data.last_seen ?? '—' },
                { label: 'country', value: data.country ?? '—' },
                { label: 'ASN', value: data.asn != null ? `AS${data.asn}` : '—' },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-0.5">{s.label}</div>
                  <div className="font-mono text-tool text-slate-800 dark:text-slate-200 break-all">{s.value}</div>
                </div>
              ))}
            </div>
            {data.tor_exit && (
              <div className="text-meta font-mono px-3 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                ⚠ Known Tor exit node.
              </div>
            )}
          </div>
        )}
      </DataState>
    </div>
  );
}
