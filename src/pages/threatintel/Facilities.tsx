import { Fragment, Suspense, lazy, useMemo, useState } from 'react';
import {
  MapPin,
  Search,
  Building2,
  Atom,
  AlertTriangle,
  Shield,
  Anchor,
  Landmark,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

const PulseMap = lazy(() => import('./PulseMap'));

/* ─── Types ─────────────────────────────────────────────────────────────── */

type FacilityType =
  | 'conflict_zone'
  | 'military_base'
  | 'nuclear_site'
  | 'sanctioned_country'
  | 'disputed_territory'
  | 'datacenter'
  | 'ixp'
  | 'cloud_region'
  | 'tech_hq'
  | 'cable'
  | 'exchange'
  | 'financial';

interface Facility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: FacilityType;
  description: string;
  country: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  region?: string;
}

/* ─── Static Facility Data ──────────────────────────────────────────────── */
// Extracted from api/src/routes/global-pulse/static-data.ts for client-side rendering.

const MENA_COUNTRIES = new Set([
  'DZ',
  'BH',
  'EG',
  'IQ',
  'IR',
  'IL',
  'JO',
  'KW',
  'LB',
  'LY',
  'MA',
  'OM',
  'PS',
  'QA',
  'SA',
  'SY',
  'TN',
  'TR',
  'AE',
  'YE',
]);

