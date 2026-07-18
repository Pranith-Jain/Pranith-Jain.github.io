import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { Calendar, ExternalLink, Globe, Search, Shield, ShieldAlert, ShieldOff, Skull } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface DarknetMarket {
  name: string;
  founded: string;
  closed?: string;
  status: 'active' | 'seized' | 'exit-scam' | 'defunct' | 'compromised';
  url?: string;
  description: string;
  categories: string[];
  country?: string;
  notes?: string;
}

const STATUS_META: Record<DarknetMarket['status'], { label: string; icon: typeof Shield; color: string; bg: string }> =
  {
    active: {
      label: 'Active',
      icon: ShieldAlert,
      color: 'text-emerald-700 dark:text-emerald-300',
      bg: 'border-emerald-500/30 bg-emerald-500/10',
    },
    seized: {
      label: 'Seized',
      icon: ShieldOff,
      color: 'text-rose-700 dark:text-rose-300',
      bg: 'border-rose-500/30 bg-rose-500/10',
    },
    'exit-scam': {
      label: 'Exit Scam',
      icon: Skull,
      color: 'text-amber-700 dark:text-amber-300',
      bg: 'border-amber-500/30 bg-amber-500/10',
    },
    defunct: {
      label: 'Defunct',
      icon: Shield,
      color: 'text-muted',
      bg: 'border-slate-500/30 bg-slate-500/10',
    },
    compromised: {
      label: 'Compromised',
      icon: ShieldOff,
      color: 'text-orange-700 dark:text-orange-300',
      bg: 'border-orange-500/30 bg-orange-500/10',
    },
  };

