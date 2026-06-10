// src/lib/dfir/osint/geocode.ts
const BASE = 'https://nominatim.openstreetmap.org';

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
}

export async function searchPlace(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `${BASE}/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${BASE}/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
