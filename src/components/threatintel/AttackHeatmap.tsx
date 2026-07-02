import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

const TACTIC_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
  'other',
];

const tacticLabel = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

export function AttackHeatmap({
  title = 'ATT&CK technique heatmap',
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
    let cancelled = false;
    fetch('/api/v1/actor-timeline')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<ActorTimelineResponseSlim>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { byTactic, tacticKeys, maxCount, MAX_PER_TACTIC } = useMemo<{
    byTactic: Map<string, AggregateTechnique[]>;
    tacticKeys: string[];
    maxCount: number;
    MAX_PER_TACTIC: number;
  }>(() => {
    if (!data || data.aggregate_techniques.length === 0) {
      return { byTactic: new Map(), tacticKeys: [], maxCount: 0, MAX_PER_TACTIC: 5 };
    }
    const byTactic = new Map<string, AggregateTechnique[]>();
    for (const t of data.aggregate_techniques) {
      const list = byTactic.get(t.tactic) ?? [];
      list.push(t);
      byTactic.set(t.tactic, list);
    }

    const tacticSet = new Set(TACTIC_ORDER);
    const ordered = TACTIC_ORDER.filter((t) => byTactic.has(t));
    const extra = [...byTactic.keys()].filter((t) => !tacticSet.has(t)).sort();
    const tacticKeys = [...ordered, ...extra];

    for (const [, list] of byTactic) {
      list.sort((a, b) => b.used_by_count - a.used_by_count);
    }

    const maxCount = Math.max(...data.aggregate_techniques.map((t) => t.used_by_count), 1);
    const MAX_PER_TACTIC = 10;
    return { byTactic, tacticKeys, maxCount, MAX_PER_TACTIC };
  }, [data]);

  if (loading) {
    return (
      <section
        className={`${mbClass} rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5 inline-flex items-center gap-2 font-mono text-sm text-slate-500`}
      >
        <Loader2 size={14} className="animate-spin" /> loading ATT&CK technique heatmap…
      </section>
    );
  }

  if (error || !data) return null;
  if (data.aggregate_techniques.length === 0) return null;

  return (
    <section
      className={`${mbClass} rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5`}
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          <p className="text-mini font-mono text-slate-500 mt-1">
            {subtitle ??
              `MITRE ATT&CK techniques mapped to ${data.groups_with_ttp_data} active group${data.groups_with_ttp_data === 1 ? '' : 's'}. Columns = tactics (kill-chain order). Cell shade = prevalence.`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-4 min-w-max">
          {tacticKeys.map((tactic) => {
            const techniques = byTactic.get(tactic)!.slice(0, MAX_PER_TACTIC);
            return (
              <div key={tactic} className="flex flex-col" style={{ minWidth: 120, maxWidth: 150 }}>
                <div
                  className="text-micro font-mono font-semibold text-muted uppercase tracking-wider mb-2 px-1.5 truncate"
                  title={tacticLabel(tactic)}
                >
                  {tacticLabel(tactic)}
                </div>
                <div className="flex flex-col gap-1">
                  {techniques.map((t) => {
                    const intensity = t.used_by_count / maxCount;
                    const bg = `rgba(244, 63, 94, ${0.08 + intensity * 0.72})`;
                    const borderColor = `rgba(244, 63, 94, ${0.15 + intensity * 0.4})`;
                    return (
                      <div
                        key={`${tactic}-${t.id}`}
                        className="rounded px-1.5 py-1 text-mini font-mono cursor-default truncate border"
                        style={{ backgroundColor: bg, borderColor: borderColor }}
                        title={`${t.id} · ${t.name}\n${t.used_by_count} group${t.used_by_count === 1 ? '' : 's'} · ${tacticLabel(t.tactic)}${t.used_by_groups.length > 0 ? `\nused by: ${t.used_by_groups.join(', ')}` : ''}`}
                      >
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{t.id}</span>
                        <span className="text-slate-500 dark:text-slate-400 ml-1 text-micro">{t.used_by_count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-micro font-mono text-slate-400 mt-3">
        {data.aggregate_techniques.length} techniques across {tacticKeys.length} tactics · top {MAX_PER_TACTIC} per
        tactic
      </p>
    </section>
  );
}