const FACILITIES: Facility[] = [
  // Conflict Zones
  {
    id: 'cz-1',
    name: 'Ukraine-Russia Front Line',
    lat: 48.5,
    lng: 37.5,
    type: 'conflict_zone',
    description: 'Active military conflict zone',
    country: 'UA',
    severity: 'critical',
  },
  {
    id: 'cz-2',
    name: 'Gaza Strip',
    lat: 31.5,
    lng: 34.47,
    type: 'conflict_zone',
    description: 'Active conflict zone',
    country: 'PS',
    severity: 'critical',
  },
  {
    id: 'cz-3',
    name: 'Sudan Conflict Zone',
    lat: 15.5,
    lng: 32.5,
    type: 'conflict_zone',
    description: 'Civil war and humanitarian crisis',
    country: 'SD',
    severity: 'critical',
  },
  {
    id: 'cz-4',
    name: 'Myanmar Conflict',
    lat: 20.0,
    lng: 96.0,
    type: 'conflict_zone',
    description: 'Ongoing civil conflict',
    country: 'MM',
    severity: 'high',
  },
  {
    id: 'cz-5',
    name: 'Yemen Conflict',
    lat: 15.5,
    lng: 48.0,
    type: 'conflict_zone',
    description: 'Ongoing conflict and Houthi attacks',
    country: 'YE',
    severity: 'high',
  },
  {
    id: 'cz-6',
    name: 'Ethiopia-Tigray',
    lat: 13.5,
    lng: 39.5,
    type: 'conflict_zone',
    description: 'Post-conflict instability',
    country: 'ET',
    severity: 'high',
  },
  {
    id: 'cz-7',
    name: 'Somalia Al-Shabaab',
    lat: 2.0,
    lng: 45.3,
    type: 'conflict_zone',
    description: 'Insurgency and counter-terrorism',
    country: 'SO',
    severity: 'high',
  },
  {
    id: 'cz-8',
    name: 'Sahel Region',
    lat: 15.0,
    lng: 0.0,
    type: 'conflict_zone',
    description: 'Mali, Burkina Faso, Niger instability',
    country: 'ML',
    severity: 'high',
  },
  {
    id: 'cz-9',
    name: 'Haiti Gang Violence',
    lat: 18.5,
    lng: -72.3,
    type: 'conflict_zone',
    description: 'Gang violence and instability',
    country: 'HT',
    severity: 'high',
  },
  {
    id: 'cz-10',
    name: 'Syria Northeast',
    lat: 36.5,
    lng: 40.0,
    type: 'conflict_zone',
    description: 'Ongoing instability',
    country: 'SY',
    severity: 'medium',
  },
  // Sanctioned Countries
  {
    id: 'sc-1',
    name: 'Russia',
    lat: 61.52,
    lng: 105.32,
    type: 'sanctioned_country',
    description: 'Heavily sanctioned by US, EU, UK, others',
    country: 'RU',
    severity: 'high',
  },
  {
    id: 'sc-2',
    name: 'Iran',
    lat: 32.43,
    lng: 53.68,
    type: 'sanctioned_country',
    description: 'Comprehensive sanctions',
    country: 'IR',
    severity: 'high',
  },
  {
    id: 'sc-3',
    name: 'North Korea',
    lat: 40.34,
    lng: 127.51,
    type: 'sanctioned_country',
    description: 'Maximum pressure sanctions',
    country: 'KP',
    severity: 'critical',
  },
  {
    id: 'sc-4',
    name: 'Syria',
    lat: 34.8,
    lng: 38.99,
    type: 'sanctioned_country',
    description: 'Caesar Act sanctions',
    country: 'SY',
    severity: 'high',
  },
  {
    id: 'sc-5',
    name: 'Venezuela',
    lat: 6.42,
    lng: -66.59,
    type: 'sanctioned_country',
    description: 'Sectoral sanctions',
    country: 'VE',
    severity: 'medium',
  },
  {
    id: 'sc-6',
    name: 'Cuba',
    lat: 21.52,
    lng: -80.0,
    type: 'sanctioned_country',
    description: 'US embargo',
    country: 'CU',
    severity: 'medium',
  },
  {
    id: 'sc-7',
    name: 'Belarus',
    lat: 53.71,
    lng: 27.95,
    type: 'sanctioned_country',
    description: 'Sanctions for enabling Russia',
    country: 'BY',
    severity: 'medium',
  },
  {
    id: 'sc-8',
    name: 'Myanmar',
    lat: 21.91,
    lng: 95.96,
    type: 'sanctioned_country',
    description: 'Sanctions post-coup',
    country: 'MM',
    severity: 'medium',
  },
  // Military Bases
  {
    id: 'mb-1',
    name: 'Naval Station Norfolk',
    lat: 36.95,
    lng: -76.29,
    type: 'military_base',
    description: 'Largest naval base in the world',
    country: 'US',
    severity: 'low',
  },
  {
    id: 'mb-2',
    name: 'Ramstein Air Base',
    lat: 49.44,
    lng: 7.6,
    type: 'military_base',
    description: 'US Air Force in Europe',
    country: 'DE',
    severity: 'low',
  },
  {
    id: 'mb-3',
    name: 'Camp Humphreys',
    lat: 36.97,
    lng: 127.03,
    type: 'military_base',
    description: 'Largest US overseas base',
    country: 'KR',
    severity: 'low',
  },
  {
    id: 'mb-4',
    name: 'Yokosuka Naval Base',
    lat: 35.33,
    lng: 139.67,
    type: 'military_base',
    description: 'US 7th Fleet headquarters',
    country: 'JP',
    severity: 'low',
  },
  {
    id: 'mb-5',
    name: 'Diego Garcia',
    lat: -7.32,
    lng: 72.42,
    type: 'military_base',
    description: 'Strategic Indian Ocean base',
    country: 'IO',
    severity: 'low',
  },
  {
    id: 'mb-6',
    name: 'Guantánamo Bay',
    lat: 19.93,
    lng: -75.15,
    type: 'military_base',
    description: 'US Naval Station',
    country: 'CU',
    severity: 'low',
  },
  {
    id: 'mb-7',
    name: 'Incirlik Air Base',
    lat: 37.0,
    lng: 35.43,
    type: 'military_base',
    description: 'NATO base in Turkey',
    country: 'TR',
    severity: 'low',
  },
  {
    id: 'mb-8',
    name: 'Pine Gap',
    lat: -23.8,
    lng: 133.74,
    type: 'military_base',
    description: 'Joint US-Australia facility',
    country: 'AU',
    severity: 'low',
  },
  // Nuclear Sites
  {
    id: 'ns-1',
    name: 'Chernobyl Exclusion Zone',
    lat: 51.39,
    lng: 30.1,
    type: 'nuclear_site',
    description: 'Former nuclear plant',
    country: 'UA',
    severity: 'medium',
  },
  {
    id: 'ns-2',
    name: 'Zaporizhzhia Nuclear Plant',
    lat: 47.51,
    lng: 35.59,
    type: 'nuclear_site',
    description: 'Largest nuclear plant in Europe (occupied)',
    country: 'UA',
    severity: 'critical',
  },
  {
    id: 'ns-3',
    name: 'Fukushima Daiichi',
    lat: 37.42,
    lng: 141.03,
    type: 'nuclear_site',
    description: 'Decommissioning site',
    country: 'JP',
    severity: 'medium',
  },
  {
    id: 'ns-4',
    name: 'Bushehr Nuclear Plant',
    lat: 28.83,
    lng: 50.88,
    type: 'nuclear_site',
    description: 'Iran nuclear facility',
    country: 'IR',
    severity: 'high',
  },
  {
    id: 'ns-5',
    name: 'Natanz Enrichment',
    lat: 33.72,
    lng: 51.72,
    type: 'nuclear_site',
    description: 'Iran enrichment facility',
    country: 'IR',
    severity: 'high',
  },
  {
    id: 'ns-6',
    name: 'Yongbyon Nuclear',
    lat: 39.8,
    lng: 125.76,
    type: 'nuclear_site',
    description: 'North Korea nuclear complex',
    country: 'KP',
    severity: 'critical',
  },
  {
    id: 'ns-7',
    name: 'Dimona Nuclear',
    lat: 31.05,
    lng: 35.06,
    type: 'nuclear_site',
    description: 'Israel nuclear facility',
    country: 'IL',
    severity: 'medium',
  },
  {
    id: 'ns-8',
    name: 'Sellafield',
    lat: 54.42,
    lng: -3.5,
    type: 'nuclear_site',
    description: 'UK nuclear reprocessing',
    country: 'GB',
    severity: 'low',
  },
  // Disputed Territories
  {
    id: 'dt-1',
    name: 'Crimea',
    lat: 45.35,
    lng: 34.0,
    type: 'disputed_territory',
    description: 'Annexed by Russia, claimed by Ukraine',
    country: 'UA',
    severity: 'high',
  },
  {
    id: 'dt-2',
    name: 'Taiwan Strait',
    lat: 24.0,
    lng: 119.0,
    type: 'disputed_territory',
    description: 'Cross-strait tensions',
    country: 'TW',
    severity: 'high',
  },
  {
    id: 'dt-3',
    name: 'Kashmir',
    lat: 34.0,
    lng: 76.0,
    type: 'disputed_territory',
    description: 'India-Pakistan dispute',
    country: 'IN',
    severity: 'medium',
  },
  {
    id: 'dt-4',
    name: 'South China Sea',
    lat: 15.0,
    lng: 115.0,
    type: 'disputed_territory',
    description: 'Territorial disputes',
    country: 'CN',
    severity: 'medium',
  },
  {
    id: 'dt-5',
    name: 'Golan Heights',
    lat: 33.0,
    lng: 35.8,
    type: 'disputed_territory',
    description: 'Occupied by Israel',
    country: 'SY',
    severity: 'medium',
  },
  {
    id: 'dt-6',
    name: 'Western Sahara',
    lat: 24.5,
    lng: -13.0,
    type: 'disputed_territory',
    description: 'Morocco-Polisario dispute',
    country: 'MA',
    severity: 'low',
  },
  {
    id: 'dt-7',
    name: 'Transnistria',
    lat: 47.25,
    lng: 29.4,
    type: 'disputed_territory',
    description: 'Moldova breakaway region',
    country: 'MD',
    severity: 'medium',
  },
  {
    id: 'dt-8',
    name: 'Nagorno-Karabakh',
    lat: 39.8,
    lng: 46.75,
    type: 'disputed_territory',
    description: 'Former conflict zone',
    country: 'AZ',
    severity: 'medium',
  },
  // Tech Infrastructure
  {
    id: 'ti-1',
    name: 'Ashburn Data Center Alley',
    lat: 39.04,
    lng: -77.49,
    type: 'datacenter',
    description: 'Equinix/Digital Realty hub',
    country: 'US',
    severity: 'low',
  },
  {
    id: 'ti-2',
    name: 'London Data Center',
    lat: 51.51,
    lng: -0.13,
    type: 'datacenter',
    description: 'Equinix/Digital Realty',
    country: 'GB',
    severity: 'low',
  },
  {
    id: 'ti-3',
    name: 'Frankfurt DE-CIX',
    lat: 50.11,
    lng: 8.68,
    type: 'ixp',
    description: 'Major European IXP',
    country: 'DE',
    severity: 'low',
  },
  {
    id: 'ti-4',
    name: 'Singapore Data Center',
    lat: 1.35,
    lng: 103.82,
    type: 'datacenter',
    description: 'Equinix',
    country: 'SG',
    severity: 'low',
  },
  {
    id: 'ti-5',
    name: 'Dubai DIFC',
    lat: 25.22,
    lng: 55.28,
    type: 'financial',
    description: 'Dubai International Financial Centre',
    country: 'AE',
    severity: 'low',
  },
];

