export interface FireDetection {
  id: string;
  lat: number;
  lng: number;
  brightness: number;
  frp: number;
  confidence: 'low' | 'nominal' | 'high';
  acqDate: string;
  acqTime: string;
}

let cached: FireDetection[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchFireDetections(): Promise<FireDetection[]> {
  if (cached && Date.now() - cacheTime < CACHE_TTL) return cached;

  try {
    // NASA FIRMS free DEMO_KEY (rate-limited but works without registration)
    const res = await fetch('https://firms.modaps.eosdis.nasa.gov/api/area/csv/DEMO_KEY/VIIRS_SNPP_NRT/world/1/1', {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return cached ?? [];

    const text = await res.text();
    const lines = text.split('\n').slice(1);
    const fires: FireDetection[] = [];

    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length < 8) continue;
      const lat = parseFloat(cols[0]!);
      const lng = parseFloat(cols[1]!);
      const brightness = parseFloat(cols[2]!);
      const frp = parseFloat(cols[8]!);
      const confidence = (cols[12]?.trim() || 'nominal') as FireDetection['confidence'];
      const acqDate = cols[5] || '';
      const acqTime = cols[6] || '';

      if (isNaN(lat) || isNaN(lng)) continue;

      fires.push({
        id: `fire-${fires.length}-${lat.toFixed(2)}-${lng.toFixed(2)}`,
        lat,
        lng,
        brightness: isNaN(brightness) ? 0 : brightness,
        frp: isNaN(frp) ? 0 : frp,
        confidence,
        acqDate,
        acqTime,
      });
    }

    cached = fires.slice(0, 200);
    cacheTime = Date.now();
    return cached;
  } catch {
    return cached ?? [];
  }
}
