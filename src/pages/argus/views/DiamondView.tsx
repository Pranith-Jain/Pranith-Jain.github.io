import { useState, useMemo } from 'react';
import { User, Bug, Server, Building2, ExternalLink, ChevronRight } from 'lucide-react';
import type { Actor } from '../types';
import { NATION_PALETTE } from '../data/countries';

interface Props {
  actors: Actor[];
  onOpen: (a: Actor) => void;
}

type FacetKey = 'adversary' | 'capability' | 'infrastructure' | 'victim';

// Four-corner diamond model — each facet maps to one of the design
// system's accent ramps. The four hues are semantic, not decorative:
// they distinguish the four entity classes in the diamond model.
//   adversary      → brand-500  (who)
//   capability     → rose-500   (what they use)
//   infrastructure → sky-500    (where they operate)
//   victim         → amber-500  (who they hit)
const FACETS: { key: FacetKey; label: string; icon: typeof User; accent: string }[] = [
  { key: 'adversary', label: 'Adversary', icon: User, accent: '#5a78f2' },
  { key: 'capability', label: 'Capability', icon: Bug, accent: '#f43f5e' },
  { key: 'infrastructure', label: 'Infrastructure', icon: Server, accent: 'rgb(14 165 233)' },
  { key: 'victim', label: 'Victim', icon: Building2, accent: 'rgb(245 158 11)' },
];

const DIAMOND_POINTS = '200,10 390,200 200,390 10,200';

