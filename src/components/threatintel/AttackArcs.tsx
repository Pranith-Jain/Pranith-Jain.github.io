import { useMemo, useRef } from 'react';

/**
 * Animated attack-arc overlay for the threat map.
 *
 * Renders animated SVG arcs between attacker countries and a central
 * "target" point (or between top source countries). Uses the same
 * country-aggregated data from /api/v1/threat-map.
 *
 * Inspired by raven (github.com/qeeqbox/raven) — pure JS, no deps.
 */

interface ArcData {
  from: [number, number]; // [longitude, latitude]
  to: [number, number];
  color?: string;
  label?: string;
}

interface AttackArcsProps {
  /** Country aggregations from threat-map response */
  countries: Array<{
    countryCode: string;
    count: number;
  }>;
  /** SVG viewport dimensions */
  width: number;
  height: number;
  /** Whether animation is running */
  playing?: boolean;
}

// ISO 3166-1 alpha-2 → approximate [lon, lat] for country centroids
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-98.5, 39.8],
  CN: [104.1, 35.8],
  RU: [105.3, 61.5],
  BR: [-51.9, -14.2],
  IN: [78.9, 20.6],
  DE: [10.4, 51.2],
  GB: [-3.4, 55.4],
  FR: [2.2, 46.2],
  JP: [138.2, 36.2],
  KR: [127.8, 35.9],
  NL: [5.3, 52.1],
  UA: [31.5, 48.4],
  CA: [-106.3, 56.1],
  AU: [133.8, -25.3],
  IT: [12.6, 41.9],
  ES: [-3.7, 40.5],
  PL: [19.1, 51.9],
  TH: [100.9, 15.9],
  VN: [108.3, 14.1],
  ID: [113.9, -0.8],
  TR: [35.2, 38.9],
  IR: [53.7, 32.4],
  SA: [45.1, 23.9],
  ZA: [22.9, -30.6],
  NG: [8.7, 9.1],
  EG: [30.8, 26.8],
  PK: [69.3, 30.4],
  BD: [90.4, 23.7],
  AR: [-63.6, -38.4],
  MX: [-102.6, 23.6],
  CO: [-74.3, 4.6],
  CL: [-71.5, -35.7],
  PE: [-75.0, -9.2],
  TW: [120.9, 23.7],
  HK: [114.2, 22.4],
  SG: [103.8, 1.4],
  MY: [101.9, 4.2],
  PH: [122.0, 12.9],
  CZ: [15.5, 49.8],
  RO: [24.9, 45.9],
  HU: [19.5, 47.2],
  SE: [18.6, 60.1],
  NO: [8.5, 60.5],
  FI: [25.7, 61.9],
  DK: [9.5, 56.3],
  AT: [14.6, 47.5],
  CH: [8.2, 46.8],
  BE: [4.4, 50.5],
  PT: [-8.2, 39.4],
  GR: [21.8, 39.1],
  IE: [-8.2, 53.4],
  IL: [34.8, 31.0],
  AE: [53.8, 23.4],
  QA: [51.2, 25.4],
  KW: [47.6, 29.3],
  BG: [25.5, 42.7],
  RS: [20.9, 44.0],
  HR: [15.2, 45.1],
  SK: [19.7, 48.7],
  LT: [23.9, 55.2],
  LV: [21.2, 56.9],
  EE: [25.0, 58.6],
  LK: [80.7, 7.9],
  NP: [84.1, 28.4],
  MM: [95.9, 21.9],
  KH: [104.9, 12.6],
  LA: [102.5, 19.9],
  MN: [103.8, 46.9],
  KZ: [66.9, 48.0],
  UZ: [64.6, 41.3],
  KE: [37.9, 0.0],
  ET: [40.5, 9.1],
  GH: [-1.2, 7.9],
  TZ: [34.9, -6.4],
  DZ: [1.7, 28.0],
  MA: [-7.1, 31.8],
  TN: [9.5, 33.9],
  LY: [17.2, 26.3],
  SD: [30.2, 12.9],
  UG: [32.3, 1.4],
  CM: [12.4, 7.4],
  CI: [-5.5, 7.5],
  SN: [-14.5, 14.5],
  ZM: [28.3, -13.1],
  ZW: [29.2, -19.0],
  MZ: [35.5, -18.3],
  AO: [17.9, -11.2],
  MG: [46.9, -18.8],
  '004': [69.1, 34.3],
  '008': [20.1, 41.2],
  '012': [1.7, 28.0],
  '050': [90.4, 23.7],
  '056': [4.4, 50.5],
  '100': [25.5, 42.7],
  '104': [95.9, 21.9],
  '116': [104.9, 12.6],
  '156': [104.1, 35.8],
  '158': [120.9, 23.7],
  '170': [-75.0, -9.2],
  '180': [23.4, -3.4],
  '203': [15.5, 49.8],
  '208': [9.5, 56.3],
  '246': [25.7, 61.9],
  '250': [2.2, 46.2],
  '276': [10.4, 51.2],
  '300': [-3.7, 40.5],
  '348': [19.5, 47.2],
  '352': [-18.5, 64.9],
  '360': [113.9, -0.8],
  '372': [-8.2, 53.4],
  '380': [12.6, 41.9],
  '392': [138.2, 36.2],
  '410': [127.8, 35.9],
  '414': [47.6, 29.3],
  '422': [35.2, 38.9],
  '440': [23.9, 55.2],
  '458': [101.9, 4.2],
  '484': [-102.6, 23.6],
  '528': [5.3, 52.1],
  '554': [172.8, -40.9],
  '578': [8.5, 60.5],
  '608': [122.0, 12.9],
  '616': [19.1, 51.9],
  '620': [-8.2, 39.4],
  '634': [51.2, 25.4],
  '642': [24.9, 45.9],
  '643': [105.3, 61.5],
  '682': [45.1, 23.9],
  '702': [103.8, 1.4],
  '704': [108.3, 14.1],
  '710': [22.9, -30.6],
  '724': [-3.7, 40.5],
  '752': [18.6, 60.1],
  '756': [8.2, 46.8],
  '764': [100.9, 15.9],
  '792': [35.2, 38.9],
  '804': [31.5, 48.4],
  '818': [30.8, 26.8],
  '826': [-3.4, 55.4],
  '840': [-98.5, 39.8],
  '858': [-55.9, -32.5],
  '860': [64.6, 41.3],
  '703': [19.7, 48.7],
};

