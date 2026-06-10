// src/lib/dfir/osint/geocode.ts
const BASE = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 8000;

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
}

/**
 * fetch with an abort timeout. Nominatim can be slow or unresponsive; without
 * this the caller (e.g. click-to-pin awaiting reverseGeocode) would hang
 * indefinitely. AbortSignal.timeout fires an AbortError that the callers' catch
 * blocks turn into the empty/null fallback. Guarded for environments lacking
 * AbortSignal.timeout (older test runners).
 */
function fetchWithTimeout(url: string): Promise<Response> {
  const signal =
    typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  return fetch(url, { headers: { Accept: 'application/json' }, signal });
}

export async function searchPlace(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `${BASE}/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url);
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
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