export function DiamondView({ actors, onOpen }: Props) {
  const [active, setActive] = useState(actors[0]?.id);
  const [activeFacet, setActiveFacet] = useState<FacetKey>('adversary');
  const a = useMemo(() => actors.find((x) => x.id === active) ?? actors[0], [active, actors]);
  if (!a)
    return (
      <div className="absolute inset-0 grid place-items-center text-muted text-sm">
        No actors match current filters.
      </div>
    );

  const nation = NATION_PALETTE[a.country] ?? NATION_PALETTE.XX!;

  const facetData: Record<
    FacetKey,
    { title: string; primary: string; sub: string; items: { label: string; value: string; link?: string }[] }
  > = {
    adversary: {
      title: 'Adversary',
      primary: a.agency,
      sub: `${a.motivation} · active ${a.active_since}–${a.last_seen} · ${a.confidence} confidence`,
      items: [
        { label: 'Nation', value: nation?.name ?? a.country },
        { label: 'APT', value: a.apt ?? '—' },
        {
          label: 'MITRE',
          value: a.mitre_id ?? '—',
          link: a.mitre_id ? `https://attack.mitre.org/groups/${a.mitre_id}/` : undefined,
        },
        ...a.members.map((m) => ({ label: m.status, value: `${m.name} — ${m.role}` })),
      ],
    },
    capability: {
      title: 'Capability',
      primary: `${a.malware.length} malware · ${a.ttps.length} TTPs · ${a.cves.length} CVEs`,
      sub: 'Malware, TTPs, and CVEs',
      items: [
        ...a.malware.map((m) => ({ label: m.type, value: `${m.name} (${m.platform})` })),
        ...a.ttps.slice(0, 6).map((t) => ({
          label: t.tactic,
          value: `${t.id} — ${t.name}`,
          link: `https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`,
        })),
      ],
    },
    infrastructure: {
      title: 'Infrastructure',
      primary: `${a.infra_patterns.length} known patterns`,
      sub: `Targets ${a.targets.length} regions across ${a.sectors.length} sectors`,
      items: [
        ...a.infra_patterns.map((p) => ({ label: 'pattern', value: p })),
        ...a.sectors.map((s) => ({ label: 'sector', value: s })),
      ],
    },
    victim: {
      title: 'Victim',
      primary: `${a.campaigns.length} known campaigns`,
      sub: a.targets.slice(0, 3).join(', '),
      items: [
        ...a.campaigns.map((c) => ({
          label: `${c.start}–${c.end}`,
          value: c.name,
        })),
        ...a.targets.map((t) => ({ label: 'target', value: t })),
      ],
    },
  };

  const fd = facetData[activeFacet];
  const facet = FACETS.find((f) => f.key === activeFacet)!;

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Sidebar — actor list */}
      <aside
        className="w-full lg:w-60 border-b lg:border-b-0 lg:border-r bg-white/60 dark:bg-[rgb(var(--surface-200))] overflow-y-auto p-3 shrink-0 lg:h-auto h-48"
        style={{ borderColor: 'var(--edge)' }}
      >
        <div className="text-eyebrow font-mono text-muted mb-2">Actors · {actors.length}</div>
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
          {actors.map((x) => {
            const n = NATION_PALETTE[x.country];
            return (
              <button
                key={x.id}
                onClick={() => setActive(x.id)}
                data-active={active === x.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[12.5px] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] shrink-0 lg:shrink transition-all duration-200 hover:-translate-y-px"
                style={
                  active === x.id
                    ? { background: `${n?.color ?? '#5b8def'}18`, color: n?.color, borderLeft: `2px solid ${n?.color}` }
                    : { color: 'var(--text-secondary)' }
                }
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: n?.color }} />
                <span className="flex-1 truncate whitespace-nowrap">{x.name}</span>
                {x.apt && <span className="text-micro font-mono text-muted whitespace-nowrap">{x.apt}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Actor header */}
          <header className="mb-6 flex items-start gap-4 flex-wrap">
            <span
              className="h-12 w-12 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
              style={{ background: `${nation.color}20`, color: nation.color, border: `2px solid ${nation.color}44` }}
            >
              {a.country}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{a.name}</h2>
                {a.apt && <span className="chip chip-blue">{a.apt}</span>}
                {a.mitre_id && <span className="chip">{a.mitre_id}</span>}
              </div>
              <div className="text-mini font-mono uppercase tracking-wider text-muted mt-0.5">
                {a.aka.slice(0, 5).join(' · ')}
              </div>
            </div>
            <button onClick={() => onOpen(a)} className="btn btn-primary">
              Full dossier <ChevronRight size={14} />
            </button>
          </header>

          {/* Diamond + facet panel layout */}
          <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
            {/* SVG Diamond */}
            <div className="flex flex-col items-center">
              <svg viewBox="0 0 400 400" className="w-full max-w-[400px]">
                {/* Diamond outline */}
                <polygon
                  points={DIAMOND_POINTS}
                  fill="none"
                  stroke="var(--edge-strong)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />

                {/* Cross lines */}
                <line x1="200" y1="10" x2="200" y2="390" stroke="var(--edge)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="10" y1="200" x2="390" y2="200" stroke="var(--edge)" strokeWidth="1" strokeDasharray="4 4" />

                {/* Inner diamond */}
                <polygon
                  points="200,80 310,200 200,320 90,200"
                  fill="none"
                  stroke="var(--edge)"
                  strokeWidth="0.8"
                  strokeDasharray="2 3"
                />

                {/* Center dot */}
                <circle cx="200" cy="200" r="4" fill={nation.color} opacity="0.6" />

                {/* Connection lines from center to each vertex */}
                {FACETS.map((f, i) => {
                  const positions = [
                    { x: 200, y: 10 }, // top — adversary
                    { x: 390, y: 200 }, // right — capability
                    { x: 200, y: 390 }, // bottom — infrastructure
                    { x: 10, y: 200 }, // left — victim
                  ];
                  const pos = positions[i]!;
                  return (
                    <line
                      key={f.key}
                      x1="200"
                      y1="200"
                      x2={pos.x}
                      y2={pos.y}
                      stroke={activeFacet === f.key ? f.accent : 'var(--edge)'}
                      strokeWidth={activeFacet === f.key ? 2 : 0.8}
                      opacity={activeFacet === f.key ? 0.8 : 0.3}
                    />
                  );
                })}

                {/* Facet nodes */}
                {FACETS.map((f, i) => {
                  const positions = [
                    { x: 200, y: 10 },
                    { x: 390, y: 200 },
                    { x: 200, y: 390 },
                    { x: 10, y: 200 },
                  ];
                  const labelOffsets = [
                    { dx: 0, dy: -24 }, // top
                    { dx: 32, dy: 4 }, // right
                    { dx: 0, dy: 28 }, // bottom
                    { dx: -32, dy: 4 }, // left
                  ];
                  const pos = positions[i]!;
                  const labelOff = labelOffsets[i]!;
                  const isActive = activeFacet === f.key;

                  return (
                    <g key={f.key} onClick={() => setActiveFacet(f.key)} className="cursor-pointer">
                      {/* Glow */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isActive ? 28 : 20}
                        fill={f.accent}
                        opacity={isActive ? 0.12 : 0.04}
                      />
                      {/* Node */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isActive ? 18 : 14}
                        fill={isActive ? `${f.accent}33` : 'var(--ink-800)'}
                        stroke={f.accent}
                        strokeWidth={isActive ? 2 : 1.2}
                      />
                      {/* Icon placeholder */}
                      <text
                        x={pos.x}
                        y={pos.y + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={f.accent}
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="Inter, sans-serif"
                      >
                        {f.label.charAt(0)}
                      </text>
                      {/* Label */}
                      <text
                        x={pos.x + labelOff.dx}
                        y={pos.y + labelOff.dy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isActive ? f.accent : 'var(--text-tertiary)'}
                        fontSize="11"
                        fontWeight={isActive ? '600' : '400'}
                        fontFamily="JetBrains Mono, monospace"
                        letterSpacing="0.08em"
                      >
                        {f.label.toUpperCase()}
                      </text>
                    </g>
                  );
                })}

                {/* Actor name in center */}
                <text
                  x="200"
                  y="196"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text-primary)"
                  fontSize="13"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {a.name}
                </text>
                <text
                  x="200"
                  y="212"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text-tertiary)"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  letterSpacing="0.1em"
                >
                  {nation?.name?.toUpperCase()} · {a.motivation.toUpperCase()}
                </text>
              </svg>

              {/* Facet quick stats */}
              <div className="grid grid-cols-4 gap-1.5 mt-4 w-full max-w-[400px]">
                {FACETS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setActiveFacet(f.key)}
                      className="surface-card card-hover p-2 text-center transition-all"
                      style={
                        activeFacet === f.key
                          ? { borderColor: `${f.accent}44`, background: `${f.accent}0a` }
                          : undefined
                      }
                    >
                      <Icon size={14} className="mx-auto mb-1" style={{ color: f.accent }} />
                      <div
                        className="text-micro font-mono uppercase tracking-wider"
                        style={{ color: activeFacet === f.key ? f.accent : 'var(--text-tertiary)' }}
                      >
                        {f.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Facet detail panel */}
            <div className="space-y-4">
              <div className="surface-card card-hover p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="h-8 w-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${facet.accent}18`, color: facet.accent }}
                  >
                    <facet.icon size={16} />
                  </span>
                  <div>
                    <div className="text-tool font-semibold" style={{ color: facet.accent }}>
                      {fd.title}
                    </div>
                    <div className="text-mini text-muted">{fd.sub}</div>
                  </div>
                </div>
                <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-4">{fd.primary}</div>

                <div className="space-y-1">
                  {fd.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 py-1.5 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-all duration-200 hover:-translate-y-px"
                    >
                      <span className="text-micro font-mono uppercase tracking-wider text-muted w-20 shrink-0 pt-0.5">
                        {item.label}
                      </span>
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 flex-1 transition-colors"
                        >
                          {item.value} <ExternalLink size={9} />
                        </a>
                      ) : (
                        <span className="text-[12.5px] text-muted flex-1">{item.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sector heat for victim facet */}
              {activeFacet === 'victim' && a.sector_scores.length > 0 && (
                <div className="surface-card card-hover p-5">
                  <div className="text-eyebrow font-mono text-muted mb-3">Sector targeting heat</div>
                  <div className="space-y-2">
                    {a.sector_scores.map((s) => (
                      <div key={s.sector} className="flex items-center gap-3">
                        <span className="w-32 text-meta text-muted capitalize shrink-0">{s.sector}</span>
                        <div
                          className="flex-1 h-2.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--ink-600)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${s.score}%`,
                              background: nation.color,
                            }}
                          />
                        </div>
                        <span className="text-mini font-mono text-muted w-8 text-right">{s.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Campaigns for victim facet */}
              {activeFacet === 'victim' && a.campaigns.length > 0 && (
                <div className="space-y-2">
                  {a.campaigns.map((c) => (
                    <div key={c.name} className="surface-card card-hover hover-rose p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                        <span className="text-[10.5px] font-mono text-muted ml-auto">
                          {c.start} → {c.end}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-muted leading-relaxed">{c.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.sectors.map((s) => (
                          <span key={s} className="chip">
                            {s}
                          </span>
                        ))}
                        <span className="chip chip-green ml-auto">via {c.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Shared edges info */}
              <div className="surface-card card-hover hover-rose p-4">
                <div className="text-eyebrow font-mono text-muted mb-2">Cross-references</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[20px] font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {a.ttps.length}
                    </div>
                    <div className="text-micro font-mono uppercase tracking-wider text-muted">MITRE TTPs</div>
                  </div>
                  <div>
                    <div className="text-[20px] font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {a.malware.length}
                    </div>
                    <div className="text-micro font-mono uppercase tracking-wider text-muted">Malware</div>
                  </div>
                  <div>
                    <div className="text-[20px] font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {a.cves.length}
                    </div>
                    <div className="text-micro font-mono uppercase tracking-wider text-muted">CVEs</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
