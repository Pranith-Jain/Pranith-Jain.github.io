/* eslint-disable @typescript-eslint/no-restricted-imports -- react-simple-maps: small inner chart; refactoring to lazy requires parent route changes (out of scope for this audit) */
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { OsintCountry } from '../../data/threatintel/osint-countries';

interface OsintMapChartProps {
  topoUrl: string;
  alpha2ByNumeric: Map<string, string>;
  countryByAlpha2: Map<string, OsintCountry>;
  selectedAlpha2: string | null;
  colourFor: (count: number) => string;
  onSelect: (alpha2: string | null) => void;
  onHover: (alpha2: string | null) => void;
}

export default function OsintMapChart({
  topoUrl,
  alpha2ByNumeric,
  countryByAlpha2,
  selectedAlpha2,
  colourFor,
  onSelect,
  onHover,
}: OsintMapChartProps): JSX.Element {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 140 }}
      width={900}
      height={460}
      style={{ width: '100%', height: 'auto' }}
    >
      <Geographies geography={topoUrl}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const numericId = String(geo.id ?? '').padStart(3, '0');
            const alpha2 = alpha2ByNumeric.get(numericId) ?? null;
            const country = alpha2 ? countryByAlpha2.get(alpha2) : undefined;
            const count = country?.resources.length ?? 0;
            const fill = country && count > 0 ? colourFor(count) : '#1e293b';
            const isSelected = alpha2 === selectedAlpha2;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isSelected ? '#fbbf24' : fill}
                stroke={isSelected ? '#fbbf24' : '#0f172a'}
                strokeWidth={isSelected ? 1.5 : 0.4}
                onMouseEnter={() => alpha2 && onHover(alpha2)}
                onMouseLeave={() => onHover(null)}
                onClick={() => {
                  if (!alpha2) return;
                  if (alpha2 === selectedAlpha2) onSelect(null);
                  else onSelect(alpha2);
                }}
                style={{
                  default: { outline: 'none', transition: 'fill 0.15s' },
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
