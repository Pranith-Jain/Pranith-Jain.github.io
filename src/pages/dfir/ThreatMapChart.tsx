import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

/**
 * Lazy-loaded world-map chart for /threatintel/threat-map.
 *
 * The react-simple-maps library is ~80KB (chunk `vendor-maps`). Splitting the
 * chart into its own React.lazy() module ensures the parent route ships the
 * side panel + stats first, then streams the chart in. The 190KB topojson is
 * fetched concurrently — the parent's hover-preload (route-preloaders.ts)
 * warms it before this module mounts.
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
}

export default function ThreatMapChart({
  topoUrl,
  numericToAlpha2,
  countryByAlpha2,
  maxCount,
  colourFor,
  onHover,
}: ThreatMapChartProps): JSX.Element {
  return (
    <ComposableMap projectionConfig={{ scale: 140 }} width={900} height={460} style={{ width: '100%', height: 'auto' }}>
      <Geographies geography={topoUrl}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const numericId = String(geo.id ?? '').padStart(3, '0');
            const alpha2 = numericToAlpha2[numericId];
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
                onMouseEnter={() => alpha2 && onHover({ alpha2, name })}
                onMouseLeave={() => onHover(null)}
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
  );
}
