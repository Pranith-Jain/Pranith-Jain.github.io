import { useMemo, useState, lazy, Suspense, type JSX } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Globe, Search, X } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import {
  OSINT_COUNTRIES,
  CATEGORY_LABELS,
  type OsintCountry,
  type OsintCountryResource,
} from '../../data/threatintel/osint-countries';

const OsintMapChart = lazy(() => import('./OsintMapChart'));

const TOPO_URL = '/world-110m.json';

const CATEGORY_ORDER = [
  'osint-portal',
  'bookmarks',
  'regional-guide',
  'github',
  'community',
  'research',
  'company-registry',
  'government',
  'guide',
  'general',
];

const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF',
  '008': 'AL',
  '012': 'DZ',
  '020': 'AD',
  '024': 'AO',
  '031': 'AZ',
  '032': 'AR',
  '036': 'AU',
  '040': 'AT',
  '044': 'BS',
  '048': 'BH',
  '050': 'BD',
  '051': 'AM',
  '052': 'BB',
  '056': 'BE',
  '060': 'BM',
  '064': 'BT',
  '068': 'BO',
  '070': 'BA',
  '072': 'BW',
  '076': 'BR',
  '084': 'BZ',
  '090': 'SB',
  '096': 'BN',
  '100': 'BG',
  '104': 'MM',
  '108': 'BI',
  '112': 'BY',
  '116': 'KH',
  '120': 'CM',
  '124': 'CA',
  '140': 'CF',
  '144': 'LK',
  '148': 'TD',
  '152': 'CL',
  '156': 'CN',
  '158': 'TW',
  '170': 'CO',
  '174': 'KM',
  '178': 'CG',
  '180': 'CD',
  '188': 'CR',
  '191': 'HR',
  '192': 'CU',
  '196': 'CY',
  '203': 'CZ',
  '204': 'BJ',
  '208': 'DK',
  '214': 'DO',
  '218': 'EC',
  '222': 'SV',
  '226': 'GQ',
  '231': 'ET',
  '232': 'ER',
  '233': 'EE',
  '242': 'FJ',
  '246': 'FI',
  '250': 'FR',
  '262': 'DJ',
  '266': 'GA',
  '268': 'GE',
  '270': 'GM',
  '276': 'DE',
  '288': 'GH',
  '300': 'GR',
  '308': 'GD',
  '320': 'GT',
  '324': 'GN',
  '328': 'GY',
  '332': 'HT',
  '340': 'HN',
  '348': 'HU',
  '352': 'IS',
  '356': 'IN',
  '360': 'ID',
  '364': 'IR',
  '368': 'IQ',
  '372': 'IE',
  '376': 'IL',
  '380': 'IT',
  '384': 'CI',
  '388': 'JM',
  '392': 'JP',
  '398': 'KZ',
  '400': 'JO',
  '404': 'KE',
  '408': 'KP',
  '410': 'KR',
  '414': 'KW',
  '417': 'KG',
  '418': 'LA',
  '422': 'LB',
  '426': 'LS',
  '430': 'LR',
  '434': 'LY',
  '440': 'LT',
  '442': 'LU',
  '450': 'MG',
  '454': 'MW',
  '458': 'MY',
  '462': 'MV',
  '466': 'ML',
  '478': 'MR',
  '480': 'MU',
  '484': 'MX',
  '496': 'MN',
  '498': 'MD',
  '504': 'MA',
  '508': 'MZ',
  '512': 'OM',
  '516': 'NA',
  '524': 'NP',
  '528': 'NL',
  '540': 'NC',
  '548': 'VU',
  '554': 'NZ',
  '558': 'NI',
  '562': 'NE',
  '566': 'NG',
  '578': 'NO',
  '586': 'PK',
  '591': 'PA',
  '598': 'PG',
  '600': 'PY',
  '604': 'PE',
  '608': 'PH',
  '616': 'PL',
  '620': 'PT',
  '624': 'GW',
  '626': 'TL',
  '634': 'QA',
  '642': 'RO',
  '643': 'RU',
  '646': 'RW',
  '662': 'LC',
  '670': 'VC',
  '678': 'ST',
  '682': 'SA',
  '686': 'SN',
  '694': 'SL',
  '702': 'SG',
  '703': 'SK',
  '704': 'VN',
  '705': 'SI',
  '706': 'SO',
  '710': 'ZA',
  '716': 'ZW',
  '724': 'ES',
  '728': 'SS',
  '729': 'SD',
  '732': 'EH',
  '740': 'SR',
  '748': 'SZ',
  '752': 'SE',
  '756': 'CH',
  '760': 'SY',
  '762': 'TJ',
  '764': 'TH',
  '768': 'TG',
  '780': 'TT',
  '784': 'AE',
  '788': 'TN',
  '792': 'TR',
  '795': 'TM',
  '798': 'TV',
  '800': 'UG',
  '804': 'UA',
  '807': 'MK',
  '818': 'EG',
  '826': 'GB',
  '834': 'TZ',
  '840': 'US',
  '854': 'BF',
  '858': 'UY',
  '860': 'UZ',
  '862': 'VE',
  '887': 'YE',
  '894': 'ZM',
};