const MARKETS: DarknetMarket[] = [
  {
    name: 'Hydra',
    founded: '2015',
    closed: '2022-04',
    status: 'seized',
    country: 'Russia/CIS',
    description: 'Largest darknet market by volume. Seized by German BKA. $25M+ in crypto confiscated.',
    categories: ['drugs', 'stolen-data', 'money-laundering'],
    notes: 'Infrastructure seized April 2022. Successor markets emerged.',
  },
  {
    name: 'Genesis Market',
    founded: '2017',
    closed: '2023-04',
    status: 'seized',
    country: 'Multi',
    description:
      'Infostealer marketplace selling browser fingerprints and stolen cookies. Seized in FBI Operation Cookie Monster.',
    categories: ['infostealer', 'credentials', 'fingerprints'],
    notes: 'Seized April 2023. Domain seized by FBI.',
  },
  {
    name: 'BreachForums',
    founded: '2022',
    closed: '2023-09',
    status: 'seized',
    country: 'Multi',
    description: 'Data breach marketplace. Seized by FBI. Admin Pompompurin arrested.',
    categories: ['breach-data', 'leaks'],
    notes: 'Multiple iterations: v1 seized, v2 "BreachForums.VC" also seized. Pompompurin arrested Sept 2023.',
  },
  {
    name: 'BreachForums V3',
    founded: '2023',
    status: 'defunct',
    country: 'Multi',
    description: 'Resurrection of BreachForums after Pompompurin arrest. Short-lived.',
    categories: ['breach-data', 'leaks'],
    notes: 'Brief revival attempt after arrest.',
  },
  {
    name: 'White House Market',
    founded: '2019',
    closed: '2021-10',
    status: 'exit-scam',
    country: 'Multi',
    description: 'Privacy-focused marketplace. Voluntary shutdown with exit scam concerns.',
    categories: ['drugs', 'counterfeit'],
    notes: 'Forced Monero-only policy. Shut down Oct 2021.',
  },
  {
    name: 'Torzon',
    founded: '2023',
    status: 'active',
    country: 'Multi',
    description: 'Emerging marketplace post-Hydra. Drugs, data, fraud.',
    categories: ['drugs', 'stolen-data', 'fraud'],
    notes: 'Active as of 2024. Growing user base.',
  },
  {
    name: 'Russian Market',
    founded: '2019',
    status: 'active',
    country: 'Russia',
    description: 'Russian-language marketplace. Stolen cards, credentials, logs.',
    categories: ['stolen-data', 'credentials', 'cards'],
    notes: 'Active. Focus on carding and credential stuffing.',
  },
  {
    name: '2easy',
    founded: '2021',
    status: 'active',
    country: 'Russia',
    description: 'Russian-language marketplace for stolen data, access brokers.',
    categories: ['stolen-data', 'access-broker'],
    notes: 'Active. Popular among Russian-speaking threat actors.',
  },
  {
    name: 'Vices Market',
    founded: '2023',
    status: 'active',
    country: 'Multi',
    description: 'Newer marketplace with drugs, fraud, and digital goods.',
    categories: ['drugs', 'fraud', 'digital-goods'],
    notes: 'Active as of 2024.',
  },
  {
    name: 'Mega Market',
    founded: '2022',
    status: 'active',
    country: 'Russia',
    description: 'Russian-language successor to Hydra. Large product catalog.',
    categories: ['drugs', 'stolen-data', 'counterfeit'],
    notes: 'Active. One of the largest post-Hydra markets.',
  },
  {
    name: 'BlackSprut',
    founded: '2022',
    status: 'active',
    country: 'Russia',
    description: 'Russian-language marketplace. Drugs, forged documents.',
    categories: ['drugs', 'forged-documents'],
    notes: 'Active. Major Russian market.',
  },
  {
    name: 'Abacus Market',
    founded: '2022',
    status: 'active',
    country: 'Multi',
    description: 'English-language marketplace. Drugs, fraud, digital goods.',
    categories: ['drugs', 'fraud', 'digital-goods'],
    notes: 'Active. Growing user base.',
  },
  {
    name: 'World Market',
    founded: '2020',
    closed: '2022-08',
    status: 'exit-scam',
    country: 'Multi',
    description: 'Exit scammed Aug 2022. Vendors lost escrow funds.',
    categories: ['drugs', 'fraud'],
    notes: 'Exit scam with estimated $3M+ in vendor funds.',
  },
  {
    name: 'Cannahome',
    founded: '2019',
    closed: '2021-05',
    status: 'defunct',
    country: 'Multi',
    description: 'Cannabis-focused marketplace. Voluntary closure.',
    categories: ['drugs'],
    notes: 'Shut down May 2021. Merged with White House Market users.',
  },
  {
    name: 'Dark0de Reborn',
    founded: '2020',
    closed: '2021-06',
    status: 'defunct',
    country: 'Multi',
    description: 'Multi-purpose marketplace. Shut down voluntarily.',
    categories: ['drugs', 'fraud', 'digital-goods'],
    notes: 'Shut down June 2021.',
  },
  {
    name: 'ASAP Market',
    founded: '2022',
    status: 'active',
    country: 'Multi',
    description: 'English-language marketplace. Drugs, fraud, services.',
    categories: ['drugs', 'fraud', 'services'],
    notes: 'Active.',
  },
  {
    name: 'DrugHub Market',
    founded: '2023',
    status: 'active',
    country: 'Multi',
    description: 'Drug-focused marketplace with escrow system.',
    categories: ['drugs'],
    notes: 'Active.',
  },
  {
    name: 'Nemesis Market',
    founded: '2022',
    closed: '2024-03',
    status: 'seized',
    country: 'Multi',
    description: 'Seized by law enforcement March 2024.',
    categories: ['drugs', 'stolen-data'],
    notes: 'Seized March 2024. Operator arrested.',
  },
  {
    name: 'Bohemia Market',
    founded: '2021',
    closed: '2023-12',
    status: 'exit-scam',
    country: 'Multi',
    description: 'Exit scam Dec 2023. Large vendor base lost funds.',
    categories: ['drugs', 'fraud'],
    notes: 'Exit scam with estimated $10M+ in escrow.',
  },
  {
    name: 'Kingdom Market',
    founded: '2021',
    closed: '2023-12',
    status: 'seized',
    country: 'Germany',
    description: 'Seized by German BKA December 2023. Operator arrested.',
    categories: ['drugs', 'stolen-data', 'malware'],
    notes: 'Seized Dec 2023. Operator sentenced.',
  },
  {
    name: 'Incognito Market',
    founded: '2023',
    closed: '2024-03',
    status: 'exit-scam',
    country: 'Multi',
    description: 'Exit scam March 2024. Operator disappeared with escrow.',
    categories: ['drugs'],
    notes: 'Exit scam. Operator "riddle" vanished.',
  },
];

