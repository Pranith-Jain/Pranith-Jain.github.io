/**
 * PulseMap - 2D world map with interactive markers
 *
 * Features:
 *  - Click markers to see details
 *  - Hover tooltips
 *  - Animated pulse effects
 *  - Theme-aware styling
 *  - Info panel for selected marker
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
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
  | 'cve'
  | 'actor_sighting'
  | 'ioc_correlation';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  kind: EventKind;
  title?: string;
  description?: string;
  source?: string;
}

interface PulseMapProps {
  markers: MarkerData[];
  onMarkerClick?: (marker: MarkerData) => void;
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
  actor_sighting: '#8b5cf6',
  ioc_correlation: '#06b6d4',
};

const KIND_LABELS: Record<EventKind, string> = {
  earthquake: 'Earthquake',
  ioc_activity: 'IOC Activity',
  geopolitical: 'Geopolitical',
  tech_news: 'Tech Infrastructure',
  reddit: 'Reddit',
  telegram: 'Telegram',
  x_feed: 'X/Bluesky',
  scam: 'Scam',
  breach: 'Breach',
  briefing: 'Briefing',
  cyber_attack: 'Cyber Attack',
  aircraft: 'Aircraft',
  war_room: 'War Zone',
  c2_tracker: 'C2 Server',
  cisa_advisory: 'CISA Advisory',
  blocklist: 'Blocklist',
  darkweb: 'Dark Web',
  infostealer: 'Infostealer',
  phishing: 'Phishing',
  malware: 'Malware',
  ransomware: 'Ransomware',
  detection: 'Detection',
  cybercrime: 'Cybercrime',
  research: 'Research',
  cve: 'CVE',
  actor_sighting: 'Actor Sighting',
  ioc_correlation: 'IOC Correlation',
};

export default function PulseMap({ markers, onMarkerClick }: PulseMapProps): JSX.Element {
  const [isDark, setIsDark] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<MarkerData | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

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

  const handleMarkerClick = useCallback(
    (marker: MarkerData) => {
      setSelectedMarker(marker);
      onMarkerClick?.(marker);
    },
    [onMarkerClick]
  );

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
              <g
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => handleMarkerClick(m)}
                onMouseEnter={(e) => {
                  setHoveredMarker(m);
                  setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredMarker(null)}
              >
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

      {/* Tooltip */}
      {hoveredMarker && !selectedMarker && (
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltipPos.x + 10, top: tooltipPos.y - 10 }}>
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700/50 px-3 py-2 shadow-xl max-w-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KIND_COLORS[hoveredMarker.kind] }} />
              <span className="text-[10px] font-mono uppercase text-slate-400">{KIND_LABELS[hoveredMarker.kind]}</span>
            </div>
            {hoveredMarker.title && (
              <p className="text-xs font-medium text-slate-200 line-clamp-2">{hoveredMarker.title}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[10px] font-mono capitalize"
                style={{
                  color:
                    hoveredMarker.severity === 'critical'
                      ? '#ef4444'
                      : hoveredMarker.severity === 'high'
                        ? '#f97316'
                        : '#f59e0b',
                }}
              >
                {hoveredMarker.severity}
              </span>
              {hoveredMarker.source && (
                <span className="text-[10px] font-mono text-slate-500">{hoveredMarker.source}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selected Marker Detail Panel */}
      {selectedMarker && (
        <div className="absolute top-4 right-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-700 p-4 max-w-sm shadow-2xl z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: KIND_COLORS[selectedMarker.kind] }} />
                <span
                  className="text-[10px] font-mono uppercase px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: KIND_COLORS[selectedMarker.kind] + '20',
                    color: KIND_COLORS[selectedMarker.kind],
                  }}
                >
                  {KIND_LABELS[selectedMarker.kind]}
                </span>
              </div>
              {selectedMarker.title && (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedMarker.title}</p>
              )}
              {selectedMarker.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedMarker.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="text-[10px] font-mono capitalize"
                  style={{
                    color:
                      selectedMarker.severity === 'critical'
                        ? '#ef4444'
                        : selectedMarker.severity === 'high'
                          ? '#f97316'
                          : '#f59e0b',
                  }}
                >
                  {selectedMarker.severity}
                </span>
                {selectedMarker.source && (
                  <span className="text-[10px] font-mono text-slate-500">{selectedMarker.source}</span>
                )}
                <span className="text-[10px] font-mono text-slate-500">
                  {selectedMarker.lat.toFixed(2)}, {selectedMarker.lng.toFixed(2)}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedMarker(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Marker count overlay */}
      <div className="absolute bottom-2 left-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
          {markers.length} points · Click for details
        </span>
      </div>
    </div>
  );
}
