import { useState } from 'react';
import { Search, AlertTriangle, Shield, Globe, FileText, Activity, ExternalLink, Loader2 } from 'lucide-react';

interface ProviderHit {
  source: string;
  verdict: string;
  score: number;
  description: string;
}

interface TelegramHit {
  channel: string;
  message: string;
  date: string;
}

interface BreachHit {
  name: string;
  source: string;
  breach_date?: string;
  data_classes?: string[];
  description?: string;
}

interface HuntV2Result {
  q: string;
  type: string;
  ioc_providers: { hits: ProviderHit[]; malicious_count: number; max_score: number };
  telegram_leaks: { hits: TelegramHit[]; count: number };
  breach_data: { hits: BreachHit[]; count: number };
  whois: Record<string, unknown> | null;
  cert_logs: { count: number; recent: string[] };
  composite: { score: number; verdict: string; confidence: string; summary: string[] };
}

const VERDICT_COLORS: Record<string, string> = {
  malicious: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  suspicious: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  clean: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  unknown:
    'bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-muted border-slate-300 dark:border-[rgb(var(--border-400))]',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-slate-500 dark:text-slate-400',
};

export default function ThreatHunt(): JSX.Element {
  const [query, setQuery] = useState('');
  const [hunting, setHunting] = useState(false);
  const [result, setResult] = useState<HuntV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doHunt = async () => {
    const q = query.trim();
    if (!q || q.length < 3) return;
    setHunting(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/hunt/v2?q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      setResult((await r.json()) as HuntV2Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hunt failed');
    }
    setHunting(false);
  };

  const c = result?.composite;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Search size={28} className="text-brand-600 dark:text-brand-400" /> Threat Hunt
        </h1>
        <p className="text-muted mt-2 max-w-2xl">
          Deep-dive hunt across IOC providers, Telegram leaks, breach databases, WHOIS, and certificate logs.
        </p>
      </div>

      <div className="mb-8">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doHunt()}
            placeholder="IP, domain, email, or hash..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
          <button
            onClick={() => void doHunt()}
            disabled={hunting || query.length < 3}
            className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {hunting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Hunting...
              </>
            ) : (
              'Hunt'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4">
          <p className="text-sm font-mono text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && c && (
        <div className="animate-fade-in-up space-y-6">
          {/* Verdict banner */}
          <div className={`rounded-xl border p-5 ${VERDICT_COLORS[c.verdict]}`}>
            <div className="flex items-center gap-4 mb-3">
              <span className="text-xs font-mono px-2 py-1 rounded bg-white/20 text-inherit uppercase">
                {result.type}
              </span>
              <code className="text-sm font-mono font-semibold">{result.q}</code>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-mini font-mono opacity-70 mb-0.5">Verdict</p>
                <p className="text-xl font-bold font-display capitalize">{c.verdict}</p>
              </div>
              <div>
                <p className="text-mini font-mono opacity-70 mb-0.5">Score</p>
                <p className="text-xl font-bold font-display">{c.score}/100</p>
              </div>
              <div>
                <p className="text-mini font-mono opacity-70 mb-0.5">Confidence</p>
                <p className={`text-xl font-bold font-display capitalize ${CONFIDENCE_COLORS[c.confidence]}`}>
                  {c.confidence}
                </p>
              </div>
            </div>
            {c.summary.length > 0 && (
              <div className="mt-3 space-y-1">
                {c.summary.map((s) => (
                  <p key={s} className="text-xs font-mono opacity-80 flex items-center gap-2">
                    <Activity size={10} /> {s}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* IOC Providers */}
          <Section icon={<Shield size={14} />} title="IOC Providers" count={result.ioc_providers.hits.length}>
            {result.ioc_providers.hits.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 py-2">No IOC provider hits</p>
            ) : (
              <div className="space-y-1">
                {result.ioc_providers.hits.map((h) => (
                  <div
                    key={h.source}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded ${h.verdict === 'malicious' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}
                      >
                        {h.verdict}
                      </span>
                      <span className="text-xs font-mono font-medium">{h.source}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{h.score}/100</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Telegram Leaks */}
          <Section icon={<AlertTriangle size={14} />} title="Telegram Leaks" count={result.telegram_leaks.count}>
            {result.telegram_leaks.hits.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 py-2">No Telegram leak mentions</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {result.telegram_leaks.hits.map((h) => (
                  <div
                    key={`${h.channel}-${h.date}`}
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)]"
                  >
                    <p className="text-mini font-mono text-brand-600 dark:text-brand-400">{h.channel}</p>
                    <p className="text-xs font-mono text-muted mt-0.5 line-clamp-2">{h.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Breach Data */}
          <Section icon={<FileText size={14} />} title="Breach Databases" count={result.breach_data.count}>
            {result.breach_data.hits.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 py-2">No breach records found</p>
            ) : (
              <div className="space-y-1">
                {result.breach_data.hits.map((b) => (
                  <div key={b.name} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)]">
                    <p className="text-xs font-mono font-medium">{b.name}</p>
                    {b.description && <p className="text-mini font-mono text-slate-400 mt-0.5">{b.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* WHOIS */}
          {result.whois && (
            <Section icon={<Globe size={14} />} title="WHOIS / RDAP" count={0}>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.whois).map(([k, v]) => (
                  <div key={k} className="text-xs font-mono">
                    <span className="text-slate-500">{k.replace(/_/g, ' ')}: </span>
                    <span className="text-slate-800 dark:text-slate-200">{String(v).slice(0, 60)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Certificate Logs */}
          {result.cert_logs.count > 0 && (
            <Section icon={<FileText size={14} />} title="Certificate Transparency" count={result.cert_logs.count}>
              <div className="text-xs font-mono text-muted space-y-1">
                <p>{result.cert_logs.count} certificates found</p>
                {result.cert_logs.recent.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {result.cert_logs.recent.map((s) => (
                      <span
                        key={s}
                        className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Deep links */}
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href={`/dfir/ioc-check?indicator=${encodeURIComponent(result.q)}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:border-brand-500/40 transition-colors"
            >
              <ExternalLink size={12} /> Full IOC Check (39 providers)
            </a>
            <a
              href={`/dfir/breach?q=${encodeURIComponent(result.q)}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:border-brand-500/40 transition-colors"
            >
              <ExternalLink size={12} /> Breach Deep Dive
            </a>
          </div>
        </div>
      )}

      {!result && !hunting && !error && (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          <Search size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-mono">Enter an IP, domain, email, or hash to start hunting</p>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: JSX.Element;
  title: string;
  count: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
        {icon} {title} {count > 0 && <span className="text-xs font-mono text-slate-500">({count})</span>}
      </h2>
      {children}
    </div>
  );
}
