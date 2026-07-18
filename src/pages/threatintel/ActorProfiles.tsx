import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Skull,
  Search,
  Shield,
  Tag,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Swords,
  Target,
  Radio,
} from 'lucide-react';
import {
  THREAT_ACTORS,
  TYPE_LABELS,
  type ActorType,
  type ActorStatus,
  type ThreatActor,
} from '../../data/threatintel/threat-actor-catalog';

const ALL_TYPES = Object.keys(TYPE_LABELS) as ActorType[];

const TYPE_ICONS: Record<ActorType, React.ReactNode> = {
  apt: <Shield className="h-4 w-4" />,
  cybercrime: <Skull className="h-4 w-4" />,
  ransomware: <Swords className="h-4 w-4" />,
  hacktivist: <Radio className="h-4 w-4" />,
  insider: <Target className="h-4 w-4" />,
  supplier: <Tag className="h-4 w-4" />,
};

const TYPE_COLORS: Record<ActorType, string> = {
  apt: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  cybercrime:
    'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  ransomware: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  hacktivist:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  insider:
    'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  supplier:
    'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800',
};

const STATUS_PILL: Record<string, string> = {
  active:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  dormant: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  defunct:
    'bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  unknown: 'bg-slate-50 dark:bg-[rgb(var(--surface-100))] text-slate-400 border-slate-200 dark:border-slate-700',
};

const COUNTRY_FLAGS: Record<string, string> = {
  RU: '🇷🇺',
  CN: '🇨🇳',
  KP: '🇰🇵',
  IR: '🇮🇷',
  US: '🇺🇸',
  UA: '🇺🇦',
  IL: '🇮🇱',
  IN: '🇮🇳',
  VN: '🇻🇳',
  BY: '🇧🇾',
  Unknown: '🌐',
};

const CARD = 'surface-card';
const INPUT =
  'w-full rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500';

function getCountryCode(country: string): string {
  const match = country.match(/^([A-Z]{2})/);
  return match?.[1] ?? 'Unknown';
}