/* ─── Type Config ───────────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<FacilityType, { label: string; icon: typeof MapPin; color: string; bgColor: string }> = {
  conflict_zone: {
    label: 'Conflict Zone',
    icon: AlertTriangle,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  sanctioned_country: {
    label: 'Sanctioned',
    icon: Shield,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  military_base: {
    label: 'Military Base',
    icon: Anchor,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  nuclear_site: {
    label: 'Nuclear Site',
    icon: Atom,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  disputed_territory: {
    label: 'Disputed Territory',
    icon: Landmark,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  datacenter: {
    label: 'Data Center',
    icon: Building2,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
  },
  ixp: {
    label: 'IXP',
    icon: Building2,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
  },
  cloud_region: {
    label: 'Cloud Region',
    icon: Building2,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
  },
  tech_hq: {
    label: 'Tech HQ',
    icon: Building2,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
  },
  cable: {
    label: 'Cable Landing',
    icon: Anchor,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
  },
  exchange: {
    label: 'Stock Exchange',
    icon: Landmark,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
  },
  financial: {
    label: 'Financial Center',
    icon: Landmark,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-500/10',
  medium: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  low: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as FacilityType[];

/* ─── Component ─────────────────────────────────────────────────────────── */

interface FacilitiesProps {
  bare?: boolean;
}

