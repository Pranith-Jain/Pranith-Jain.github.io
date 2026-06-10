// src/components/dfir/osint/MapPane.tsx
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pin } from '../../../lib/dfir/osint/osint-schema';

const SAFE_HEX = /^#[0-9a-fA-F]{3,8}$/;
const FALLBACK_COLOR = '#2c3ee5';

function pinIcon(color: string, selected = false): L.DivIcon {
  // Highlight selection with a ring, not by swapping the colour — the previous
  // approach forced the selected pin to #2c3ee5, which is invisible when the
  // pin's own colour is already the default #2c3ee5.
  const safe = SAFE_HEX.test(color) ? color : FALLBACK_COLOR;
  const size = selected ? 20 : 14;
  const shadow = selected ? 'box-shadow:0 0 0 3px #fff,0 0 0 5px #2c3ee5;' : 'box-shadow:0 0 0 1px rgba(0,0,0,.3);';
  return L.divIcon({
    className: 'osint-pin',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${safe};border:2px solid #fff;${shadow}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

export interface MapPaneProps {
  pins: Pin[];
  selectedPinId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onSelectPin: (pinId: string) => void;
}

export function MapPane({ pins, selectedPinId, onMapClick, onSelectPin }: MapPaneProps): JSX.Element {
  const selectedPin = useMemo(() => pins.find((p) => p.id === selectedPinId) ?? null, [pins, selectedPinId]);
  const recenterTarget = useMemo<{ lat: number; lng: number; zoom: number } | null>(() => {
    if (selectedPin) return { lat: selectedPin.lat, lng: selectedPin.lng, zoom: 12 };
    if (pins[0]) return { lat: pins[0].lat, lng: pins[0].lng, zoom: 12 };
    return null;
  }, [selectedPin, pins]);

  return (
    <div className="h-[600px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <MapContainer center={[20, 0]} zoom={2} className="h-full w-full">
        <TileLayer
          crossOrigin="anonymous"
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onMapClick={onMapClick} />
        {recenterTarget && <Recenter lat={recenterTarget.lat} lng={recenterTarget.lng} zoom={recenterTarget.zoom} />}
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.color, p.id === selectedPinId)}
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
