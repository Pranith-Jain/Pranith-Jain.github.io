import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Search, ShieldAlert, AlertTriangle, Users, Radio } from 'lucide-react';

interface ExtremistGroup {
  name: string;
  ideology: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  regions: string[];
  description: string;
  indicators: string[];
  monitoringSources: string[];
}

const GROUPS: ExtremistGroup[] = [
  {
    name: 'Accelerationist Networks',
    ideology: 'Far-Right / Accelerationism',
    risk: 'CRITICAL',
    regions: ['North America', 'Europe', 'Oceania'],
    description:
      'Decentralized networks advocating hastening societal collapse through violence and terror. Operates through atomized cells, encrypted messaging, and online manifestos. Known for targeting critical infrastructure, minority groups, and government institutions.',
    indicators: [
      'Siege / meme culture references',
      'Terrorgram channels',
      'Atomwaffen / NSM material',
      'Boogaloo rhetoric',
      'Commemorative channels for attackers',
    ],
    monitoringSources: [
      'SPLC Intelligence Report',
      'GNET (Global Network on Extremism & Technology)',
      'ISD (Institute for Strategic Dialogue)',
      'CTEC (Counter-Terrorism and Extremism Center)',
    ],
  },
  {
    name: 'Islamist Extremist Networks',
    ideology: 'Islamist Extremism',
    risk: 'CRITICAL',
    regions: ['Middle East', 'Africa', 'South Asia', 'Europe', 'Central Asia'],
    description:
      'Transnational networks including ISIS affiliates, Al-Qaeda aligned groups, and region-specific jihadi organizations. Increasingly diffuse with online radicalization replacing physical training camps. Lone-actor attacks remain the primary threat in Western countries.',
    indicators: [
      'Telegram / Rocket.Chat channels',
      'Dawah / recruitment content',
      'Nasheed (a cappella) propaganda',
      'Virtual influencers & fatwa channels',
      'Iraq/Syria repatriation tracking',
    ],
    monitoringSources: [
      'Jihadica / Jihadology',
      'SITE Intelligence Group',
      'MEMRI JTT',
      'Counter Extremism Project (CEP)',
      'Hedayah',
    ],
  },
  {
    name: 'Far-Right Militant Organizations',
    ideology: 'Far-Right / White Nationalism',
    risk: 'HIGH',
    regions: ['North America', 'Europe', 'Russia', 'South Africa'],
    description:
      'Organized far-right militant groups including militia organizations, white nationalist cells, and identitarian movements. Increasingly cross-border with shared funding, training materials, and ideological frameworks. Active in political violence and intimidation campaigns.',
    indicators: [
      'Paramilitary training materials',
      'Great Replacement rhetoric',
      'Endchan / 4chan / 8kun activity',
      'Telegram closed groups',
      'Live-streamed attacks',
    ],
    monitoringSources: [
      'ADL H.E.A.T. Map',
      'SPLC Hate Map',
      'Hope Not Hate',
      'EXPOSED UK',
      'CST (Community Security Trust)',
    ],
  },
  {
    name: 'Sovereign Citizen / Freemen Movements',
    ideology: 'Anti-Government Extremism',
    risk: 'MEDIUM',
    regions: ['North America', 'Australia', 'UK', 'Germany'],
    description:
      'Anti-government movements that reject legal authority and court jurisdiction. Engages in paper terrorism (fake liens, court filings), sovereign citizen court arguments, and occasionally violent confrontations with law enforcement. Growing overlap with QAnon and wellness-adjacent conspiracy networks.',
    indicators: [
      'Redemption / strawman theory filings',
      'UCC lien filings',
      'Flag patches on vehicles',
      'Moorish sovereign claims',
      'Anti-vax / pseudolegal seminar channels',
    ],
    monitoringSources: [
      'SPLC Intelligence Report',
      'ADL SOURCE',
      'Southern Poverty Law Center',
      'Institute for Research on Male Supremacism (IRMS)',
    ],
  },
  {
    name: 'Separatist / Ethnonationalist Groups',
    ideology: 'Separatism / Self-Determination',
    risk: 'HIGH',
    regions: ['South Asia', 'Southeast Asia', 'Sub-Saharan Africa', 'Eastern Europe'],
    description:
      'Ethnic separatist movements employing political agitation, insurgency, and terrorism. Includes both longstanding historical conflicts and newer secessionist movements amplified by disinformation. Some receive state sponsorship from rival powers.',
    indicators: [
      'Ethnic targeting patterns',
      'Propaganda in local languages',
      'Cross-border safe havens',
      'Diaspora funding networks',
      'Peace process spoiler attacks',
    ],
    monitoringSources: [
      'ACLED (Armed Conflict Location & Event Data)',
      'International Crisis Group',
      'UCDP Conflict Encyclopedia',
      'Small Wars Journal',
    ],
  },
  {
    name: 'Eco-Extremist / Animal Liberation',
    ideology: 'Single-Issue Extremism',
    risk: 'MEDIUM',
    regions: ['North America', 'Europe', 'Oceania'],
    description:
      'Direct-action environmental and animal rights groups employing property destruction, arson, and intimidation. Includes ALF (Animal Liberation Front), ELF (Earth Liberation Front), and newer climate-accelerationist cells. Property-focused but with escalating rhetoric around human targets.',
    indicators: [
      'Direct action communiqués',
      'Anarchist / antifa crossover',
      'Lab / construction site targeting',
      'ALF / ELF claim channels',
      'Vegan outreach fronts',
    ],
    monitoringSources: [
      'FBI JTTF reporting',
      'Europol TE-SAT',
      'National Counterterrorism Center (NCTC)',
      'International Centre for Counter-Terrorism (ICCT)',
    ],
  },
  {
    name: 'Incels / Male Supremacist Networks',
    ideology: 'Gender-Based Extremism',
    risk: 'HIGH',
    regions: ['North America', 'Europe', 'East Asia'],
    description:
      "Online misogynist ecosystem including incel (involuntary celibate) forums, pick-up artist networks, and men's rights activists. Increasingly linked to terrorism through manifesto-inspired attacks. Overlaps with accelerationism and far-right radicalization pipelines.",
    indicators: [
      'Blackpill / looksmaxxing terminology',
      'ER / SB (Elliot Rodger / Santa Barbara) references',
      'Redpill / manosphere content',
      'Forums: incels.is, looksmax.me',
      'Revenge fantasy writings',
    ],
    monitoringSources: [
      'IRMS (Institute for Research on Male Supremacism)',
      'ISD',
      'Southern Poverty Law Center',
      'ADL H.E.A.T. Map',
    ],
  },
  {
    name: 'Conspiracy-Driven Violent Groups',
    ideology: 'Conspiracy Extremism',
    risk: 'HIGH',
    regions: ['North America', 'Europe', 'Latin America'],
    description:
      'Disparate networks united by shared conspiracy narratives (QAnon, Great Reset, New World Order) that have adopted direct-action tactics. Characterized by fluid membership, rapid narrative pivots, and demonstrated willingness to escalate to violence against perceived enemies.',
    indicators: [
      'Trust the Plan lexicon',
      'Digital soldier rhetoric',
      'WWG1WGA references',
      'Adrenochrome / pedophile ring narratives',
      'Targeting of schools, hospitals, power grids',
    ],
    monitoringSources: [
      'GNET (Global Network on Extremism & Technology)',
      'ADL H.E.A.T. Map',
      'Program on Extremism (GWU)',
      'The Network Contagion Research Institute (NCRI)',
    ],
  },
];

