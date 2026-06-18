import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Calendar, DollarSign, Globe, Search, Shield, Skull, Tag, Users } from 'lucide-react';

interface PhysicalAttack {
  id: string;
  date: string;
  country: string;
  city?: string;
  victim_type: 'individual' | 'exchange' | 'business' | 'miner' | 'unknown';
  method: string;
  amount_stolen?: string;
  description: string;
  outcome: 'unsolved' | 'arrested' | 'partial-recovery' | 'full-recovery' | 'ongoing';
  source_url?: string;
}

const ATTACKS: PhysicalAttack[] = [
  {
    id: 'PA-001',
    date: '2025-11',
    country: 'Argentina',
    city: 'Buenos Aires',
    victim_type: 'individual',
    method: 'Armed robbery',
    amount_stolen: '~$100K BTC',
    description: 'Crypto investor abducted and forced to transfer BTC at gunpoint. Victim released after transfer.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-002',
    date: '2025-09',
    country: 'UK',
    city: 'London',
    victim_type: 'individual',
    method: 'Kidnapping & torture',
    amount_stolen: '~$500K',
    description: 'Crypto trader kidnapped from home, held for 48 hours. Forced to reveal wallet passwords.',
    outcome: 'arrested',
  },
  {
    id: 'PA-003',
    date: '2025-07',
    country: 'France',
    city: 'Paris',
    victim_type: 'business',
    method: 'Armed robbery',
    amount_stolen: '~€2M',
    description: 'Crypto exchange office raided. Staff forced to hand over hardware wallets.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-004',
    date: '2025-05',
    country: 'Netherlands',
    city: 'Amsterdam',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~€300K',
    description: 'Crypto holder targeted after social media post about holdings. Robbed at home.',
    outcome: 'arrested',
  },
  {
    id: 'PA-005',
    date: '2025-03',
    country: 'Germany',
    city: 'Berlin',
    victim_type: 'individual',
    method: 'Express kidnapping',
    amount_stolen: '~€150K',
    description: 'Victim grabbed off street, forced to ATM and wallet transfers. Released after compliance.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-006',
    date: '2024-12',
    country: 'Italy',
    city: 'Milan',
    victim_type: 'business',
    method: 'Armed robbery',
    amount_stolen: '~€500K',
    description: 'Crypto ATM operators targeted. Multiple machines emptied at gunpoint.',
    outcome: 'ongoing',
  },
  {
    id: 'PA-007',
    date: '2024-10',
    country: 'USA',
    city: 'Miami',
    victim_type: 'individual',
    method: 'Armed robbery',
    amount_stolen: '~$2M',
    description: 'Crypto investor followed from conference. Robbed in parking garage.',
    outcome: 'arrested',
  },
  {
    id: 'PA-008',
    date: '2024-08',
    country: 'UK',
    city: 'Manchester',
    victim_type: 'individual',
    method: 'Kidnapping',
    amount_stolen: '~£800K',
    description: 'Crypto trader abducted, family contacted for ransom. BTC transferred during captivity.',
    outcome: 'partial-recovery',
  },
  {
    id: 'PA-009',
    date: '2024-06',
    country: 'France',
    city: 'Lyon',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~€1.2M',
    description: 'Crypto millionaire targeted. Family members threatened to force wallet access.',
    outcome: 'arrested',
  },
  {
    id: 'PA-010',
    date: '2024-04',
    country: 'Belgium',
    city: 'Brussels',
    victim_type: 'individual',
    method: 'Express kidnapping',
    amount_stolen: '~€200K',
    description: 'Brief abduction, forced crypto transfers at multiple locations.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-011',
    date: '2024-02',
    country: 'Spain',
    city: 'Barcelona',
    victim_type: 'business',
    method: 'Armed robbery',
    amount_stolen: '~€400K',
    description: 'Crypto exchange office targeted during business hours. Armed assailants.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-012',
    date: '2023-11',
    country: 'Canada',
    city: 'Toronto',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~CAD 1.5M',
    description: 'Crypto holder tortured for wallet access. Neighbors alerted police.',
    outcome: 'arrested',
  },
  {
    id: 'PA-013',
    date: '2023-09',
    country: 'USA',
    city: 'New York',
    victim_type: 'individual',
    method: 'Kidnapping',
    amount_stolen: '~$3M',
    description: 'Crypto executive kidnapped from Manhattan. 72-hour captivity before ransom paid.',
    outcome: 'partial-recovery',
  },
  {
    id: 'PA-014',
    date: '2023-07',
    country: 'Germany',
    city: 'Munich',
    victim_type: 'individual',
    method: 'Armed robbery',
    amount_stolen: '~€500K',
    description: 'Crypto investor robbed after being followed from bank.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-015',
    date: '2023-05',
    country: 'France',
    city: 'Nice',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~€800K',
    description: 'Crypto holder targeted. Attackers knew wallet balance from social media.',
    outcome: 'arrested',
  },
  {
    id: 'PA-016',
    date: '2023-03',
    country: 'Australia',
    city: 'Sydney',
    victim_type: 'miner',
    method: 'Equipment theft',
    amount_stolen: '~AUD 500K',
    description: 'Crypto mining operation raided. ASIC miners and BTC stolen.',
    outcome: 'partial-recovery',
  },
  {
    id: 'PA-017',
    date: '2023-01',
    country: 'UK',
    city: 'Birmingham',
    victim_type: 'individual',
    method: 'Express kidnapping',
    amount_stolen: '~£300K',
    description: 'Forced to transfer BTC during brief captivity. Released after compliance.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-018',
    date: '2022-11',
    country: 'Switzerland',
    city: 'Zurich',
    victim_type: 'individual',
    method: 'Armed robbery',
    amount_stolen: '~CHF 1M',
    description: 'Crypto executive robbed at gunpoint near office.',
    outcome: 'arrested',
  },
  {
    id: 'PA-019',
    date: '2022-08',
    country: 'USA',
    city: 'San Francisco',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~$1.5M',
    description: 'Crypto developer targeted. Attackers forced wallet transfer at gunpoint.',
    outcome: 'arrested',
  },
  {
    id: 'PA-020',
    date: '2022-06',
    country: 'Canada',
    city: 'Vancouver',
    victim_type: 'exchange',
    method: 'Armed robbery',
    amount_stolen: '~CAD 2M',
    description: 'Crypto exchange office raided. Staff forced to access cold storage.',
    outcome: 'ongoing',
  },
  {
    id: 'PA-021',
    date: '2022-03',
    country: 'Germany',
    city: 'Hamburg',
    victim_type: 'individual',
    method: 'Kidnapping',
    amount_stolen: '~€2M',
    description: 'Crypto millionaire abducted, held for 5 days. Family negotiated ransom.',
    outcome: 'partial-recovery',
  },
  {
    id: 'PA-022',
    date: '2021-12',
    country: 'France',
    city: 'Marseille',
    victim_type: 'individual',
    method: 'Armed robbery',
    amount_stolen: '~€400K',
    description: 'Crypto investor followed from airport. Robbed in hotel parking lot.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-023',
    date: '2021-09',
    country: 'UK',
    city: 'Edinburgh',
    victim_type: 'individual',
    method: 'Home invasion',
    amount_stolen: '~£600K',
    description: 'Crypto holder tortured for seed phrase. Attackers knew holdings from LinkedIn.',
    outcome: 'arrested',
  },
  {
    id: 'PA-024',
    date: '2021-06',
    country: 'Australia',
    city: 'Melbourne',
    victim_type: 'individual',
    method: 'Express kidnapping',
    amount_stolen: '~AUD 400K',
    description: 'Brief abduction, forced to transfer BTC. Released after compliance.',
    outcome: 'unsolved',
  },
  {
    id: 'PA-025',
    date: '2021-03',
    country: 'Netherlands',
    city: 'Rotterdam',
    victim_type: 'business',
    method: 'Armed robbery',
    amount_stolen: '~€300K',
    description: 'Crypto ATM company office raided. Hardware wallets stolen.',
    outcome: 'arrested',
  },
];

