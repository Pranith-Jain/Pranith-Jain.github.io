// api/src/routes/firms-ukmto.ts
//
// Live overlay endpoints for the Global Pulse map:
//   GET /api/v1/firms-fires     — NASA FIRMS VIIRS thermal anomalies (CSV)
//   GET /api/v1/ukmto-incidents — UKMTO maritime security incidents (GeoJSON)
//
// Both are pulled on each request, parsed, normalised, and edge-cached for
// an hour. The read path of GlobalPulse calls these via SELF.fetch and
// folds the results into the `geopolitical` / `war_room` layers (matching
// the existing kind taxonomy in global-pulse/types.ts).
//
// NASA FIRMS: free public CSV (no key) —
//   https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/world/1
//   Columns: latitude,longitude,brightness_ti4,scan,track,acq_date,acq_time,
//            satellite,instrument,confidence,version,bright_ti4,frp,daynight
//
// UKMTO: free public GeoJSON incidents feed (no key) —
//   https://www.ukmto.org/api/incidents
//   Each feature has properties.incident_id, .title, .date, .type, .lat, .lon.

import type { Context } from 'hono';
import type { Env } from '../env';

const FIRMS_CSV_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/world/1';
const UKMTO_URL = 'https://www.ukmto.org/api/incidents';

const CACHE_KEY = 'https://global-pulse-cache.internal/firms-ukmto-v1';
const CACHE_TTL = 1800; // 30 min — fire fronts change on the hour, not the second

const FETCH_UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';

export interface FirmsFire {
  id: string;
  lat: number;
  lng: number;
  brightness: number;
  frp: number;
  confidence: string;
  satellite: string;
  acq_date: string;
  acq_time: string;
  daynight: 'D' | 'N';
}

export interface UkmtoIncident {
  id: string;
  title: string;
  description?: string;
  date: string;
  lat: number;
  lng: number;
  category: string;
  reference?: string;
}

export interface FirmsUkmtoResponse {
  generated_at: string;
  fires: FirmsFire[];
  incidents: UkmtoIncident[];
}

/* ─── CSV parser (no deps; FIRMS header is well-known) ─────────────── */

function parseFirmsCsv(text: string): FirmsFire[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const firstLine = lines[0];
  if (!firstLine) return [];
  const header = firstLine.split(',').map((h) => h.trim());
  const idx = (col: string): number => header.indexOf(col);
  const latI = idx('latitude');
  const lngI = idx('longitude');
  const briI = idx('bright_ti4');
  const frpI = idx('frp');
  const conI = idx('confidence');
  const satI = idx('satellite');
  const dateI = idx('acq_date');
  const timeI = idx('acq_time');
  const dnI = idx('daynight');
  if (latI < 0 || lngI < 0) return [];

  const out: FirmsFire[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < header.length) continue;
    const lat = Number(cols[latI]);
    const lng = Number(cols[lngI]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    out.push({
      id: `firms-${i}-${cols[dateI] || ''}-${cols[timeI] || ''}`,
      lat,
      lng,
      brightness: Number(cols[briI] ?? 0),
      frp: Number(cols[frpI] ?? 0),
      confidence: cols[conI] ?? 'low',
      satellite: cols[satI] ?? 'NOAA-20',
      acq_date: cols[dateI] || '',
      acq_time: cols[timeI] || '',
      daynight: (cols[dnI] || 'D') as 'D' | 'N',
    });
  }
  return out;
}

/* ─── Handlers ─────────────────────────────────────────────────────── */

async function fetchFirms(): Promise<FirmsFire[]> {
  try {
    const r = await fetch(FIRMS_CSV_URL, {
      headers: { 'user-agent': FETCH_UA, accept: 'text/csv' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return [];
    const csv = await r.text();
    return parseFirmsCsv(csv);
  } catch (_catchErr) {
    console.error('fetchFirms failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

async function fetchUkmto(): Promise<UkmtoIncident[]> {
  try {
    const r = await fetch(UKMTO_URL, {
      headers: { 'user-agent': FETCH_UA, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as unknown;
    if (!Array.isArray(data)) return [];

    // UKMTO's schema varies by year; pull a few known field names defensively.
    return data.flatMap((row, i): UkmtoIncident[] => {
      const r = row as Record<string, unknown>;
      const pick = (...keys: string[]): unknown => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null) return r[k];
        }
        return undefined;
      };
      const lat = Number(pick('lat', 'latitude', 'Lat', 'Latitude'));
      const lng = Number(pick('lon', 'lng', 'longitude', 'Lon', 'Lng', 'Longitude'));
      if (!isFinite(lat) || !isFinite(lng)) return [];
      const date = String(pick('date', 'incident_date', 'date_of_incident', 'Date') ?? '');
      return [
        {
          id: `ukmto-${i}-${date}`,
          title: String(pick('title', 'name', 'incident_title', 'Name') ?? 'Maritime incident'),
          description: pick('description', 'details', 'summary')
            ? String(pick('description', 'details', 'summary'))
            : undefined,
          date,
          lat,
          lng,
          category: String(pick('category', 'type', 'incident_type', 'Type') ?? 'incident'),
          reference: pick('reference', 'ref', 'id') ? String(pick('reference', 'ref', 'id')) : undefined,
        },
      ];
    });
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

export async function firmsUkmtoHandler(_c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cached = await cache.match(new Request(CACHE_KEY));
    if (cached) return new Response(cached.body, cached);

    const [fires, incidents] = await Promise.all([fetchFirms(), fetchUkmto()]);
    const body: FirmsUkmtoResponse = {
      generated_at: new Date().toISOString(),
      fires,
      incidents,
    };
    const res = new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${CACHE_TTL}`,
      },
    });
    try {
      await cache.put(new Request(CACHE_KEY), res.clone());
    } catch {
      /* best-effort */
    }
    return res;
  } catch (e) {
    console.error('firmsUkmtoHandler failed:', e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
