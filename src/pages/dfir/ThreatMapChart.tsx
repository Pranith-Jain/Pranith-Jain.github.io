import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

/**
 * Lazy-loaded world-map chart for /threatintel/threat-map.
 *
 * The react-simple-maps library is ~80KB (chunk `vendor-maps`). Splitting the
 * chart into its own React.lazy() module ensures the parent route ships the
 * side panel + stats first, then streams the chart in. The 190KB topojson is
 * fetched concurrently — the parent's hover-preload (route-preloaders.ts)
 * warms it before this module mounts.
 *
 * Two projections supported via the `globeView` prop:
 *   - geoMercator (default) — familiar flat 2D world map
 *   - geoOrthographic       — globe / sphere projection, slow auto-rotate
 * Using react-simple-maps' built-in projections avoids pulling in three.js
 * (~150KB gzipped) for the globe aesthetic.
 *
 * Hot-country pulse markers honestly use only the data we have (an active
 * source country with N IPs). They're decorative pings showing where
 * malicious infrastructure is observed right now, NOT an attack arc (we
 * have no real source→target pairing in the data).
 */

interface CountryAgg {
  countryCode: string;
  country: string;
  count: number;
  sources: Record<string, number>;
  sample_ips: string[];
}

interface ThreatMapChartProps {
  topoUrl: string;
  numericToAlpha2: Record<string, string>;
  countryByAlpha2: Map<string, CountryAgg>;
  maxCount: number;
  colourFor: (count: number, max: number) => string;
  onHover: (h: { alpha2: string; name: string } | null) => void;
  onSelect: (h: { alpha2: string; name: string } | null) => void;
  selectedAlpha2: string | null;
  globeView: boolean;
}

export default function ThreatMapChart({
  topoUrl,
  numericToAlpha2,
  countryByAlpha2,
  maxCount,
  colourFor,
  onHover,
  onSelect,
  selectedAlpha2,
  globeView,
}: ThreatMapChartProps): JSX.Element {
  // Slow globe rotation when in globe view — 2.5 deg / 200ms = full rotation
  // in ~28s. Ticking at 200ms (not 80ms) cuts full-map re-renders from ~12.5/s
  // to 5/s for the same visual speed; each setState re-renders ~177 country
  // paths, so the slower cadence is a meaningful CPU saving while the globe is
  // open. Pause-on-hover would be nice but adds state churn.
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    if (!globeView) return;
    const id = window.setInterval(() => {
      setRotation((r) => [(r[0] + 2.5) % 360, r[1], r[2]]);
    }, 200);
    return () => window.clearInterval(id);
  }, [globeView]);

  // Resolve the top-12 marker layer only when the data or selection changes —
  // NOT on every 200ms rotation tick. While the globe spins this component
  // re-renders 5×/s, but the sort/slice is rotation-independent, so without
  // this memo it re-materialized + re-sorted the country map every frame.
  const topMarkers = useMemo(() => {
    if (selectedAlpha2) return [] as { code: string; coords: [number, number] }[];
    const out: { code: string; coords: [number, number] }[] = [];
    for (const c of [...countryByAlpha2.values()].sort((a, b) => b.count - a.count).slice(0, 12)) {
      const coords = COUNTRY_COORDS[c.countryCode];
      if (coords) out.push({ code: c.countryCode, coords });
    }
    return out;
  }, [countryByAlpha2, selectedAlpha2]);

  const projectionConfig = globeView ? { scale: 200, rotate: rotation } : { scale: 140 };

  return (
    <ComposableMap
      projection={globeView ? 'geoOrthographic' : 'geoMercator'}
      projectionConfig={projectionConfig}
      width={900}
      height={460}
      style={{ width: '100%', height: 'auto' }}
    >
      {globeView && (
        // Sphere outline so the orthographic projection visibly reads as a
        // globe and not a clipped flat map.
        <g>
          <circle
            cx={450}
            cy={230}
            r={200}
            fill="rgb(var(--surface-200, #0f172a))"
            stroke="rgb(var(--border-400, #1e293b))"
            strokeWidth={0.5}
          />
        </g>
      )}
      <Geographies geography={topoUrl}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const numericId = String(geo.id ?? '').padStart(3, '0');
            const alpha2 = numericToAlpha2[numericId];
            const agg = alpha2 ? countryByAlpha2.get(alpha2) : undefined;
            const fill = agg ? colourFor(agg.count, maxCount) : '#1e293b';
            const name = (geo.properties as { name?: string })?.name ?? alpha2 ?? '';
            const isSelected = !!alpha2 && alpha2 === selectedAlpha2;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isSelected ? '#fbbf24' : fill}
                stroke={isSelected ? '#fbbf24' : 'rgb(var(--surface-100, #0f172a))'}
                strokeWidth={isSelected ? 1.5 : 0.4}
                onMouseEnter={() => alpha2 && onHover({ alpha2, name })}
                onMouseLeave={() => onHover(null)}
                onClick={() => {
                  if (!alpha2) return;
                  if (alpha2 === selectedAlpha2) onSelect(null);
                  else onSelect({ alpha2, name });
                }}
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
      {/* Pulse markers on the top-12 active countries. Decorative, not
          attack arcs — our data has no real source→target pairing.
          Hidden when a country is selected so the drill-down stays clean. */}
      {topMarkers.map(({ code, coords }) => (
        <Marker key={code} coordinates={coords}>
          <g style={{ pointerEvents: 'none' }}>
            <circle r={3} fill="#fbbf24" opacity={0.85}>
              <animate attributeName="r" values="3;9;3" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;0;0.85" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r={2} fill="#fbbf24" />
          </g>
        </Marker>
      ))}
    </ComposableMap>
  );
}

/**
 * Centroid lat/lon for the top-tier active countries. Inline list keeps the
 * marker layer dependency-free; coordinates are from Wikipedia geographic-
 * centroid pages (rounded). Add an entry when a new country starts hitting
 * the top-12 cohort.
 */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-98.6, 39.8],
  CN: [104.2, 35.9],
  RU: [105.3, 61.5],
  DE: [10.5, 51.2],
  NL: [5.3, 52.1],
  FR: [2.2, 46.6],
  GB: [-2.5, 54.4],
  CA: [-106.3, 56.1],
  BR: [-53.2, -10.8],
  IN: [78.7, 22.4],
  JP: [138.0, 36.2],
  KR: [127.8, 36.3],
  AU: [134.5, -25.3],
  UA: [31.2, 49.0],
  TR: [35.2, 39.0],
  IR: [53.7, 32.4],
  PK: [69.3, 30.4],
  ID: [113.9, -0.8],
  VN: [108.3, 14.1],
  TH: [101.0, 15.9],
  SG: [103.8, 1.4],
  HK: [114.2, 22.4],
  TW: [121.0, 23.7],
  IL: [34.9, 31.0],
  EG: [30.8, 26.8],
  ZA: [22.9, -30.6],
  NG: [8.7, 9.1],
  AR: [-63.6, -38.4],
  MX: [-102.6, 23.6],
  ES: [-3.7, 40.5],
  IT: [12.6, 41.9],
  PL: [19.1, 51.9],
  SE: [18.6, 60.1],
  NO: [8.5, 60.5],
  FI: [25.7, 61.9],
  CZ: [15.5, 49.8],
  RO: [25.0, 45.9],
  BG: [25.5, 42.7],
  BE: [4.7, 50.5],
  CH: [8.2, 46.8],
  AT: [14.6, 47.5],
  IE: [-8.2, 53.4],
};
