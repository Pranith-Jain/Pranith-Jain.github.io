/**
 * PulseMap - 2D world map with animated markers
 *
 * Uses react-simple-maps with proper theme support and animated markers.
 */

import { useMemo, useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- PulseMap is lazy-loaded
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
  critical: 8,
  high: 6,
  medium: 4,
  low: 3,
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

export default function PulseMap({ markers }: PulseMapProps): JSX.Element {
  const [isDark, setIsDark] = useState(false);

  // Detect theme
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const topMarkers = useMemo(() => markers.slice(0, 300), [markers]);

  // Theme colors
  const landFill = isDark ? '#1a2332' : '#e5e7eb';
  const landStroke = isDark ? '#2a3a4a' : '#d1d5db';
  const landHover = isDark ? '#2a3a4a' : '#9ca3af';
  const bgColor = isDark ? '#0a0f1a' : '#f9fafb';

  return (
    <div className="relative w-full h-full" style={{ background: bgColor }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 140,
          center: [0, 20],
        }}
        width={900}
        height={460}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={TOPO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={landFill}
                stroke={landStroke}
                strokeWidth={0.3}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', fill: landHover },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>
        {topMarkers.map((m) => {
          const r = SEVERITY_RADIUS[m.severity] ?? 4;
          const color = KIND_COLORS[m.kind] ?? '#64748b';
          return (
            <Marker key={m.id} coordinates={[m.lng, m.lat]}>
              <g style={{ pointerEvents: 'none' }}>
                {/* Outer glow */}
                <circle r={r * 3} fill={color} opacity={0.1}>
                  <animate attributeName="r" values={`${r * 2};${r * 4};${r * 2}`} dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
                {/* Pulse ring */}
                <circle r={r} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                  <animate attributeName="r" values={`${r};${r * 2.5};${r}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Core dot */}
                <circle r={r} fill={color} opacity={0.9} />
                {/* Bright center */}
                <circle r={r * 0.3} fill="#fff" opacity={isDark ? 0.9 : 0.6} />
              </g>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* Marker count overlay */}
      <div className="absolute bottom-2 left-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">{markers.length} points</span>
      </div>
    </div>
  );
}