const ALL_CATEGORIES = [...new Set(MARKETS.flatMap((m) => m.categories))].sort();

export default function DarknetMarketsTimeline(): JSX.Element {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [catFilter, setCatFilter] = useState('');

  const filtered = useMemo(() => {
    let items = [...MARKETS];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.country?.toLowerCase().includes(q)
      );
    }
    if (statusFilter.size > 0) {
      items = items.filter((m) => statusFilter.has(m.status));
    }
    if (catFilter) {
      items = items.filter((m) => m.categories.includes(catFilter));
    }
    items.sort((a, b) => b.founded.localeCompare(a.founded));
    return items;
  }, [query, statusFilter, catFilter]);

  const stats = useMemo(() => {
    return {
      total: MARKETS.length,
      active: MARKETS.filter((m) => m.status === 'active').length,
      seized: MARKETS.filter((m) => m.status === 'seized').length,
      exitScam: MARKETS.filter((m) => m.status === 'exit-scam').length,
    };
  }, []);

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        back
      </BackLink>

      <div className="flex items-center gap-3 mb-1">
        <Globe className="w-7 h-7 text-violet-500" />
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 dark:text-slate-100">
          Darknet Markets Timeline
        </h1>
      </div>
      <p className="text-muted mb-6 text-sm max-w-3xl leading-relaxed">
        Historical and current darknet marketplaces — status, founding dates, seizure history, and exit scams. Data
        sourced from{' '}
        <a
          href="https://www.dread.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          Dread
        </a>
        ,{' '}
        <a
          href="https://tortaxi.info"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          TorTaxi
        </a>
        , and public reporting.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Total', value: stats.total, cls: 'text-slate-500' },
          { label: 'Active', value: stats.active, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Seized', value: stats.seized, cls: 'text-rose-600 dark:text-rose-400' },
          { label: 'Exit Scams', value: stats.exitScam, cls: 'text-amber-600 dark:text-amber-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="surface-card/50 shadow-e1 p-2.5">
            <div className={`text-mini uppercase tracking-wider mb-0.5 ${cls}`}>{label}</div>
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
            placeholder="Search market name, description, country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All categories</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-xs text-slate-500 mr-1 font-mono">status:</span>
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const active = statusFilter.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleStatus(key)}
              className={`px-2 py-1 rounded text-xs font-mono font-medium border flex items-center gap-1 transition ${
                active
                  ? `${meta.bg} ${meta.color}`
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-400'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
        {statusFilter.size > 0 && (
          <button
            onClick={() => setStatusFilter(new Set())}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline ml-2"
          >
            clear
          </button>
        )}
      </div>

      {/* Market list */}
      <div className="space-y-2">
        {filtered.map((m) => {
          const meta = STATUS_META[m.status];
          return (
            <div
              key={m.name}
              className={`rounded-xl border p-4 hover:shadow-e1 transition ${
                m.status === 'active'
                  ? 'border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-[rgb(var(--surface-200))]/50'
                  : m.status === 'seized'
                    ? 'border-rose-200 dark:border-rose-800/40 bg-rose-50/30 dark:bg-rose-900/5'
                    : m.status === 'exit-scam'
                      ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-900/5'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{m.name}</h3>
                    <span className={`px-1.5 py-0.5 text-micro font-mono rounded border ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                    {m.country && (
                      <span className="px-1.5 py-0.5 text-micro font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted">
                        {m.country}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-1.5">{m.description}</p>
                  <div className="flex items-center gap-2 flex-wrap text-mini text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" /> Founded {m.founded}
                    </span>
                    {m.closed && <span className="text-rose-500">Closed {m.closed}</span>}
                    {m.url && (
                      <a
                        href={sanitizeUrl(m.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> onion
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {m.categories.map((c) => (
                      <span
                        key={c}
                        className="px-1.5 py-0.5 text-micro font-mono rounded border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  {m.notes && <p className="text-mini text-slate-500 dark:text-slate-500 mt-1.5 italic">{m.notes}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500 font-mono text-sm">No markets match your filters</div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))] text-xs text-slate-500 dark:text-slate-400 font-mono">
        Sources: Dread, TorTaxi, public law-enforcement reporting · {MARKETS.length} markets tracked
      </div>
    </div>
  );
}