const alpha2ByNumeric = new Map(Object.entries(NUMERIC_TO_ALPHA2));

const countryByAlpha2 = new Map<string, OsintCountry>();
for (const c of OSINT_COUNTRIES) {
  if (c.alpha2 !== '--') countryByAlpha2.set(c.alpha2, c);
}

const ALL_CATEGORIES = [...new Set(OSINT_COUNTRIES.flatMap((c) => c.resources.map((r) => r.category)))]
  .filter(Boolean)
  .sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

const MAX_RESOURCE_COUNT = Math.max(1, ...OSINT_COUNTRIES.map((c) => c.resources.length));

function colourFor(count: number): string {
  if (count === 0) return '#1e293b';
  const ratio = count / MAX_RESOURCE_COUNT;
  if (ratio > 0.5) return '#22c55e';
  if (ratio > 0.2) return '#86efac';
  if (ratio > 0.05) return '#bbf7d0';
  return '#3b82f6';
}

export default function OsintCountryMap(): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedAlpha2, setSelectedAlpha2] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const selectedCountry = selectedAlpha2 ? (countryByAlpha2.get(selectedAlpha2) ?? null) : null;

  const filteredCountries = useMemo(() => {
    if (!query) return selectedCountry ? [selectedCountry] : [];
    const q = query.toLowerCase();
    return OSINT_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.resources.some((r) => r.name.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [query, selectedCountry]);

  const selectedResources = useMemo(() => {
    if (!selectedCountry) return [];
    let rs = selectedCountry.resources;
    if (activeCategories.size > 0) {
      rs = rs.filter((r) => activeCategories.has(r.category));
    }
    if (query) {
      const q = query.toLowerCase();
      rs = rs.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rs;
  }, [selectedCountry, activeCategories, query]);

  function handleSelect(alpha2: string | null) {
    setSelectedAlpha2(alpha2);
    setActiveCategories(new Set());
  }

  return (
    <DataPageLayout
      title="OSINT Country Resources"
      description="Interactive world map of OSINT resources organized by country — click any nation for curated tools, registries, and investigation links."
      backTo="/threatintel"
      icon={<Globe className="w-5 h-5" />}
    >
      <div className="flex flex-col gap-4">
        {/* Search row */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              selectedCountry ? `Search within ${selectedCountry.name}...` : 'Search countries or resources...'
            }
            className="w-full pl-9 pr-4 py-2 surface-card text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Map section */}
          <div className="lg:w-3/5 w-full">
            <div className="surface-card/60 overflow-hidden">
              <div className="p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {selectedCountry ? selectedCountry.name : `${OSINT_COUNTRIES.length} countries`}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {selectedCountry
                    ? `${selectedCountry.resources.length} resources`
                    : `${OSINT_COUNTRIES.reduce((s, c) => s + c.resources.length, 0)} total resources`}
                </span>
              </div>
              <Suspense
                fallback={
                  <div className="h-[400px] flex items-center justify-center text-slate-500 text-sm">
                    Loading map...
                  </div>
                }
              >
                <OsintMapChart
                  topoUrl={TOPO_URL}
                  alpha2ByNumeric={alpha2ByNumeric}
                  countryByAlpha2={countryByAlpha2}
                  selectedAlpha2={selectedAlpha2}
                  colourFor={colourFor}
                  onSelect={handleSelect}
                  onHover={() => {}}
                />
              </Suspense>
            </div>

            {/* Quick-search country list when no country selected */}
            {!selectedCountry && query && (
              <div className="mt-2 surface-card/60 max-h-60 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">No countries match "{query}"</div>
                ) : (
                  filteredCountries.map((c) => (
                    <button
                      key={c.alpha2}
                      onClick={() => {
                        handleSelect(c.alpha2);
                        setQuery('');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] flex items-center gap-2"
                    >
                      <span className="text-slate-500">{c.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{c.resources.length} resources</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Resource panel */}
          <div className="lg:w-2/5 w-full">
            {selectedCountry ? (
              <div className="surface-card/60 flex flex-col h-[500px]">
                {/* Header */}
                <div className="p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCountry.name}</h3>
                    <p className="text-xs text-slate-500">
                      {selectedResources.length} of {selectedCountry.resources.length} resources
                    </p>
                  </div>
                  <button
                    onClick={() => handleSelect(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Category filters */}
                {ALL_CATEGORIES.length > 0 && (
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex flex-wrap gap-1.5 shrink-0">
                    {ALL_CATEGORIES.map((cat) => {
                      const count = selectedCountry.resources.filter((r) => r.category === cat).length;
                      if (count === 0) return null;
                      const active = activeCategories.has(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            const next = new Set(activeCategories);
                            if (active) next.delete(cat);
                            else next.add(cat);
                            setActiveCategories(next);
                          }}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                            active
                              ? 'bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-200'
                              : 'bg-white dark:bg-[rgb(var(--surface-300)/0.5)] border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          {CATEGORY_LABELS[cat] ?? cat} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Resource list */}
                <div className="flex-1 overflow-y-auto">
                  {selectedResources.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500 text-center">
                      {activeCategories.size > 0
                        ? 'No resources match the current filter.'
                        : 'No OSINT resources catalogued for this country.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedResources.map((r, i) => (
                        <ResourceRow key={`${r.url}-${i}`} resource={r} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="surface-card/60 h-[500px] flex items-center justify-center">
                <div className="text-center p-6">
                  <Globe className="w-10 h-10 text-slate-300 dark:text-slate-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Click a country on the map</p>
                  <p className="text-xs text-slate-400 dark:text-slate-400">
                    or search for a country above to view its OSINT resources
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Resources per country:</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#1e293b] inline-block" /> 0
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#3b82f6] inline-block" /> 1–5
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#bbf7d0] inline-block" /> 6–10
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#86efac] inline-block" /> 11–25
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#22c55e] inline-block" /> 25+
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Data sourced from{' '}
          <a
            href="https://github.com/wddadk/OSINT-for-countries"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-slate-800 dark:hover:text-slate-200 underline"
          >
            wddadk/OSINT-for-countries
          </a>{' '}
          (MIT). Interactive map also available at{' '}
          <a
            href="https://map.wddadk.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-slate-800 dark:hover:text-slate-200 underline"
          >
            map.wddadk.com
          </a>
          .
        </p>
      </div>
    </DataPageLayout>
  );
}

function ResourceRow({ resource }: { resource: OsintCountryResource }): JSX.Element {
  const [copied, setCopied] = useState(false);

  return (
    <div className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300)/0.5)] transition-colors group">
      <div className="flex items-start gap-2">
        <a href={sanitizeUrl(resource.url)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{resource.name}</span>
            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </a>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 shrink-0">
          {CATEGORY_LABELS[resource.category] ?? resource.category}
        </span>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(resource.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 mt-0.5 truncate max-w-full block"
        title="Copy URL"
      >
        {copied ? 'Copied!' : resource.url}
      </button>
    </div>
  );
}