const RISK_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const RISK_PILL: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  MEDIUM:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
  LOW: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-[#1e2030]',
};

export default function Extremists(): JSX.Element {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return GROUPS;
    return GROUPS.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.ideology.toLowerCase().includes(q) ||
        g.regions.some((r) => r.toLowerCase().includes(q)) ||
        g.indicators.some((i) => i.toLowerCase().includes(q)) ||
        g.description.toLowerCase().includes(q)
    );
  }, [query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (RISK_ORDER[a.risk] ?? 99) - (RISK_ORDER[b.risk] ?? 99));
  }, [filtered]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Extremism Monitoring — Group Tracking"
      description="Tracked extremist ideologies, networks, and movements — organized by threat risk, regional presence, and observable indicators. For analysts conducting counter-extremism monitoring."
    >
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, ideology, region, indicator, or description…"
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {sorted.length} {sorted.length === 1 ? 'ideology group' : 'ideology groups'} tracked
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((group) => (
          <div
            key={group.name}
            className="surface-card p-5 flex flex-col border border-slate-200 dark:border-[#1e2030] rounded-xl"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">{group.name}</h3>
              <span
                className={`shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${RISK_PILL[group.risk] ?? ''}`}
              >
                {group.risk}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
              <Users size={12} />
              <span>{group.ideology}</span>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {group.regions.map((region) => (
                <span
                  key={region}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted border border-slate-200 dark:border-[#1e2030]"
                >
                  {region}
                </span>
              ))}
            </div>

            <p className="text-sm text-muted leading-relaxed mb-3 line-clamp-3">{group.description}</p>

            <div className="mt-auto space-y-2 text-xs font-mono text-slate-500 dark:text-slate-500">
              <div>
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 mb-1">
                  <AlertTriangle size={11} /> Indicators
                </span>
                <ul className="space-y-0.5">
                  {group.indicators.map((ind) => (
                    <li key={ind} className="text-muted">
                      · {ind}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 mb-1">
                  <Radio size={11} /> Monitoring Sources
                </span>
                <ul className="space-y-0.5">
                  {group.monitoringSources.map((src) => (
                    <li key={src} className="text-muted">
                      · {src}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12 font-mono">
          No extremist groups match your filter.
        </p>
      )}
    </DataPageLayout>
  );
}