function ActorCard({
  actor,
  isExpanded,
  onToggle,
  onMalwareClick,
  onSectorClick,
}: {
  actor: ThreatActor;
  isExpanded: boolean;
  onToggle: () => void;
  onMalwareClick?: (m: string) => void;
  onSectorClick?: (s: string) => void;
}) {
  const cc = getCountryCode(actor.country);
  const flag = COUNTRY_FLAGS[cc] ?? '🌐';
  const statusCls = STATUS_PILL[actor.status] ?? STATUS_PILL.unknown;

  return (
    <div className={`${CARD} overflow-hidden transition-all hover:shadow-e2`}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
      >
        <div className={`rounded-lg p-2 shrink-0 ${TYPE_COLORS[actor.type]}`}>{TYPE_ICONS[actor.type]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 truncate">
              {actor.name}
            </h3>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${statusCls}`}>
              {actor.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {flag} {actor.country.split(': ')[1] ?? actor.country}
            </span>
            <span>·</span>
            <span>{actor.activeYears}</span>
            <span>·</span>
            <span className="font-mono">{TYPE_LABELS[actor.type]}</span>
          </div>
          {actor.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {actor.aliases.slice(0, isExpanded ? undefined : 3).map((alias) => (
                <span
                  key={alias}
                  className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[rgb(var(--surface-200))] rounded px-1.5 py-0.5"
                >
                  {alias}
                </span>
              ))}
              {!isExpanded && actor.aliases.length > 3 && (
                <span className="text-[10px] font-mono text-slate-400">+{actor.aliases.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 mt-1">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-4 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{actor.description}</p>

          {/* Motivation */}
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Motivation
            </span>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{actor.motivation}</p>
          </div>

          {/* Malware & Tools */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Associated Malware
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {actor.malware.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMalwareClick?.(m);
                    }}
                    className="text-xs font-mono bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-full px-2 py-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
                  >
                    {m}
                  </button>
                ))}
                {actor.malware.length === 0 && <span className="text-xs text-slate-400 italic">None listed</span>}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tools
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {actor.tools.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-mono bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-full px-2 py-0.5"
                  >
                    {t}
                  </span>
                ))}
                {actor.tools.length === 0 && <span className="text-xs text-slate-400 italic">None listed</span>}
              </div>
            </div>
          </div>

          {/* Targeted Sectors */}
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Targeted Sectors
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {actor.targets.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSectorClick?.(t);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-mono bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded-full px-2 py-0.5 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors cursor-pointer"
                >
                  <Target className="h-3 w-3" /> {t}
                </button>
              ))}
            </div>
          </div>

          {/* TTPs */}
          {actor.ttps.length > 0 && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Key TTPs
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {actor.ttps.map((ttp) => (
                  <span
                    key={ttp}
                    className="text-xs font-mono bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-full px-2 py-0.5"
                  >
                    {ttp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Campaigns */}
          {actor.campaigns.length > 0 && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Notable Campaigns
              </span>
              <ul className="mt-1.5 space-y-1">
                {actor.campaigns.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MITRE Groups */}
          {actor.mitreGroups.length > 0 && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                MITRE ATT&CK Groups
              </span>
              <div className="flex gap-2 mt-1.5">
                {actor.mitreGroups.map((g) => (
                  <a
                    key={g}
                    href={`https://attack.mitre.org/groups/${g}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {g} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Telegram handles */}
          {actor.telegram_handles && actor.telegram_handles.length > 0 && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Telegram Channels
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {actor.telegram_handles.map((h) => (
                  <a
                    key={h}
                    href={`https://t.me/${h}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    @{h}
                  </a>
                ))}
              </div>
              {actor.telegram_handles_source && (
                <p className="text-[10px] text-slate-400 mt-1">Source: {actor.telegram_handles_source.join('; ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActorProfiles() {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<ActorType | null>(null);
  const [activeStatus, setActiveStatus] = useState<ActorStatus | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [activeMalware, setActiveMalware] = useState<string | null>(null);
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = THREAT_ACTORS;
    if (activeType) list = list.filter((a) => a.type === activeType);
    if (activeStatus) list = list.filter((a) => a.status === activeStatus);
    if (activeCountry) list = list.filter((a) => getCountryCode(a.country) === activeCountry);
    if (activeMalware)
      list = list.filter((a) => a.malware.some((m) => m.toLowerCase() === activeMalware.toLowerCase()));
    if (activeSector) list = list.filter((a) => a.targets.some((t) => t.toLowerCase() === activeSector.toLowerCase()));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.aliases.some((al) => al.toLowerCase().includes(q)) ||
          a.country.toLowerCase().includes(q) ||
          a.malware.some((m) => m.toLowerCase().includes(q)) ||
          a.targets.some((t) => t.toLowerCase().includes(q)) ||
          a.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [query, activeType, activeStatus, activeCountry, activeMalware, activeSector]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(filtered.map((a) => a.id)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    THREAT_ACTORS.forEach((a) => {
      c[a.type] = (c[a.type] || 0) + 1;
    });
    return c;
  }, []);

  const countryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    THREAT_ACTORS.forEach((a) => {
      const cc = getCountryCode(a.country);
      c[cc] = (c[cc] || 0) + 1;
    });
    return c;
  }, []);

  const stats = useMemo(
    () => ({
      total: THREAT_ACTORS.length,
      active: THREAT_ACTORS.filter((a) => a.status === 'active').length,
      countries: new Set(THREAT_ACTORS.map((a) => getCountryCode(a.country))).size,
    }),
    []
  );

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Skull className="h-6 w-6" />}
      title="Threat Actor Profiles"
      description={`${stats.total} threat actor profiles — APTs, cybercrime syndicates, ransomware operations. Aliases, malware, sectors, TTPs, and campaign history.`}
      maxWidthClass="max-w-5xl"
      headerExtra={
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
            {stats.total} actors
          </span>
          <span className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 font-mono">
            {stats.active} active
          </span>
          <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
            {stats.countries} countries
          </span>
        </div>
      }
    >
      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actors, aliases, malware, sectors, countries…"
          className={`${INPUT} pl-9 pr-3`}
        />
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          type="button"
          onClick={() => setActiveType(null)}
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono rounded-full border px-2.5 py-1 transition-colors ${
            activeType === null
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
              : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
          }`}
        >
          All ({stats.total})
        </button>
        {ALL_TYPES.filter((t) => typeCounts[t]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveType(activeType === t ? null : t)}
            className={`inline-flex items-center gap-1.5 text-[11px] font-mono rounded-full border px-2.5 py-1 transition-colors ${
              activeType === t
                ? `${TYPE_COLORS[t]} border-current`
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            {TYPE_ICONS[t]} {TYPE_LABELS[t]} ({typeCounts[t]})
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Status:
        </span>
        {(['active', 'dormant', 'defunct'] as ActorStatus[]).map((s) => {
          const count = THREAT_ACTORS.filter((a) => a.status === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveStatus(activeStatus === s ? null : s)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono border transition-colors ${
                activeStatus === s
                  ? `${STATUS_PILL[s]} border-current`
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {s} ({count})
            </button>
          );
        })}
        <div className="w-px h-5 bg-slate-200 dark:bg-[rgb(var(--border-400))]" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Country:
        </span>
        {Object.entries(countryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([cc, count]) => {
            const flag = COUNTRY_FLAGS[cc] ?? '🌐';
            const name = THREAT_ACTORS.find((a) => getCountryCode(a.country) === cc)?.country.split(': ')[1] ?? cc;
            return (
              <button
                key={cc}
                type="button"
                onClick={() => setActiveCountry(activeCountry === cc ? null : cc)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono border transition-colors ${
                  activeCountry === cc
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                {flag} {name} ({count})
              </button>
            );
          })}
        {(activeStatus || activeCountry) && (
          <button
            onClick={() => {
              setActiveStatus(null);
              setActiveCountry(null);
            }}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {(activeMalware || activeSector) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Filtered by:
          </span>
          {activeMalware && (
            <button
              onClick={() => setActiveMalware(null)}
              className="inline-flex items-center gap-1 text-[11px] font-mono bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-full px-2 py-0.5"
            >
              Malware: {activeMalware} ×
            </button>
          )}
          {activeSector && (
            <button
              onClick={() => setActiveSector(null)}
              className="inline-flex items-center gap-1 text-[11px] font-mono bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded-full px-2 py-0.5"
            >
              Sector: {activeSector} ×
            </button>
          )}
        </div>
      )}

      {/* Actor cards */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {filtered.length} actor{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={expandAll}
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            Expand all
          </button>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
            No actors match your search.
          </div>
        ) : (
          filtered.map((actor) => (
            <ActorCard
              key={actor.id}
              actor={actor}
              isExpanded={expanded.has(actor.id)}
              onToggle={() => toggle(actor.id)}
              onMalwareClick={(m) => setActiveMalware(activeMalware === m ? null : m)}
              onSectorClick={(s) => setActiveSector(activeSector === s ? null : s)}
            />
          ))
        )}
      </div>
    </DataPageLayout>
  );
}
