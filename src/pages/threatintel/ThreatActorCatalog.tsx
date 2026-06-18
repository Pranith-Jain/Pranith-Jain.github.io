import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ChevronDown, ChevronUp, Search, Skull } from 'lucide-react';
import {
  THREAT_ACTORS,
  TYPE_LABELS,
  STATUS_COLORS,
  type ActorType,
  type ThreatActor,
} from '../../data/threatintel/threat-actor-catalog';

const ALL_TYPES = Object.keys(TYPE_LABELS) as ActorType[];

export default function ThreatActorCatalog(): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<ActorType | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = THREAT_ACTORS;
    if (activeType) list = list.filter((a) => a.type === activeType);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.aliases.some((al) => al.toLowerCase().includes(q)) ||
          a.country.toLowerCase().includes(q) ||
          a.malware.some((m) => m.toLowerCase().includes(q)) ||
          a.targets.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [query, activeType]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    THREAT_ACTORS.forEach((a) => {
      c[a.type] = (c[a.type] || 0) + 1;
    });
    return c;
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Skull size={28} />}
      title="Threat Actor Catalog"
      maxWidthClass="max-w-5xl"
      description="Curated profiles of 15 major threat actor groups — APTs, cybercrime, and ransomware. Aliases, countries, malware families, TTPs, MITRE mapping, and campaign history."
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actors, aliases, malware, targets…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filtered.length} actors</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => setActiveType(null)}
          className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
            !activeType
              ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          All ({THREAT_ACTORS.length})
        </button>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(activeType === t ? null : t)}
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
              activeType === t
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {TYPE_LABELS[t]} ({typeCounts[t] || 0})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((actor) => (
          <ActorCard key={actor.id} actor={actor} expanded={expanded.has(actor.id)} onToggle={() => toggle(actor.id)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-500">No actors match your search.</div>
      )}
    </DataPageLayout>
  );
}

function ActorCard({
  actor,
  expanded,
  onToggle,
}: {
  actor: ThreatActor;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden transition-all hover:border-slate-300 dark:hover:border-slate-700">
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex items-start gap-4">
        <span className="text-lg mt-0.5">{actor.country.split(' ')[0]}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug mb-1">
            {actor.name}
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 flex-wrap">
            <span className={`font-semibold ${STATUS_COLORS[actor.status]}`}>{actor.status}</span>
            <span>·</span>
            <span>{TYPE_LABELS[actor.type]}</span>
            <span>·</span>
            <span>{actor.activeYears}</span>
            <span>·</span>
            <span>{actor.malware.length} malware</span>
            <span>·</span>
            <span>{actor.ttps.length} TTPs</span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm text-muted leading-relaxed mt-3 mb-3">{actor.description}</p>

          {actor.aliases.length > 0 && (
            <Section title="Aliases">
              {actor.aliases.map((a) => (
                <span
                  key={a}
                  className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500"
                >
                  {a}
                </span>
              ))}
            </Section>
          )}

          <Section title="Malware Families">
            {actor.malware.map((m) => (
              <span
                key={m}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              >
                {m}
              </span>
            ))}
          </Section>

          <Section title="Tools">
            {actor.tools.map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              >
                {t}
              </span>
            ))}
          </Section>

          <Section title="MITRE ATT&CK">
            {actor.ttps.map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
              >
                {t}
              </span>
            ))}
            {actor.mitreGroups.length > 0 &&
              actor.mitreGroups.map((g) => (
                <span
                  key={g}
                  className="text-[10px] font-mono px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                >
                  {g}
                </span>
              ))}
          </Section>

          <Section title="Campaigns">
            {actor.campaigns.map((c) => (
              <span
                key={c}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-muted"
              >
                {c}
              </span>
            ))}
          </Section>

          <Section title="Targets">
            {actor.targets.map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
              >
                {t}
              </span>
            ))}
          </Section>

          <div className="mt-3 text-[11px] font-mono text-slate-500">
            <span className="text-slate-400">Motivation:</span> {actor.motivation}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-3">
      <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{title}</h4>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
