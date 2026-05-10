import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Globe } from 'lucide-react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { IocSnapshotPanel } from '../../components/dfir/IocSnapshotPanel';

interface CountryAgg {
  countryCode: string;
  country: string;
  count: number;
  sources: Record<string, number>;
  sample_ips: string[];
}

interface IocTypeBucket {
  type: 'url' | 'domain' | 'hash';
  count: number;
  source_counts: Record<string, number>;
  recent: Array<{ value: string; source: string; context?: string; timestamp?: string }>;
}

interface ThreatMapResponse {
  generated_at: string;
  total_ips: number;
  countries: CountryAgg[];
  samples: Array<{ ip: string; country: string; countryCode: string; sources: string[] }>;
  source_counts: Record<string, number>;
  iocs_by_type?: IocTypeBucket[];
}

// Bundled locally to keep us inside the strict CSP (connect-src 'self').
// Asset is ~108 KB, browser-cached after first load.
const WORLD_TOPO_URL = '/world-110m.json';

// react-simple-maps uses ISO 3166-1 numeric codes on the topojson; ip-api gives
// alpha-2. Build a small lookup table for the countries we actually colour.
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
  '320': 'GT',
  '324': 'GN',
  '328': 'GY',
  '332': 'HT',
  '340': 'HN',
  '344': 'HK',
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
  '428': 'LV',
  '430': 'LR',
  '434': 'LY',
  '440': 'LT',
  '442': 'LU',
  '450': 'MG',
  '454': 'MW',
  '458': 'MY',
  '462': 'MV',
  '466': 'ML',
  '470': 'MT',
  '478': 'MR',
  '484': 'MX',
  '496': 'MN',
  '498': 'MD',
  '499': 'ME',
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
  '630': 'PR',
  '634': 'QA',
  '642': 'RO',
  '643': 'RU',
  '646': 'RW',
  '682': 'SA',
  '686': 'SN',
  '688': 'RS',
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
  '740': 'SR',
  '748': 'SZ',
  '752': 'SE',
  '756': 'CH',
  '760': 'SY',
  '762': 'TJ',
  '764': 'TH',
  '768': 'TG',
  '776': 'TO',
  '780': 'TT',
  '784': 'AE',
  '788': 'TN',
  '792': 'TR',
  '795': 'TM',
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
  '882': 'WS',
  '887': 'YE',
  '894': 'ZM',
};

