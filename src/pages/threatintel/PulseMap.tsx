import { useMemo } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- PulseMap is lazy-loaded in GlobalPulse.tsx
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

const TOPO_URL = '/world-110m.json';

type EventKind =
  | 'earthquake'
  | 'ioc_activity'
  | 'geopolitical'
  | 'tech_news'
  | 'reddit'
  | 'telegram'
  | 'x_feed'
  | 'scam'
  | 'breach'
  | 'briefing'
  | 'cyber_attack'
  | 'aircraft'
  | 'war_room'
  | 'c2_tracker'
  | 'cisa_advisory'
  | 'blocklist'
  | 'darkweb'
  | 'infostealer'
  | 'phishing'
  | 'malware'
  | 'ransomware'
  | 'detection'
  | 'cybercrime'
  | 'research'
  | 'cve';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  kind: EventKind;
}

interface PulseMapProps {
  markers: MarkerData[];
}

const SEVERITY_RADIUS: Record<string, number> = {
  critical: 7,
  high: 5,
  medium: 3.5,
  low: 2.5,
};

const KIND_COLORS: Record<EventKind, string> = {
  earthquake: '#f97316',
  ioc_activity: '#e11d48',
  geopolitical: '#a855f7',
  tech_news: '#0ea5e9',
  reddit: '#f97316',
  telegram: '#22d3ee',
  x_feed: '#3b82f6',
  scam: '#f59e0b',
  breach: '#ef4444',
  briefing: '#10b981',
  cyber_attack: '#dc2626',
  aircraft: '#6366f1',
  war_room: '#b91c1c',
  c2_tracker: '#e11d48',
  cisa_advisory: '#f59e0b',
  blocklist: '#64748b',
  darkweb: '#7c3aed',
  infostealer: '#ea580c',
  phishing: '#d97706',
  malware: '#dc2626',
  ransomware: '#be123c',
  detection: '#059669',
  cybercrime: '#dc2626',
  research: '#0284c7',
  cve: '#d97706',
};

function markerColor(m: MarkerData): string {
  return KIND_COLORS[m.kind] ?? '#64748b';
}

function markerGlow(m: MarkerData): string {
  const color = KIND_COLORS[m.kind] ?? '#64748b';
  return `${color}60`;
}

export default function PulseMap({ markers }: PulseMapProps): JSX.Element {
  const topMarkers = useMemo(() => markers.slice(0, 300), [markers]);

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 140 }}
      width={900}
      height={460}
      style={{ width: '100%', height: 'auto', background: 'transparent' }}
    >
      <Geographies geography={TOPO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="#1e293b"
              stroke="#334155"
              strokeWidth={0.3}
              style={{
                default: { outline: 'none' },
                hover: { outline: 'none', fill: '#334155' },
                pressed: { outline: 'none' },
              }}
            />
          ))
        }
      </Geographies>
      {topMarkers.map((m) => {
        const r = SEVERITY_RADIUS[m.severity] ?? 3;
        const color = markerColor(m);
        const glow = markerGlow(m);
        return (
          <Marker key={m.id} coordinates={[m.lng, m.lat]}>
            <g style={{ pointerEvents: 'none' }}>
              {/* Outer glow ring */}
              <circle r={r * 2.5} fill={glow} opacity={0.15}>
                <animate
                  attributeName="r"
                  values={`${r * 1.5};${r * 3};${r * 1.5}`}
                  dur="3s"
                  repeatCount="indefinite"
                />
                <animate attributeName="opacity" values="0.2;0;0.2" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Pulse ring */}
              <circle r={r} fill="none" stroke={color} strokeWidth={1} opacity={0.6}>
                <animate attributeName="r" values={`${r};${r * 2};${r}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Core dot */}
              <circle r={r} fill={color} opacity={0.9} />
              {/* Bright center */}
              <circle r={r * 0.4} fill="#fff" opacity={0.7} />
            </g>
          </Marker>
        );
      })}
    </ComposableMap>
  );
}
