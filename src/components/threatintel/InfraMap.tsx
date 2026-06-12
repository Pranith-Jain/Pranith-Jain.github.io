import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

function markerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'infra-pin',
    html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3);"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
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
      { padding: [20, 20] }
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
}: {
  results: MapResult[];
  bbox?: [number, number, number, number] | null;
  global?: boolean;
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

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {global && <GlobalView />}
      {bbox && !global && <FitBounds bbox={bbox} />}
      {results.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lon]} icon={markerIcon(CATEGORY_COLORS[r.category] ?? '#6366f1')}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-slate-500">{r.category}</div>
              <div className="text-xs font-mono text-slate-400 mt-1">
                {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
              </div>
              {r.tags.operator && <div className="text-xs mt-1">Operator: {r.tags.operator}</div>}
              {r.tags.website && (
                <a
                  href={r.tags.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline mt-1 block"
                >
                  Website →
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
