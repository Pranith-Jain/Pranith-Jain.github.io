// src/components/dfir/osint/MapPane.tsx
import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pin } from '../../../lib/dfir/osint/osint-schema';

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'osint-pin',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface MapPaneProps {
  pins: Pin[];
  selectedPinId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onSelectPin: (pinId: string) => void;
}

export function MapPane({ pins, selectedPinId, onMapClick, onSelectPin }: MapPaneProps): JSX.Element {
  const center = useMemo<[number, number]>(() => (pins[0] ? [pins[0].lat, pins[0].lng] : [20, 0]), [pins]);
  return (
    <div className="h-[600px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <MapContainer center={center} zoom={pins[0] ? 12 : 2} className="h-full w-full">
        <TileLayer
          crossOrigin="anonymous"
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onMapClick={onMapClick} />
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.id === selectedPinId ? '#2c3ee5' : p.color)}
            eventHandlers={{ click: () => onSelectPin(p.id) }}
          >
            <Popup>
              <strong>{p.label}</strong>
              {p.address && <div className="text-xs">{p.address}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
