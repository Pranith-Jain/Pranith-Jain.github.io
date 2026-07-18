import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

/**
 * Aggregate MITRE ATT&CK technique distribution across currently-active
 * ransomware groups. Pulls /api/v1/actor-timeline (cached 4h) so it's cheap
 * to embed on multiple pages — both /threatintel/actor-timeline (canonical)
 * and /threatintel/threat-map (where the user wanted MITRE distribution
 * surfaced alongside the geo view).
 *
 * Render contract is intentionally compact: a header + ranked bars + per-row
 * "used by" caption. No filters here — this is a read-only summary; the
 * actor-timeline page is the deep-dive.
 */

interface AggregateTechnique {
  id: string;
  name: string;
  tactic: string;
  used_by_count: number;
  used_by_groups: string[];
  weighted_activity: number;
}

interface ActorTimelineResponseSlim {
  generated_at: string;
  groups: Array<{ slug: string; mitre?: { id: string; name: string; url: string } }>;
  aggregate_techniques: AggregateTechnique[];
  groups_with_ttp_data: number;
}

export function ActorTtpsPanel({
  title = 'Aggregate TTPs across currently-active ransomware groups',
  subtitle,
  mbClass = 'mb-0',
}: {
  title?: string;
  subtitle?: string;
  mbClass?: string;
}): JSX.Element | null {
  const [data, setData] = useState<ActorTimelineResponseSlim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/v1/actor-timeline', { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<ActorTimelineResponseSlim>;
      })
      .then((d) => {
        setData(d);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
    return () => ac.abort();
  }, []);

  if (loading) {
    return (
      <section
        className={`${mbClass} surface-card p-5 inline-flex items-center gap-2 font-mono text-sm text-slate-500`}
      >
        <Loader2 size={14} className="animate-spin" /> loading TTP distribution from active actors…
      </section>
    );
  }

  if (error || !data) return null;
  if (data.aggregate_techniques.length === 0) return null;

  const mappedGroups = data.groups.filter((g) => g.mitre).length;
  const unmapped = data.groups.length - mappedGroups;
  const maxCount = data.aggregate_techniques[0]?.used_by_count || 1;

  return (
    <section className={`${mbClass} surface-card p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          <p className="text-mini font-mono text-slate-500 mt-1">
            {subtitle ??
              `MITRE ATT&CK techniques the ${data.groups_with_ttp_data} mapped active group${data.groups_with_ttp_data === 1 ? '' : 's'} ${data.groups_with_ttp_data === 1 ? 'is' : 'are'} known to use. Sort: number of active groups using each, then post-volume weight.`}
            {unmapped > 0 && (
              <>
                {' '}
                ({unmapped} active group{unmapped === 1 ? '' : 's'} not yet in MITRE. Coverage gap.)
              </>
            )}
          </p>
        </div>
        <a
          href="/threatintel/actor-timeline"
          className="text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
        >
          Per-actor timeline →
        </a>
      </div>
      <ul className="space-y-2.5">
        {data.aggregate_techniques.map((t) => {
          const widthPct = Math.max(5, (t.used_by_count / maxCount) * 100);
          return (
            <li key={t.id} className="text-meta font-mono">
              <div className="grid items-center gap-3" style={{ gridTemplateColumns: '180px 1fr 70px' }}>
                <a
                  href={`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-slate-700 dark:text-slate-300 truncate inline-flex items-center gap-1"
                  title={`${t.id} · ${t.name}`}
                >
                  <span className="text-brand-600 dark:text-brand-400">{t.id}</span>
                  <span className="truncate"> · {t.name}</span>
                  <ExternalLink size={9} className="text-slate-400 shrink-0" />
                </a>
                <div className="h-3 bg-slate-100 dark:bg-[rgb(var(--surface-200))] rounded overflow-hidden">
                  <div className="h-full bg-rose-500/70 dark:bg-rose-500/60" style={{ width: `${widthPct}%` }} />
                </div>
                <span className="text-muted text-right">
                  {t.used_by_count} grp · {t.weighted_activity}p
                </span>
              </div>
              <div className="text-micro text-slate-500 ml-[180px] mt-0.5">
                {t.tactic} · used by: {t.used_by_groups.join(', ')}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