function colourFor(count: number, max: number): string {
  if (count === 0 || max === 0) return '#1e293b'; // slate-800
  const intensity = Math.min(1, Math.log10(count + 1) / Math.log10(max + 1));
  const r = Math.round(45 + (245 - 45) * intensity);
  const g = Math.round(55 + (55 - 55) * intensity * 0.3);
  const b = Math.round(72 + (75 - 72) * (1 - intensity));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function ThreatMap(): JSX.Element {
  const [data, setData] = useState<ThreatMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ alpha2: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/threat-map');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as ThreatMapResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const countryByAlpha2 = useMemo(() => {
    const map = new Map<string, CountryAgg>();
    if (data) for (const c of data.countries) map.set(c.countryCode, c);
    return map;
  }, [data]);

  const maxCount = data?.countries[0]?.count ?? 0;
  const hoveredAgg = hovered ? countryByAlpha2.get(hovered.alpha2) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Cyber Threat Map
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Live distribution of malicious infrastructure across IPs, URLs, domains, and file hashes. Sources: Feodo
          Tracker, URLhaus, ThreatFox, Ipsum (3+ source consensus), CINS Army, Bitwire, and MalwareBazaar. IPs are
          geolocated and aggregated by country; URLs / domains / hashes appear in dedicated panels. Refreshes hourly,
          real data.
        </p>
      </div>

      {loading && !data && <p className="font-mono text-sm text-slate-500">Aggregating IOCs and geolocating…</p>}
      {error && <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>}

      {data && (
        <>
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-6">
            <span>
              <span className="text-slate-900 dark:text-slate-100 text-base font-bold">{data.total_ips}</span> malicious
              IPs
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100 text-base font-bold">{data.countries.length}</span>{' '}
              countries
            </span>
            <span aria-hidden="true">·</span>
            {Object.entries(data.source_counts)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <span key={k}>
                  {k}: {n}
                </span>
              ))}
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
            </button>
          </header>

          <div className="grid lg:grid-cols-[1fr_280px] gap-6">
            {/* Map */}
            <div
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden relative"
              style={{ minHeight: 420 }}
            >
              <ComposableMap
                projectionConfig={{ scale: 140 }}
                width={900}
                height={460}
                style={{ width: '100%', height: 'auto' }}
              >
                <Geographies geography={WORLD_TOPO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const numericId = String(geo.id ?? '').padStart(3, '0');
                      const alpha2 = NUMERIC_TO_ALPHA2[numericId];
                      const agg = alpha2 ? countryByAlpha2.get(alpha2) : undefined;
                      const fill = agg ? colourFor(agg.count, maxCount) : '#1e293b';
                      const name = (geo.properties as { name?: string })?.name ?? alpha2 ?? '';
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={fill}
                          stroke="#0f172a"
                          strokeWidth={0.4}
                          onMouseEnter={() => alpha2 && setHovered({ alpha2, name })}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            default: { outline: 'none' },
                            hover: { outline: 'none', fill: '#fbbf24', cursor: 'pointer' },
                            pressed: { outline: 'none' },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>
              {hoveredAgg && (
                <div className="absolute top-3 left-3 rounded-lg bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur px-3 py-2 text-xs font-mono text-slate-100 border border-amber-400/40 max-w-[240px]">
                  <div className="font-bold text-amber-300">{hoveredAgg.country}</div>
                  <div>{hoveredAgg.count} malicious IPs</div>
                  {Object.entries(hoveredAgg.sources).map(([s, n]) => (
                    <div key={s} className="text-slate-400">
                      {s}: {n}
                    </div>
                  ))}
                </div>
              )}
              {hovered && !hoveredAgg && (
                <div className="absolute top-3 left-3 rounded-lg bg-slate-900/80 backdrop-blur px-3 py-1.5 text-xs font-mono text-slate-300">
                  {hovered.name}: no current IOCs
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <aside className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
                Top origins
              </h3>
              <ul className="space-y-1.5">
                {data.countries.slice(0, 15).map((c) => (
                  <li
                    key={c.countryCode}
                    className="flex items-baseline justify-between gap-3 text-sm font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <span className="truncate">
                      <span className="text-slate-500 mr-2">{c.countryCode}</span>
                      <span className="text-slate-800 dark:text-slate-200">{c.country}</span>
                    </span>
                    <span className="text-brand-600 dark:text-brand-400 font-bold shrink-0">{c.count}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          {/* Recent IPs (geolocated) */}
          {data.samples.length > 0 && (
            <section className="mt-8">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
                Recent IPs
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.samples.slice(0, 30).map((s, i) => (
                  <Link
                    key={`${s.ip}-${i}`}
                    to={`/dfir/ioc-check?indicator=${encodeURIComponent(s.ip)}`}
                    className="block rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 hover:border-brand-500/40 transition-colors"
                  >
                    <div className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">{s.ip}</div>
                    <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
                      <span>{s.countryCode}</span>
                      <span className="truncate">{s.country}</span>
                      <span className="text-brand-600 dark:text-brand-400 ml-auto">{s.sources.join(', ')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* IOC tables (URLs / Domains / Hashes) moved to dedicated pages 2026-05-11.
              The same upstream snapshot drives them — no extra fetch cost. */}
          {data.iocs_by_type && data.iocs_by_type.length > 0 && (
            <section className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
                Per-type IOC feeds
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono">
                {data.iocs_by_type.map((bucket) => {
                  const slug = bucket.type === 'url' ? 'urls' : bucket.type === 'domain' ? 'domains' : 'hashs';
                  const label =
                    bucket.type === 'url'
                      ? 'Live URLs'
                      : bucket.type === 'domain'
                        ? 'Live Domains'
                        : 'Live File hashes';
                  return (
                    <Link
                      key={bucket.type}
                      to={`/threatintel/${slug}`}
                      className="rounded border border-slate-200 dark:border-slate-800 px-3 py-2 hover:border-brand-500/40 transition-colors"
                    >
                      <div className="text-slate-900 dark:text-slate-100 font-display font-semibold text-sm">
                        {label} →
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {bucket.count} unique · /threatintel/{slug}
                      </div>
                    </Link>
                  );
                })}
                <Link
                  to="/threatintel/iocs-by-type"
                  className="rounded border border-slate-200 dark:border-slate-800 px-3 py-2 hover:border-brand-500/40 transition-colors"
                >
                  <div className="text-slate-900 dark:text-slate-100 font-display font-semibold text-sm">
                    All IOC types →
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">URLs + domains + hashes in one view</div>
                </Link>
              </div>
            </section>
          )}

          <IocSnapshotPanel />

          <footer className="mt-8 text-xs font-mono text-slate-500">
            IPs refresh hourly. Geolocation via ip-api.com (free, no key). URLs / domains / hashes are surfaced on their
            own dedicated pages above (same upstream snapshot, no extra fetch). Click any IOC anywhere on the site to
            run it through the IOC Checker.
          </footer>
        </>
      )}
    </div>
  );
}
