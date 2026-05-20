import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Globe, Loader2, Pause, Play, X } from 'lucide-react';
import { IocSnapshotPanel } from '../../components/dfir/IocSnapshotPanel';
import { ActorTtpsPanel } from '../../components/threatintel/ActorTtpsPanel';

// Lazy-loaded — react-simple-maps is ~80KB. Side panel + stats render first.
const ThreatMapChart = lazy(() => import('./ThreatMapChart'));

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

// Auto-refresh cadence when "live" mode is on. 60s is generous on the
// upstream cache (which holds 5min anyway) so the polling isn't burning
// bandwidth — it's there for the UX of seeing the counter tick up when
// real changes land.
const REFRESH_INTERVAL_MS = 60_000;

export default function ThreatMap(): JSX.Element {
  const [data, setData] = useState<ThreatMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ alpha2: string; name: string } | null>(null);
  // Clicking a country (on the map or in the leaderboard) sets a sticky
  // selection — replaces the hover-only tooltip with a persistent detail
  // panel listing all IPs from that country. Clicking the same country
  // again clears it. Required for mobile, where hover doesn't fire.
  const [selected, setSelected] = useState<{ alpha2: string; name: string } | null>(null);
  // Globe vs flat (mercator) projection toggle. Using react-simple-maps'
  // built-in geoOrthographic — gives a true sphere shape without pulling
  // in three.js (would be ~150KB extra gzipped).
  const [globeView, setGlobeView] = useState(false);
  // Live mode = poll /api/v1/threat-map every REFRESH_INTERVAL_MS and
  // animate the total-IPs counter when the value changes. Off by default
  // so accidental left-open tabs don't keep hitting the worker.
  const [liveMode, setLiveMode] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_INTERVAL_MS / 1000);
  // Display-only counter that animates from previous total to new total
  // over ~600ms when data changes. Keeps the ticker feeling alive without
  // affecting the underlying state.
  const [displayTotal, setDisplayTotal] = useState(0);
  const prevTotalRef = useRef(0);

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

  // Live-mode polling. Doubled-up: a 1s tick drives the visible countdown
  // pill; the actual fetch fires every REFRESH_INTERVAL_MS. Cleaning up
  // both on unmount or when liveMode flips off prevents leaks.
  useEffect(() => {
    if (!liveMode) return;
    setNextRefreshIn(REFRESH_INTERVAL_MS / 1000);
    const fetchTimer = window.setInterval(() => {
      void load();
      setNextRefreshIn(REFRESH_INTERVAL_MS / 1000);
    }, REFRESH_INTERVAL_MS);
    const countdownTimer = window.setInterval(() => {
      setNextRefreshIn((n) => Math.max(0, n - 1));
    }, 1000);
    return () => {
      window.clearInterval(fetchTimer);
      window.clearInterval(countdownTimer);
    };
  }, [liveMode]);

  // Animate the total-IPs ticker between snapshots. 600ms ease-out gives
  // a "count up" feel without dragging into noticeable lag.
  useEffect(() => {
    if (!data) return;
    const from = prevTotalRef.current;
    const to = data.total_ips;
    if (from === to) {
      setDisplayTotal(to);
      return;
    }
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplayTotal(Math.round(from + (to - from) * eased));
      if (k < 1) raf = window.requestAnimationFrame(tick);
      else prevTotalRef.current = to;
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [data]);

  const countryByAlpha2 = useMemo(() => {
    const map = new Map<string, CountryAgg>();
    if (data) for (const c of data.countries) map.set(c.countryCode, c);
    return map;
  }, [data]);

  const maxCount = data?.countries[0]?.count ?? 0;
  const hoveredAgg = hovered ? countryByAlpha2.get(hovered.alpha2) : null;
  const selectedAgg = selected ? countryByAlpha2.get(selected.alpha2) : null;

  // Combine sample_ips (capped to 5 per country in the backend) with the
  // global samples array (capped to 60 across all countries) filtered to
  // the selected country. Dedup'd, gives up to ~10–15 IPs per country in
  // practice — enough to triage without paginating.
  const selectedIps = useMemo(() => {
    if (!selected || !data) return [] as Array<{ ip: string; sources: string[] }>;
    const out = new Map<string, string[]>();
    if (selectedAgg) {
      for (const ip of selectedAgg.sample_ips) {
        if (!out.has(ip)) out.set(ip, Object.keys(selectedAgg.sources));
      }
    }
    for (const s of data.samples) {
      if (s.countryCode === selected.alpha2 && !out.has(s.ip)) {
        out.set(s.ip, s.sources);
      }
    }
    return [...out.entries()].map(([ip, sources]) => ({ ip, sources }));
  }, [selected, selectedAgg, data]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Cyber Threat Map
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Live distribution of malicious infrastructure across IPs, URLs, domains, and file hashes. Sources: URLhaus,
          ThreatFox, Ipsum (3+ source consensus), CINS Army, Bitwire, and MalwareBazaar. IPs are geolocated and
          aggregated by country; URLs / domains / hashes appear in dedicated panels. Refreshes hourly, real data.
        </p>
      </div>

      {/* Reserve the eventual content height while loading so the page
          doesn't jump when data arrives. Without this the loading line is
          ~20px and the loaded grid is ~700px+, producing CLS 0.869
          (measured 2026-05-12). The min-height isn't a perfect match for
          every viewport but eliminates the catastrophic shift. */}
      {loading && !data && (
        <div className="font-mono text-sm text-slate-500 flex items-center justify-center" style={{ minHeight: 700 }}>
          Aggregating IOCs and geolocating…
        </div>
      )}
      {error && (
        <p role="alert" className="font-mono text-sm text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {data && (
        <>
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-6">
            <span>
              <span
                className="text-slate-900 dark:text-slate-100 text-base font-bold tabular-nums"
                aria-live="polite"
                aria-atomic="true"
              >
                {displayTotal.toLocaleString()}
              </span>{' '}
              malicious IPs
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-slate-900 dark:text-slate-100 text-base font-bold tabular-nums">
                {data.countries.length}
              </span>{' '}
              countries
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {Object.entries(data.source_counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <span key={k}>
                    {k}: {n}
                  </span>
                ))}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setLiveMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
                liveMode
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 hover:border-brand-500/40'
              }`}
              aria-pressed={liveMode}
              title={liveMode ? 'Pause auto-refresh' : `Auto-refresh every ${REFRESH_INTERVAL_MS / 1000}s`}
            >
              {liveMode ? <Pause size={12} /> : <Play size={12} />}
              {liveMode ? (
                <>
                  <span className="hidden sm:inline">live · next in</span>
                  <span className="tabular-nums">{nextRefreshIn}s</span>
                </>
              ) : (
                'go live'
              )}
            </button>
            <button
              type="button"
              onClick={() => setGlobeView((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
                globeView
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 hover:border-brand-500/40'
              }`}
              aria-pressed={globeView}
              title={globeView ? 'Switch to flat (mercator) projection' : 'Switch to globe (orthographic) projection'}
            >
              <Globe size={12} />
              {globeView ? 'globe' : 'flat'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
            </button>
          </header>

          <div className="grid lg:grid-cols-[1fr_280px] gap-6">
            {/* Map */}
            <div
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden relative"
              // Reserve the map's intrinsic aspect ratio (900×460 SVG) so the
              // Suspense fallback occupies the same space the loaded
              // ComposableMap will take. Without this the placeholder is
              // 420px and the map renders ~490px on desktop width, producing
              // CLS 0.869 (measured 2026-05-12). minHeight floors the box on
              // very narrow viewports where the aspect-ratio alone would
              // give a too-short reservation.
              style={{ aspectRatio: '900 / 460', minHeight: 280 }}
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center w-full h-full text-slate-500 font-mono text-xs gap-2">
                    <Loader2 size={14} className="animate-spin" /> loading world map…
                  </div>
                }
              >
                <ThreatMapChart
                  topoUrl={WORLD_TOPO_URL}
                  numericToAlpha2={NUMERIC_TO_ALPHA2}
                  countryByAlpha2={countryByAlpha2}
                  maxCount={maxCount}
                  colourFor={colourFor}
                  onHover={setHovered}
                  onSelect={setSelected}
                  selectedAlpha2={selected?.alpha2 ?? null}
                  globeView={globeView}
                />
              </Suspense>
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
                {data.countries.slice(0, 15).map((c) => {
                  const isSelected = selected?.alpha2 === c.countryCode;
                  return (
                    <li key={c.countryCode}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelected) setSelected(null);
                          else setSelected({ alpha2: c.countryCode, name: c.country });
                        }}
                        className={`w-full flex items-baseline justify-between gap-3 text-sm font-mono px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded border transition-colors ${
                          isSelected
                            ? 'border-amber-400/60 bg-amber-400/10 text-slate-900 dark:text-slate-100'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <span className="truncate">
                          <span className="text-slate-500 mr-2">{c.countryCode}</span>
                          <span className="text-slate-800 dark:text-slate-200">{c.country}</span>
                        </span>
                        <span className="text-brand-600 dark:text-brand-400 font-bold shrink-0">{c.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          </div>

          {/* Attack-type breakdown — stacked-bar visualization of the
              IOC-kind split (URLs / domains / hashes / IPs). Uses the
              data.iocs_by_type buckets already returned by the upstream
              snapshot — no extra fetch. Inspired by Checkpoint / Fortiguard's
              attack-type categories, adapted to our IOC taxonomy (we don't
              classify by malware/phishing/DDoS individually; the source
              feeds do that implicitly). */}
          {(data.iocs_by_type?.length ?? 0) > 0 && (
            <IocTypeBreakdown ipsCount={data.total_ips} buckets={data.iocs_by_type ?? []} />
          )}

          {/* Country drill-down detail panel.
              Persistent click-selection state — replaces the hover-only
              tooltip behaviour, which doesn't work on touch. Shows source
              breakdown + every IP we have for the selected country with
              one-click IOC Checker links. */}
          {selected && (
            <section className="mt-6 rounded-lg border border-amber-400/40 bg-amber-50/40 dark:border-amber-400/30 dark:bg-amber-500/5 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-display font-bold text-lg inline-flex items-center gap-2">
                    <span className="text-amber-600 dark:text-amber-400 font-mono text-xs uppercase tracking-wider">
                      Selected
                    </span>
                    {selectedAgg?.country ?? selected.name}
                    <span className="text-slate-500 dark:text-slate-500 text-xs font-mono">({selected.alpha2})</span>
                  </h3>
                  {selectedAgg ? (
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-1">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedAgg.count}</span>{' '}
                      malicious IPs · sources:{' '}
                      {Object.entries(selectedAgg.sources)
                        .map(([s, n]) => `${s} (${n})`)
                        .join(' · ')}
                    </p>
                  ) : (
                    <p className="text-xs font-mono text-slate-500 mt-1">No current IOCs reported from this country.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex items-center gap-1 text-xs font-mono px-3 py-2 min-h-[44px] sm:min-h-0 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Clear country selection"
                >
                  <X size={12} /> clear
                </button>
              </div>

              {selectedIps.length > 0 && (
                <>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-2">
                    IPs from {selectedAgg?.country ?? selected.name} ({selectedIps.length} shown
                    {selectedAgg && selectedIps.length < selectedAgg.count ? ` of ${selectedAgg.count}` : ''})
                  </p>
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {selectedIps.map(({ ip, sources }) => (
                      <li key={ip}>
                        <Link
                          to={`/dfir/ioc-check?indicator=${encodeURIComponent(ip)}`}
                          className="block rounded border border-amber-400/30 hover:border-brand-500/40 bg-white dark:bg-slate-900 px-3 py-2 transition-colors"
                        >
                          <div className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{ip}</div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            sources: {sources.join(', ')}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

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

          {/* Per-type IOC feed tiles were removed 2026-05-14 — the new
              IocTypeBreakdown stacked bar above covers the same ground
              with the percentage context the tile row was missing. */}

          {/* Sources panel — per-feed contribution to this snapshot, with
              what each feed type is good for. Replaces the old single
              text-line header that just listed "URLhaus: 4712 · ThreatFox: 215". */}
          <SourcesBreakdown
            sourceCounts={data.source_counts}
            iocTypes={data.iocs_by_type ?? []}
            totalIps={data.total_ips}
          />

          <IocSnapshotPanel />

          <div className="mt-8">
            <ActorTtpsPanel
              title="MITRE technique distribution from currently-active actors"
              subtitle="Beyond geo — what TTPs to tune detections for, weighted by who's posting right now. Pulls the same actor-timeline data as /threatintel/actor-timeline."
            />
          </div>

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

/**
 * Stacked-bar visualisation of the IOC-type split (URLs, domains, hashes)
 * alongside the geolocated-IPs count. Plays the role Checkpoint /
 * Fortiguard maps fill with their "attack types" sidebar — but uses the
 * honest taxonomy we have (kind of IOC, not malware/phishing/DDoS, which
 * the source feeds classify implicitly).
 */
interface IocTypeBucket {
  type: 'url' | 'domain' | 'hash';
  count: number;
  source_counts: Record<string, number>;
  recent: Array<{ value: string; source: string; context?: string; timestamp?: string }>;
}

const KIND_COLOUR: Record<'ip' | IocTypeBucket['type'], string> = {
  ip: 'bg-rose-500 dark:bg-rose-400',
  url: 'bg-amber-500 dark:bg-amber-400',
  domain: 'bg-sky-500 dark:bg-sky-400',
  hash: 'bg-violet-500 dark:bg-violet-400',
};

const KIND_LABEL: Record<'ip' | IocTypeBucket['type'], string> = {
  ip: 'IPs',
  url: 'URLs',
  domain: 'Domains',
  hash: 'Hashes',
};

const KIND_HREF: Record<'ip' | IocTypeBucket['type'], string> = {
  ip: '/threatintel/threat-map',
  url: '/threatintel/urls',
  domain: '/threatintel/domains',
  hash: '/threatintel/hashs',
};

/**
 * Per-source contribution panel. Shows which IOC feeds contributed to
 * this snapshot, with: name, count, what kind of IOCs the feed
 * specialises in, and a one-line "what it's good for" description. The
 * `source_counts` value in /api/v1/threat-map only covers IP-flagging
 * feeds; the iocs_by_type buckets carry per-source counts for URL /
 * domain / hash feeds. Merging both gives a complete picture.
 */
interface SourcesBreakdownProps {
  sourceCounts: Record<string, number>;
  iocTypes: IocTypeBucket[];
  totalIps: number;
}

interface SourceMeta {
  desc: string;
  ipsType?: 'url' | 'domain' | 'hash' | 'ip';
  href?: string;
}

const SOURCE_META: Record<string, SourceMeta> = {
  URLhaus: { desc: 'Malicious URLs hosting malware payloads', ipsType: 'url', href: 'https://urlhaus.abuse.ch/' },
  ThreatFox: {
    desc: 'C2 IOCs (IPs / domains / hashes) cross-referenced',
    ipsType: 'ip',
    href: 'https://threatfox.abuse.ch/',
  },
  Ipsum: {
    desc: 'IP blocklist consensus (flagged by 3+ sources)',
    ipsType: 'ip',
    href: 'https://github.com/stamparm/ipsum',
  },
  'CINS Army': { desc: 'Top attackers reputation list', ipsType: 'ip', href: 'https://cinsscore.com/' },
  Bitwire: { desc: 'C2 / scanner IP reputation', ipsType: 'ip' },
  MalwareBazaar: { desc: 'Recent malware sample hashes', ipsType: 'hash', href: 'https://bazaar.abuse.ch/' },
  'Binary Defense': {
    desc: 'Banlist of known-bad IPs',
    ipsType: 'ip',
    href: 'https://www.binarydefense.com/banlist.txt',
  },
  'Blocklist.de': { desc: 'Recent attacker IPs (per-port)', ipsType: 'ip', href: 'https://www.blocklist.de/' },
  'Phishing Army': { desc: 'Phishing-domain blocklist', ipsType: 'domain', href: 'https://phishing.army/' },
  'Feodo Tracker': { desc: 'Banking-trojan C2 infrastructure', ipsType: 'ip', href: 'https://feodotracker.abuse.ch/' },
  OpenPhish: { desc: 'Real-time phishing-URL feed', ipsType: 'url', href: 'https://openphish.com/' },
  TweetFeed: { desc: 'Community-shared IOCs from Twitter/X', ipsType: 'ip', href: 'https://tweetfeed.live/' },
};

interface SourceRow {
  name: string;
  count: number;
  kind: 'ip' | 'url' | 'domain' | 'hash';
  meta: SourceMeta;
}

function SourcesBreakdown({ sourceCounts, iocTypes, totalIps }: SourcesBreakdownProps): JSX.Element {
  // Build a flat row list: IP-flagging sources from source_counts, plus
  // per-bucket source contributions for URL / domain / hash feeds.
  const rows: SourceRow[] = [];
  for (const [name, count] of Object.entries(sourceCounts)) {
    if (count <= 0) continue;
    rows.push({ name, count, kind: 'ip', meta: SOURCE_META[name] ?? { desc: '' } });
  }
  for (const bucket of iocTypes) {
    for (const [name, count] of Object.entries(bucket.source_counts ?? {})) {
      if (count <= 0) continue;
      // De-dup against IP rows (e.g. ThreatFox appears in both).
      const existing = rows.find((r) => r.name === name && r.kind === bucket.type);
      if (existing) existing.count += count;
      else rows.push({ name, count, kind: bucket.type, meta: SOURCE_META[name] ?? { desc: '' } });
    }
  }
  rows.sort((a, b) => b.count - a.count);

  const totalAcrossSources = rows.reduce((a, r) => a + r.count, 0) + totalIps;

  if (rows.length === 0) {
    return (
      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs font-mono text-slate-500">No source attribution available in this snapshot.</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Sources contributing to this snapshot
        </h3>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
          {rows.length} feeds · {totalAcrossSources.toLocaleString()} indicators
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li
            key={`${r.name}-${r.kind}`}
            className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 p-3"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              {r.meta.href ? (
                <a
                  href={r.meta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${r.name} (opens in new tab)`}
                  className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 truncate"
                >
                  {r.name}
                </a>
              ) : (
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {r.name}
                </span>
              )}
              <span
                className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border shrink-0 ${KIND_COLOUR_FOR_TAG(r.kind)}`}
                title={KIND_LABEL[r.kind]}
              >
                {KIND_LABEL[r.kind]}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-[12px] font-mono">
              <span className="text-slate-600 dark:text-slate-400 truncate" title={r.meta.desc}>
                {r.meta.desc || '—'}
              </span>
              <span className="text-brand-600 dark:text-brand-400 font-bold tabular-nums shrink-0">
                {r.count.toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KIND_COLOUR_FOR_TAG(k: 'ip' | 'url' | 'domain' | 'hash'): string {
  switch (k) {
    case 'ip':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'url':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'domain':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    case 'hash':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300';
  }
}

function IocTypeBreakdown({ ipsCount, buckets }: { ipsCount: number; buckets: IocTypeBucket[] }): JSX.Element {
  const rows = [
    { kind: 'ip' as const, count: ipsCount },
    ...buckets.map((b) => ({ kind: b.type, count: b.count })),
  ].filter((r) => r.count > 0);
  const total = rows.reduce((a, b) => a + b.count, 0) || 1;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          IOC type breakdown
        </h3>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
          {total.toLocaleString()} total · share of current snapshot
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="flex w-full h-3 rounded overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3"
        role="img"
        aria-label={`IOC type breakdown: ${rows.map((r) => `${KIND_LABEL[r.kind]} ${r.count}`).join(', ')}`}
      >
        {rows.map((r) => {
          const pct = (r.count / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={r.kind}
              className={KIND_COLOUR[r.kind]}
              style={{ width: `${pct}%` }}
              title={`${KIND_LABEL[r.kind]}: ${r.count.toLocaleString()} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend / per-kind links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        {rows.map((r) => {
          const pct = (r.count / total) * 100;
          return (
            <Link
              key={r.kind}
              to={KIND_HREF[r.kind]}
              className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-800 px-2.5 py-2 hover:border-brand-500/40 transition-colors"
            >
              <span className={`inline-block w-2.5 h-2.5 rounded shrink-0 ${KIND_COLOUR[r.kind]}`} aria-hidden="true" />
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{KIND_LABEL[r.kind]}</span>
              <span className="text-slate-500 ml-auto tabular-nums">{r.count.toLocaleString()}</span>
              <span className="text-slate-400 dark:text-slate-600 text-[10px] tabular-nums">{pct.toFixed(0)}%</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
