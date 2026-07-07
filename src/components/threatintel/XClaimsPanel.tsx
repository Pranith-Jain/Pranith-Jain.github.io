import { useEffect, useState } from 'react';
import { ShieldAlert, Database, ExternalLink, Loader2, Globe } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { fetchJsonOrNull } from '../../lib/fetch-helpers';

/**
 * Structured ransomware + breach claims parsed from the threat-intel X
 * channels (FalconFeeds.io, @DailyDarkWeb, …) by /api/v1/x-claims. Ransomware
 * claims also flow into the merged ransomware-live feed; this panel surfaces
 * BOTH categories on x-watch so the free-text posts are readable as triaged
 * claims, not just a raw timeline.
 */

interface RansomwareClaim {
  victim: string;
  group: string;
  discovered: string;
  source_url: string;
  country?: string;
  sector?: string;
}
interface BreachClaim {
  victim?: string;
  country?: string;
  text: string;
  source_url: string;
  discovered: string;
  handle: string;
}
interface XClaimsResponse {
  generated_at: string;
  handles: string[];
  ransomware: RansomwareClaim[];
  breach: BreachClaim[];
}

type Tab = 'ransomware' | 'breach';

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function XClaimsPanel() {
  const [data, setData] = useState<XClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ransomware');

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchJsonOrNull<XClaimsResponse>('/api/v1/x-claims');
      if (alive) {
        setData(res);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const ransomware = data?.ransomware ?? [];
  const breach = data?.breach ?? [];
  const hasAny = ransomware.length > 0 || breach.length > 0;

  // Nothing extracted (cold cache / rate-limited): stay quiet rather than show
  // an empty card — the firehose below is the page's primary content.
  if (!loading && !hasAny) return null;

  const tabBtn = (id: Tab, label: string, count: number, Icon: typeof ShieldAlert) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
        tab === id
          ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
          : 'border-slate-300/60 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400'
      }`}
    >
      <Icon size={12} /> {label} <span className="opacity-70">{count}</span>
    </button>
  );

  const rows = tab === 'ransomware' ? ransomware : breach;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white/60 dark:bg-[rgb(var(--surface-200)/0.4)] p-5 mb-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-base flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-500" /> Extracted claims
          </h2>
          <p className="text-mini font-mono text-slate-500 mt-0.5">
            Ransomware victim + breach claims parsed from FalconFeeds / @DailyDarkWeb posts. Heuristic — verify before
            use.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {tabBtn('ransomware', 'Ransomware', ransomware.length, ShieldAlert)}
          {tabBtn('breach', 'Breach', breach.length, Database)}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 py-4">
          <Loader2 size={12} className="animate-spin" /> loading claims…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs font-mono text-slate-500 py-3">No {tab} claims in the current window.</p>
      ) : (
        <ul className="divide-y divide-slate-200/70 dark:divide-slate-800">
          {tab === 'ransomware'
            ? ransomware.slice(0, 40).map((r, i) => (
                <li key={`${r.group}-${r.victim}-${i}`} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium break-words">{r.victim}</span>
                    <span className="ml-2 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300">
                      {r.group}
                    </span>
                    <span className="block text-mini font-mono text-slate-500 mt-0.5">
                      {r.country && (
                        <span className="inline-flex items-center gap-1 mr-2">
                          <Globe size={10} /> {r.country}
                        </span>
                      )}
                      {r.sector && r.sector !== 'Unknown' && <span className="mr-2">{r.sector}</span>}
                      {timeAgo(r.discovered)}
                    </span>
                  </div>
                  <a
                    href={sanitizeUrl(r.source_url)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="shrink-0 text-slate-400 hover:text-brand-500"
                    aria-label="source post"
                  >
                    <ExternalLink size={14} />
                  </a>
                </li>
              ))
            : breach.slice(0, 40).map((b, i) => (
                <li key={`${b.source_url}-${i}`} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium break-words">{b.victim ?? 'Unattributed breach claim'}</span>
                    <span className="block text-mini font-mono text-slate-500 mt-0.5">
                      {b.country && (
                        <span className="inline-flex items-center gap-1 mr-2">
                          <Globe size={10} /> {b.country}
                        </span>
                      )}
                      <span className="mr-2">@{b.handle}</span>
                      {timeAgo(b.discovered)}
                    </span>
                    <p className="text-mini text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 break-words">
                      {b.text}
                    </p>
                  </div>
                  <a
                    href={sanitizeUrl(b.source_url)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="shrink-0 text-slate-400 hover:text-brand-500"
                    aria-label="source post"
                  >
                    <ExternalLink size={14} />
                  </a>
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}