export default function Facilities({ bare }: FacilitiesProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<FacilityType>>(new Set(ALL_TYPES));
  const [regionFilter, setRegionFilter] = useState<'all' | 'mena'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'severity' | 'type'>('type');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'map'>('table');

  const filtered = useMemo(() => {
    return FACILITIES.filter((f) => {
      if (!activeTypes.has(f.type)) return false;
      if (regionFilter === 'mena' && !MENA_COUNTRIES.has(f.country)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.country.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'severity') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.severity] - order[b.severity];
      }
      return a.type.localeCompare(b.type);
    });
  }, [activeTypes, regionFilter, search, sortBy]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const f of filtered) {
      byType[f.type] = (byType[f.type] || 0) + 1;
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    return { byType, bySeverity, total: filtered.length };
  }, [filtered]);

  const toggleType = (t: FacilityType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const body = (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="surface-card/60 p-3">
          <div className="text-micro font-mono uppercase text-slate-500 mb-1">Total</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="text-micro font-mono uppercase text-rose-600 dark:text-rose-400 mb-1">Critical</div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.bySeverity.critical ?? 0}</div>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
          <div className="text-micro font-mono uppercase text-orange-600 dark:text-orange-400 mb-1">High</div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.bySeverity.high ?? 0}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="text-micro font-mono uppercase text-amber-600 dark:text-amber-400 mb-1">Medium</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.bySeverity.medium ?? 0}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search facilities..."
            className="w-full pl-9 pr-3 py-2 text-sm font-mono surface-card/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`px-3 py-1.5 text-xs font-mono rounded-xl border transition-colors ${
              view === 'table'
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/30'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-400 hover:text-slate-600'
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            className={`px-3 py-1.5 text-xs font-mono rounded-xl border transition-colors ${
              view === 'map'
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/30'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-400 hover:text-slate-600'
            }`}
          >
            Map
          </button>
        </div>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value as 'all' | 'mena')}
          className="px-3 py-1.5 text-xs font-mono surface-card/60 text-slate-900 dark:text-slate-100"
        >
          <option value="all">All Regions</option>
          <option value="mena">MENA Focus</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'severity' | 'type')}
          className="px-3 py-1.5 text-xs font-mono surface-card/60 text-slate-900 dark:text-slate-100"
        >
          <option value="type">Sort by Type</option>
          <option value="severity">Sort by Severity</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Type Filters */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => {
          const config = TYPE_CONFIG[t];
          const active = activeTypes.has(t);
          const count = FACILITIES.filter((f) => f.type === t).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-xl border transition-all ${
                active
                  ? `${config.bgColor} ${config.color} border-current`
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-400 opacity-50'
              }`}
            >
              <config.icon size={12} />
              {config.label}
              <span className="text-micro opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Map View */}
      {view === 'map' && (
        <div
          className="rounded-xl overflow-hidden border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
          style={{ minHeight: '500px' }}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[500px]">
                <div className="text-sm text-slate-400">Loading map…</div>
              </div>
            }
          >
            <PulseMap
              markers={filtered.map((f) => ({
                id: f.id,
                lat: f.lat,
                lng: f.lng,
                severity: f.severity,
                kind: f.type,
                title: f.name,
                description: f.description,
                source: 'Facilities DB',
              }))}
            />
          </Suspense>
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div className="surface-card/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <th className="px-4 py-3 text-left text-micro font-mono uppercase text-slate-500">Name</th>
                  <th className="px-4 py-3 text-left text-micro font-mono uppercase text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-micro font-mono uppercase text-slate-500">Country</th>
                  <th className="px-4 py-3 text-left text-micro font-mono uppercase text-slate-500">Severity</th>
                  <th className="px-4 py-3 text-left text-micro font-mono uppercase text-slate-500">Coords</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const config = TYPE_CONFIG[f.type];
                  const isExpanded = expandedId === f.id;
                  return (
                    <Fragment key={f.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedId(isExpanded ? null : f.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.3)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-inset"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronUp size={12} className="text-slate-400" />
                            ) : (
                              <ChevronDown size={12} className="text-slate-400" />
                            )}
                            <span className="font-medium text-slate-900 dark:text-slate-100">{f.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border ${config.bgColor} ${config.color}`}
                          >
                            <config.icon size={10} />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-muted">{f.country}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-mono rounded ${SEVERITY_COLORS[f.severity]}`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {f.lat.toFixed(2)}, {f.lng.toFixed(2)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${f.id}-detail`}>
                          <td colSpan={5} className="px-4 py-3 bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.2)]">
                            <p className="text-sm text-muted">{f.description}</p>
                            <a
                              href={`https://www.google.com/maps?q=${f.lat},${f.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-xs font-mono text-brand-500 hover:text-brand-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open in Maps <ExternalLink size={10} />
                            </a>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              No facilities match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
  if (bare) return body;
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Building2 size={28} />}
      title="Facilities Database"
      description="Strategic facilities worldwide — conflict zones, military bases, nuclear sites, disputed territories, sanctions targets, and critical infrastructure."
      maxWidthClass="max-w-7xl"
    >
      {body}
    </DataPageLayout>
  );
}
