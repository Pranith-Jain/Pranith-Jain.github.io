import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CATEGORY_COLORS: Record<string, string> = {
  'Energy & Power': '#f59e0b',
  Telecom: '#3b82f6',
  'Oil & Gas': '#78716c',
  Water: '#06b6d4',
  Aviation: '#8b5cf6',
  Maritime: '#0ea5e9',
  'Rail & Transit': '#6366f1',
  Structures: '#64748b',
  Industrial: '#78716c',
  Military: '#ef4444',
  Government: '#10b981',
  Healthcare: '#ec4899',
  Education: '#f97316',
  Culture: '#a855f7',
  Tourism: '#14b8a6',
  Religious: '#eab308',
  Historic: '#a3a3a3',
  Agriculture: '#22c55e',
  Services: '#6366f1',
  Emergency: '#dc2626',
  'Cable Transport': '#0ea5e9',
  Monitoring: '#64748b',
  Community: '#10b981',
};

function markerIcon(color: string, size = 10): L.DivIcon {
  return L.divIcon({
    className: 'infra-pin',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ bbox }: { bbox: [number, number, number, number] }) {
  const map = useMap();
  useEffect(() => {
    const [s, w, n, e] = bbox;
    map.fitBounds(
      [
        [s, w],
        [n, e],
      ],
      { padding: [30, 30], maxZoom: 12 }
    );
  }, [map, bbox]);
  return null;
}

function GlobalView() {
  const map = useMap();
  useEffect(() => {
    map.setView([20, 0], 2);
  }, [map]);
  return null;
}

function MapControls({ onToggleDark }: { onToggleDark: () => void }) {
  const map = useMap();
  return (
    <div className="absolute top-2 right-2 z-[1000] flex gap-1">
      <button
        onClick={() => map.setView([20, 0], 2)}
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono shadow hover:bg-slate-50 dark:hover:bg-slate-700"
        title="Reset to global view"
      >
        🌍
      </button>
      <button
        onClick={onToggleDark}
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono shadow hover:bg-slate-50 dark:hover:bg-slate-700"
        title="Toggle dark map tiles"
      >
        🗺️
      </button>
    </div>
  );
}

function CategoryLegend({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 p-2 max-w-[200px] max-h-[180px] overflow-y-auto">
      <div className="text-[10px] font-mono font-semibold text-slate-500 mb-1">Legend</div>
      {categories.map((cat) => (
        <div key={cat} className="flex items-center gap-1.5 text-[10px] font-mono text-muted py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[cat] ?? '#6366f1' }} />
          <span className="truncate">{cat}</span>
        </div>
      ))}
    </div>
  );
}

interface MapResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  tags: Record<string, string>;
}

export default function InfraMap({
  results,
  bbox,
  global,
  darkTiles,
  onToggleDark,
}: {
  results: MapResult[];
  bbox?: [number, number, number, number] | null;
  global?: boolean;
  darkTiles?: boolean;
  onToggleDark?: () => void;
}) {
  const center = useMemo(() => {
    if (bbox) {
      const [s, w, n, e] = bbox;
      return [(s + n) / 2, (w + e) / 2] as [number, number];
    }
    if (results.length > 0 && !global) {
      return [results[0].lat, results[0].lon] as [number, number];
    }
    return [20, 0] as [number, number];
  }, [bbox, results, global]);

  const zoom = global ? 2 : bbox ? undefined : results.length > 0 ? 5 : 2;

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    return results
      .filter((r) => {
        if (seen.has(r.category)) return false;
        seen.add(r.category);
        return true;
      })
      .map((r) => r.category);
  }, [results]);

  const tileUrl = darkTiles
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileAttribution = darkTiles
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <ZoomControl position="topleft" />
      {onToggleDark && <MapControls onToggleDark={onToggleDark} />}
      {global && <GlobalView />}
      {bbox && !global && <FitBounds bbox={bbox} />}
      {results.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lon]} icon={markerIcon(CATEGORY_COLORS[r.category] ?? '#6366f1')}>
          <Popup maxWidth={280} minWidth={180}>
            <div className="text-sm font-sans">
              <div className="font-semibold text-slate-900">{r.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{r.category}</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
              </div>
              {r.tags.operator && (
                <div className="text-[11px] text-slate-600 mt-1">
                  <span className="text-slate-400">Operator:</span> {r.tags.operator}
                </div>
              )}
              {r.tags.man_made && (
                <div className="text-[11px] text-slate-600">
                  <span className="text-slate-400">Type:</span> {r.tags.man_made}
                </div>
              )}
              {r.tags.amenity && (
                <div className="text-[11px] text-slate-600">
                  <span className="text-slate-400">Amenity:</span> {r.tags.amenity}
                </div>
              )}
              {r.tags.website && (
                <a
                  href={r.tags.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brand-600 hover:underline mt-1 block"
                >
                  Website ↗
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
      <CategoryLegend categories={uniqueCategories} />
    </MapContainer>
  );
}