// Color palette for arcs by rank
const ARC_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
];

function projectMercator(lon: number, lat: number, w: number, h: number): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * (h / 2);
  return [x, y];
}

function arcPath(from: [number, number], to: [number, number], w: number, h: number): string {
  const [x1, y1] = projectMercator(from[0], from[1], w, h);
  const [x2, y2] = projectMercator(to[0], to[1], w, h);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Curve height proportional to distance
  const curveHeight = Math.min(dist * 0.3, 80);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - curveHeight;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export function AttackArcs({ countries, width, height, playing = true }: AttackArcsProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);

  // Build arcs from top countries to a central "target" (US/EU centroid)
  const arcs: ArcData[] = useMemo(() => {
    if (!countries.length) return [];
    const top = countries.sort((a, b) => b.count - a.count).slice(0, 12);

    // Target: center of map (approximate global center)
    const target: [number, number] = [10, 40]; // Western Europe

    return top
      .map((c, i) => {
        const coords = COUNTRY_COORDS[c.countryCode];
        if (!coords) return null;
        return {
          from: coords,
          to: target,
          color: ARC_COLORS[i % ARC_COLORS.length],
          label: `${c.countryCode}: ${c.count}`,
        };
      })
      .filter(Boolean) as ArcData[];
  }, [countries]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        {arcs.map((arc, i) => (
          <linearGradient key={`grad-${i}`} id={`arc-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={arc.color ?? '#ef4444'} stopOpacity={0.1} />
            <stop offset="50%" stopColor={arc.color ?? '#ef4444'} stopOpacity={0.8} />
            <stop offset="100%" stopColor={arc.color ?? '#ef4444'} stopOpacity={0.3} />
          </linearGradient>
        ))}
      </defs>

      {arcs.map((arc, i) => {
        const d = arcPath(arc.from, arc.to, width, height);
        return (
          <g key={`arc-${i}`}>
            {/* Static arc path */}
            <path d={d} fill="none" stroke={arc.color ?? '#ef4444'} strokeWidth={1.5} strokeOpacity={0.3} />
            {/* Animated traveling dot */}
            {playing && (
              <circle r={3} fill={arc.color ?? '#ef4444'} opacity={0.9}>
                <animateMotion dur={`${3 + i * 0.5}s`} repeatCount="indefinite" path={d} />
              </circle>
            )}
            {/* Glow effect */}
            {playing && (
              <circle r={6} fill={arc.color ?? '#ef4444'} opacity={0.3} filter="url(#glow)">
                <animateMotion dur={`${3 + i * 0.5}s`} repeatCount="indefinite" path={d} />
              </circle>
            )}
          </g>
        );
      })}

      {/* Glow filter */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
