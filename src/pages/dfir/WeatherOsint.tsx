import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Cloud, Search, Loader2, ExternalLink, Thermometer, Wind, Eye, MapPin } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';

interface WeatherResult {
  location: string;
  country: string;
  lat: number;
  lon: number;
  current: {
    temp_c: number;
    feels_like_c: number;
    humidity: number;
    wind_kph: number;
    wind_dir: string;
    condition: string;
    icon: string;
    uv: number;
    visibility_km: number;
    pressure_mb: number;
    cloud: number;
    precip_mm: number;
  };
  forecast: Array<{
    date: string;
    max_c: number;
    min_c: number;
    condition: string;
    precip_mm: number;
    wind_kph: number;
    humidity: number;
  }>;
  alerts: string[];
  astronomy: {
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
    moon_phase: string;
  };
}

function formatTemp(c: number): string {
  return `${Math.round(c)}°C / ${Math.round(c * 9/5 + 32)}°F`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WeatherOsint(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const lookup = async (q?: string) => {
    const search = (q ?? query).trim();
    if (!search) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=demo&q=${encodeURIComponent(search)}&days=7&alerts=yes&aqi=no`,
        { signal }
      );
      if (!r.ok) {
        // weatherapi.com free tier requires API key; fall back to wttr.in
        const wttr = await fetch(
          `https://wttr.in/${encodeURIComponent(search)}?format=j1`,
          { signal }
        );
        if (!wttr.ok) throw new Error(`Weather lookup failed: ${wttr.status}`);
        const data = await wttr.json();
        if (signal.aborted) return;
        const loc = data.nearest_area?.[0];
        const cur = data.current_condition?.[0];
        if (!loc || !cur) throw new Error('No weather data returned');
        const forecast = (data.weather ?? []).map((d: Record<string, unknown>) => {
          const hourly = (d.hourly ?? []) as Record<string, unknown>[];
          const h4 = hourly[4] ?? hourly[0] ?? {};
          return {
            date: d.date as string,
            max_c: Number(d.maxtempC ?? 0),
            min_c: Number(d.mintempC ?? 0),
            condition: (h4.weatherDesc as Record<string, unknown>[])?.[0]?.value as string ?? 'Unknown',
            precip_mm: Number(h4.precipMM ?? 0),
            wind_kph: Number(h4.windspeedKmph ?? 0),
            humidity: Number(h4.humidity ?? 0),
          };
        });
        setResult({
          location: loc.areaName?.[0]?.value ?? search,
          country: loc.country?.[0]?.value ?? '',
          lat: Number(loc.latitude?.[0] ?? 0),
          lon: Number(loc.longitude?.[0] ?? 0),
          current: {
            temp_c: Number(cur.temp_C ?? 0),
            feels_like_c: Number(cur.FeelsLikeC ?? 0),
            humidity: Number(cur.humidity ?? 0),
            wind_kph: Number(cur.windspeedKmph ?? 0),
            wind_dir: cur.winddir16Point ?? '',
            condition: cur.weatherDesc?.[0]?.value ?? '',
            icon: '',
            uv: Number(cur.uvIndex ?? 0),
            visibility_km: Number(cur.visibility ?? 0),
            pressure_mb: Number(cur.pressure ?? 0),
            cloud: Number(cur.cloudcover ?? 0),
            precip_mm: Number(cur.precipMM ?? 0),
          },
          forecast,
          alerts: [],
          astronomy: {
            sunrise: data.weather?.[0]?.astronomy?.[0]?.sunrise ?? '',
            sunset: data.weather?.[0]?.astronomy?.[0]?.sunset ?? '',
            moonrise: data.weather?.[0]?.astronomy?.[0]?.moonrise ?? '',
            moonset: data.weather?.[0]?.astronomy?.[0]?.moonset ?? '',
            moon_phase: data.weather?.[0]?.astronomy?.[0]?.moon_phase ?? '',
          },
        });
        setHistory((prev) => [search, ...prev.filter((h) => h !== search)].slice(0, 8));
        return;
      }
      // weatherapi.com success path (if API key provided)
      const data = await r.json();
      if (signal.aborted) return;
      const loc = data.location;
      const cur = data.current;
      setResult({
        location: loc.name,
        country: loc.country,
        lat: loc.lat,
        lon: loc.lon,
        current: {
          temp_c: cur.temp_c,
          feels_like_c: cur.feelslike_c,
          humidity: cur.humidity,
          wind_kph: cur.wind_kph,
          wind_dir: cur.wind_dir,
          condition: cur.condition.text,
          icon: cur.condition.icon,
          uv: cur.uv,
          visibility_km: cur.vis_km,
          pressure_mb: cur.pressure_mb,
          cloud: cur.cloud,
          precip_mm: cur.precip_mm,
        },
        forecast: (data.forecast?.forecastday ?? []).map((d: Record<string, unknown>) => ({
          date: d.date as string,
          max_c: (d.day as Record<string, unknown>).maxtemp_c as number,
          min_c: (d.day as Record<string, unknown>).mintemp_c as number,
          condition: ((d.day as Record<string, unknown>).condition as Record<string, unknown>).text as string,
          precip_mm: (d.day as Record<string, unknown>).totalprecip_mm as number,
          wind_kph: (d.day as Record<string, unknown>).maxwind_kph as number,
          humidity: (d.day as Record<string, unknown>).avghumidity as number,
        })),
        alerts: (data.alerts?.alert ?? []).map((a: Record<string, unknown>) => `${a.headline}: ${a.desc}`),
        astronomy: {
          sunrise: data.forecast?.forecastday?.[0]?.astro?.sunrise ?? '',
          sunset: data.forecast?.forecastday?.[0]?.astro?.sunset ?? '',
          moonrise: data.forecast?.forecastday?.[0]?.astro?.moonrise ?? '',
          moonset: data.forecast?.forecastday?.[0]?.astro?.moonset ?? '',
          moon_phase: data.forecast?.forecastday?.[0]?.astro?.moon_phase ?? '',
        },
      });
      setHistory((prev) => [search, ...prev.filter((h) => h !== search)].slice(0, 8));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev);
      if (query.trim()) out.set('q', query.trim());
      else out.delete('q');
      return out;
    });
    lookup();
  };

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== query) {
      setQuery(q);
      lookup(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Cloud size={28} />}
      title="Weather OSINT"
      description={
        <span className="block max-w-3xl">
          Weather intelligence for investigations — verify alibis, reconstruct timelines, correlate geolocation, and
          check environmental conditions at a specific location and date. Powered by wttr.in (free, no API key).
        </span>
      }
    >
      {/* Input */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="City name, coordinates (40.71,-74.01), or IP-based lookup"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Location query"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white rounded font-mono text-sm font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </div>
      </form>

      {/* Recent searches */}
      {history.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="text-mini font-mono text-slate-500 mr-1">recent:</span>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setQuery(h);
                lookup(h);
              }}
              className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-500 hover:border-brand-500/40 transition-colors"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm font-mono text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Header card */}
          <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
                  {result.location}, {result.country}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm font-mono text-slate-500">
                  <span>{result.lat.toFixed(4)}, {result.lon.toFixed(4)}</span>
                  <CopyChip value={`${result.lat},${result.lon}`} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
                  {formatTemp(result.current.temp_c)}
                </div>
                <div className="text-sm font-mono text-slate-500">
                  Feels like {formatTemp(result.current.feels_like_c)}
                </div>
              </div>
            </div>

            {/* Current conditions grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Thermometer size={14} className="text-slate-400" />
                <div>
                  <div className="text-micro font-mono text-slate-500">Condition</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.condition}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Wind size={14} className="text-slate-400" />
                <div>
                  <div className="text-micro font-mono text-slate-500">Wind</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    {result.current.wind_kph} km/h {result.current.wind_dir}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-slate-400" />
                <div>
                  <div className="text-micro font-mono text-slate-500">Visibility</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.visibility_km} km</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Cloud size={14} className="text-slate-400" />
                <div>
                  <div className="text-micro font-mono text-slate-500">Cloud Cover</div>
                  <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.cloud}%</div>
                </div>
              </div>
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
              <div>
                <div className="text-micro font-mono text-slate-500">Humidity</div>
                <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.humidity}%</div>
              </div>
              <div>
                <div className="text-micro font-mono text-slate-500">Pressure</div>
                <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.pressure_mb} mb</div>
              </div>
              <div>
                <div className="text-micro font-mono text-slate-500">UV Index</div>
                <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.uv}</div>
              </div>
              <div>
                <div className="text-micro font-mono text-slate-500">Precipitation</div>
                <div className="text-sm font-mono text-slate-900 dark:text-slate-100">{result.current.precip_mm} mm</div>
              </div>
            </div>
          </div>

          {/* Astronomy */}
          <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
            <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Astronomy</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm font-mono">
              <div>
                <div className="text-micro text-slate-500">Sunrise</div>
                <div className="text-slate-900 dark:text-slate-100">{result.astronomy.sunrise}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Sunset</div>
                <div className="text-slate-900 dark:text-slate-100">{result.astronomy.sunset}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Moonrise</div>
                <div className="text-slate-900 dark:text-slate-100">{result.astronomy.moonrise}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Moonset</div>
                <div className="text-slate-900 dark:text-slate-100">{result.astronomy.moonset}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Moon Phase</div>
                <div className="text-slate-900 dark:text-slate-100">{result.astronomy.moon_phase}</div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {result.alerts.length > 0 && (
            <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4">
              <h3 className="font-display font-semibold text-sm text-amber-700 dark:text-amber-300 mb-2">Weather Alerts</h3>
              <ul className="space-y-1">
                {result.alerts.map((a, i) => (
                  <li key={i} className="text-sm font-mono text-amber-700 dark:text-amber-300">{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Forecast */}
          {result.forecast.length > 0 && (
            <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">7-Day Forecast</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-micro text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Condition</th>
                      <th className="text-right py-2 pr-4">High</th>
                      <th className="text-right py-2 pr-4">Low</th>
                      <th className="text-right py-2 pr-4">Precip</th>
                      <th className="text-right py-2 pr-4">Wind</th>
                      <th className="text-right py-2">Humidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.forecast.map((d) => (
                      <tr key={d.date} className="border-b border-slate-100 dark:border-slate-800/50">
                        <td className="py-2 pr-4 text-slate-900 dark:text-slate-100">{formatDate(d.date)}</td>
                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{d.condition}</td>
                        <td className="py-2 pr-4 text-right text-slate-900 dark:text-slate-100">{formatTemp(d.max_c)}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{formatTemp(d.min_c)}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{d.precip_mm} mm</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{d.wind_kph} km/h</td>
                        <td className="py-2 text-right text-slate-500">{d.humidity}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* OSINT pivots */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
            <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Investigation Pivots</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              <a
                href={`https://www.google.com/maps?q=${result.lat},${result.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                Google Maps <ExternalLink size={11} />
              </a>
              <a
                href={`https://www.google.com/search?q=weather+${encodeURIComponent(result.location)}+${encodeURIComponent(result.country)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                Google Weather Search <ExternalLink size={11} />
              </a>
              <a
                href={`https://www.windy.com/${result.lat}/${result.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                Windy.com (radar) <ExternalLink size={11} />
              </a>
              <a
                href={`https://zoom.earth/#view=${result.lat},${result.lon},12z`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                Zoom Earth (satellite) <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </>
      )}

      {/* Tips */}
      <div className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-2">
          OSINT Use Cases
        </h3>
        <ul className="text-meta font-mono text-slate-600 dark:text-slate-400 space-y-1.5">
          <li>
            <strong>Alibi verification:</strong> Check if weather conditions at a claimed location match a suspect's
            alibi. If they claim to be in Miami but it was raining, that's a data point.
          </li>
          <li>
            <strong>Photo metadata cross-ref:</strong> Compare EXIF timestamp with historical weather data to verify
            when/where a photo was taken.
          </li>
          <li>
            <strong>Timeline reconstruction:</strong> Weather conditions at a scene can help narrow down event windows
            (e.g., "it rained between 2-4 PM, so footprints were made after that").
          </li>
          <li>
            <strong>Geolocation confirmation:</strong> Match weather patterns in background video/photos with
            historical data to confirm or dispute a claimed location.
          </li>
          <li>
            <strong>Search terms:</strong> Accepts city names, coordinates (lat,lon), or even IP-based lookup for
            approximate location.
          </li>
        </ul>
      </div>
    </DataPageLayout>
  );
}