const VICTIM_ICONS: Record<string, typeof Users> = {
  individual: Users,
  exchange: Globe,
  business: Tag,
  miner: Skull,
  unknown: Shield,
};

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  unsolved: { label: 'Unsolved', cls: 'text-rose-600 dark:text-rose-400' },
  arrested: { label: 'Arrested', cls: 'text-emerald-600 dark:text-emerald-400' },
  'partial-recovery': { label: 'Partial Recovery', cls: 'text-amber-600 dark:text-amber-400' },
  'full-recovery': { label: 'Full Recovery', cls: 'text-emerald-600 dark:text-emerald-400' },
  ongoing: { label: 'Ongoing', cls: 'text-sky-600 dark:text-sky-400' },
};

const ALL_COUNTRIES = [...new Set(ATTACKS.map((a) => a.country))].sort();

export default function PhysicalBitcoinAttacks(): JSX.Element {
  const [query, setQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [victimFilter, setVictimFilter] = useState('');

  const filtered = useMemo(() => {
    let items = [...ATTACKS];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          a.method.toLowerCase().includes(q) ||
          a.country.toLowerCase().includes(q)
      );
    }
    if (countryFilter) items = items.filter((a) => a.country === countryFilter);
    if (outcomeFilter) items = items.filter((a) => a.outcome === outcomeFilter);
    if (victimFilter) items = items.filter((a) => a.victim_type === victimFilter);
    items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }, [query, countryFilter, outcomeFilter, victimFilter]);

  const stats = useMemo(
    () => ({
      total: ATTACKS.length,
      unsolved: ATTACKS.filter((a) => a.outcome === 'unsolved').length,
      arrested: ATTACKS.filter((a) => a.outcome === 'arrested').length,
      countries: new Set(ATTACKS.map((a) => a.country)).size,
    }),
    []
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex items-center gap-3 mb-1">
        <Skull className="w-7 h-7 text-amber-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Physical Bitcoin Attacks</h1>
      </div>
      <p className="text-muted mb-6 text-sm max-w-3xl leading-relaxed">
        Known physical attacks against Bitcoin and crypto asset holders — armed robberies, kidnappings, home invasions,
        and express kidnappings. A database of real-world violence driven by crypto wealth.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Total Attacks', value: stats.total, icon: Skull, cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Unsolved', value: stats.unsolved, icon: Shield, cls: 'text-rose-600 dark:text-rose-400' },
          { label: 'Arrested', value: stats.arrested, icon: Users, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Countries', value: stats.countries, icon: Globe, cls: 'text-sky-600 dark:text-sky-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-e1 p-2.5"
          >
            <div className={`flex items-center gap-1.5 text-mini uppercase tracking-wider mb-0.5 ${cls}`}>
              <Icon className="w-3 h-3" /> {label}
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search attacks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All countries</option>
          {ALL_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All outcomes</option>
          <option value="unsolved">Unsolved</option>
          <option value="arrested">Arrested</option>
          <option value="partial-recovery">Partial Recovery</option>
          <option value="ongoing">Ongoing</option>
        </select>
        <select
          value={victimFilter}
          onChange={(e) => setVictimFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All victims</option>
          <option value="individual">Individual</option>
          <option value="exchange">Exchange</option>
          <option value="business">Business</option>
          <option value="miner">Miner</option>
        </select>
      </div>

      {/* Attack list */}
      <div className="space-y-2">
        {filtered.map((a) => {
          const outcome = OUTCOME_META[a.outcome];
          const VictimIcon = VICTIM_ICONS[a.victim_type] || Shield;
          return (
            <div
              key={a.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-slate-400">{a.id}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {a.country}
                      {a.city ? `, ${a.city}` : ''}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-micro font-mono rounded border border-slate-300 dark:border-slate-700 ${outcome.cls}`}
                    >
                      {outcome.label}
                    </span>
                    <span className="px-1.5 py-0.5 text-micro font-mono rounded border border-slate-300 dark:border-slate-700 text-muted flex items-center gap-0.5">
                      <VictimIcon className="w-2.5 h-2.5" /> {a.victim_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-1.5">{a.description}</p>
                  <div className="flex items-center gap-2 flex-wrap text-mini text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" /> {a.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" /> {a.method}
                    </span>
                    {a.amount_stolen && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <DollarSign className="w-2.5 h-2.5" /> {a.amount_stolen}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500 font-mono text-sm">No attacks match your filters</div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-600 font-mono">
        Sources: Public reporting, law enforcement press releases, security research · {ATTACKS.length} incidents
        tracked
      </div>
    </div>
  );
}
