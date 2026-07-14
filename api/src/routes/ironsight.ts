import type { Context } from 'hono';
import { getSiteUrl } from '../lib/site-config';

function corsHeaders(c: Context): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getSiteUrl(c.env as { SITE_URL?: string }),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 10000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal } as any);
  } finally {
    clearTimeout(id);
  }
}

function j(v: any): Record<string, any> {
  return v && typeof v === 'object' ? v : {};
}

/** Proxy: Israel Alert Status (Tzeva Adom) */
export async function ironsightAlertsHandler(c: Context) {
  try {
    const res = await fetchWithTimeout('https://api.tzevaadom.co.il/notifications', 12000, {
      headers: { 'User-Agent': 'GlobalPulse/1.0', Accept: 'application/json' },
    });
    if (!res.ok)
      return c.json(
        { status: 'CLEAR', activeCount: 0, alerts: [], lastChecked: new Date().toISOString() },
        200,
        corsHeaders(c)
      );

    const data: any = await res.json();

    const alerts = (Array.isArray(data) ? data : []).map((a: any, i: number) => {
      const threat = String(a.threat || a.title || 'Alert');
      const cities = Array.isArray(a.cities) ? a.cities.map(String) : [String(a.data || 'Unknown')];
      return {
        id: `tzeva-${i}-${Date.now()}`,
        time: String(a.date || new Date().toISOString()),
        type: threat.toLowerCase().includes('missile')
          ? 'MISSILE'
          : threat.toLowerCase().includes('rocket')
            ? 'ROCKET'
            : threat.toLowerCase().includes('drone')
              ? 'DRONE'
              : 'ALERT',
        threat,
        locations: cities,
        source: 'Pikud HaOref',
        active: true,
      };
    });
    return c.json(
      {
        status: alerts.length > 0 ? 'ACTIVE' : 'CLEAR',
        activeCount: alerts.length,
        alerts,
        lastChecked: new Date().toISOString(),
      },
      200,
      corsHeaders(c)
    );
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json(
      { status: 'CLEAR', activeCount: 0, alerts: [], lastChecked: new Date().toISOString(), error: 'fetch failed' },
      200,
      corsHeaders(c)
    );
  }
}

/** Proxy: Military flights from adsb.lol */
export async function ironsightFlightsHandler(c: Context) {
  try {
    const [milRes, regionRes] = await Promise.allSettled([
      fetchWithTimeout('https://api.adsb.lol/v2/mil', 8000).then((r) => (r.ok ? r.json() : { ac: [] })),
      fetchWithTimeout('https://api.adsb.lol/v2/lat/30/lon/48/dist/2500', 8000).then((r) =>
        r.ok ? r.json() : { ac: [] }
      ),
    ]);
    const milData: Record<string, unknown> = milRes.status === 'fulfilled' ? j(milRes.value) : { ac: [] };
    const regionData: Record<string, unknown> = regionRes.status === 'fulfilled' ? j(regionRes.value) : { ac: [] };
    const milAc = Array.isArray(milData.ac) ? milData.ac : [];
    const regionAc = Array.isArray(regionData.ac) ? regionData.ac : [];
    const milAircraft = milAc.filter(
      (a: Record<string, unknown>) =>
        a.lat && a.lon && Number(a.lat) >= 10 && Number(a.lat) <= 45 && Number(a.lon) >= 20 && Number(a.lon) <= 70
    );
    const regionMil = regionAc.filter((a: Record<string, unknown>) => {
      const flags = Number(a.dbFlags || 0);
      return flags & 1 || flags & 2;
    });
    const seen = new Set<string>();

    const all: any[] = [];
    for (const list of [milAircraft, regionMil]) {
      for (const a of list) {
        const hex = String(a.hex || '')
          .trim()
          .replace('~', '');
        if (hex && !seen.has(hex) && a.lat && a.lon) {
          seen.add(hex);
          const cs = String(a.flight || '')
            .trim()
            .toUpperCase();
          const t = String(a.t || '').toUpperCase();
          let type = 'Military Aircraft';
          if (t.includes('RQ4') || t.includes('MQ9')) type = 'ISR Drone (UAV)';
          else if (t.includes('RC135') || t.includes('EP3')) type = 'SIGINT/ELINT';
          else if (t.includes('E3')) type = 'AWACS';
          else if (t.includes('KC135') || t.includes('KC46') || t.includes('A332')) type = 'Aerial Tanker';
          else if (t.includes('C17') || t.includes('C5')) type = 'Strategic Airlift';
          else if (t.includes('F35')) type = 'Fighter (F-35)';
          else if (t.includes('F16')) type = 'Fighter (F-16)';
          else if (cs.startsWith('FORTE')) type = 'ISR Drone (UAV)';
          else if (cs.startsWith('RCH') || cs.startsWith('REACH')) type = 'Strategic Airlift';
          all.push({
            icao24: hex,
            callsign: String(a.flight || '').trim(),
            origin: String(a.ownOp || ''),
            lat: Number(a.lat),
            lon: Number(a.lon),
            altitude: typeof a.alt_baro === 'number' ? a.alt_baro : 0,
            heading: Math.round(Number(a.track || 0)),
            speed: Math.round(Number(a.gs || 0)),
            type,
            aircraftType: String(a.t || ''),
            squawk: String(a.squawk || ''),
            isMilitary: !!(Number(a.dbFlags || 0) & 1),
          });
        }
      }
    }
    return c.json(
      {
        total: regionAc.length,
        military: all.length,
        flights: all,
        source: 'adsb.lol',
        updated: new Date().toISOString(),
      },
      200,
      corsHeaders(c)
    );
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json(
      { total: 0, military: 0, flights: [], source: 'adsb.lol', error: 'fetch failed' },
      200,
      corsHeaders(c)
    );
  }
}

/** Proxy: Google News RSS for strikes */
export async function ironsightStrikesHandler(c: Context) {
  try {
    const queries = ['Iran+Israel+missile+strike+intercept', 'Iran+Israel+drone+attack+rocket'];

    const all: any[] = [];
    for (const q of queries) {
      try {
        const res = await fetchWithTimeout(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, 8000);
        if (!res.ok) continue;
        const text = await res.text();
        const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const item of items.slice(0, 12)) {
          const title = (item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
          const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
          const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
          const t = title.toLowerCase();
          let category = 'REPORT';
          let severity = 'low';
          if (t.match(/intercept|iron dome|shoot down/)) {
            category = 'INTERCEPTION';
            severity = 'high';
          } else if (t.match(/missile|ballistic/)) {
            category = 'MISSILE';
            severity = 'critical';
          } else if (t.match(/drone|uav|shahed/)) {
            category = 'DRONE';
            severity = 'high';
          } else if (t.match(/airstrike|air strike|bombing/)) {
            category = 'AIRSTRIKE';
            severity = 'critical';
          } else if (t.match(/rocket/)) {
            category = 'ROCKET';
            severity = 'high';
          }
          let country = 'Middle East';
          if (t.includes('iran')) country = 'Iran';
          else if (t.includes('israel')) country = 'Israel';
          else if (t.includes('lebanon')) country = 'Lebanon';
          else if (t.includes('yemen')) country = 'Yemen';
          all.push({
            id: `strike-${all.length}-${Date.now()}`,
            date: pubDate || new Date().toISOString(),
            category,
            severity,
            title: title.substring(0, 120),
            source: 'Google News',
            url: link,
            country,
          });
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        continue;
      }
    }
    const seen = new Set<string>();
    const deduped = all.filter((s) => {
      const k = String(s.title || '')
        .toLowerCase()
        .substring(0, 50);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    deduped.sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime());
    return c.json(deduped.slice(0, 25), 200, corsHeaders(c));
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json([], 200, corsHeaders(c));
  }
}

/** Proxy: Regional threat monitor (Google News RSS per country) */
export async function ironsightRegionalHandler(c: Context) {
  try {
    const queries = [
      { country: 'Lebanon', q: 'Lebanon+Hezbollah+strike+attack', flag: '🇱🇧', color: '#e06030' },
      { country: 'Iran', q: 'Iran+military+strike+missile', flag: '🇮🇷', color: '#cc3355' },
      { country: 'Iraq', q: 'Iraq+militia+attack+strike', flag: '🇮🇶', color: '#cc8833' },
      { country: 'Syria', q: 'Syria+strike+airstrike+attack', flag: '🇸🇾', color: '#aa7744' },
      { country: 'Yemen', q: 'Yemen+Houthi+missile+attack', flag: '🇾🇪', color: '#55aa55' },
      { country: 'Israel', q: 'Israel+alert+strike+attack', flag: '🇮🇱', color: '#0066cc' },
      { country: 'Saudi Arabia', q: 'Saudi+Yemen+attack', flag: '🇸🇦', color: '#33aa77' },
      { country: 'Jordan', q: 'Jordan+tensions+security', flag: '🇯🇴', color: '#4488cc' },
    ];

    const alerts: any[] = [];
    for (const { country, q, flag, color } of queries) {
      try {
        const res = await fetchWithTimeout(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, 6000);
        if (!res.ok) {
          alerts.push({ name: country, flag, color, events: [], level: 'CLEAR' });
          continue;
        }
        const text = await res.text();
        const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

        const events = items.slice(0, 3).map((item: any) => {
          const title = (item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '')
            .replace(/<!\[CDATA\[|\]\]>/g, '')
            .substring(0, 120);
          const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
          const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
          const t = title.toLowerCase();
          let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
          if (t.match(/missile|ballistic|nuclear/)) severity = 'critical';
          else if (t.match(/strike|attack|bombing|rocket/)) severity = 'high';
          else if (t.match(/tension|warning|alert/)) severity = 'medium';
          return { title, source: 'Google News', time: pubDate || new Date().toISOString(), url: link, severity };
        });
        const level = events.some((e) => e.severity === 'critical')
          ? 'CRITICAL'
          : events.some((e) => e.severity === 'high')
            ? 'ALERT'
            : events.length > 0
              ? 'MONITORING'
              : 'CLEAR';
        alerts.push({ name: country, flag, color, events, level });
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        alerts.push({ name: country, flag, color, events: [], level: 'CLEAR' });
      }
    }
    const order: Record<string, number> = { CRITICAL: 0, ALERT: 1, MONITORING: 2, CLEAR: 3 };
    alerts.sort((a, b) => (order[a.level] ?? 4) - (order[b.level] ?? 4));
    return c.json({ alerts, updated: new Date().toISOString() }, 200, corsHeaders(c));
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ alerts: [], updated: new Date().toISOString() }, 200, corsHeaders(c));
  }
}

/** Proxy: Yahoo Finance markets */
export async function ironsightMarketsHandler(c: Context) {
  try {
    const symbols = [
      { symbol: 'LMT', name: 'Lockheed Martin' },
      { symbol: 'RTX', name: 'Raytheon' },
      { symbol: 'NOC', name: 'Northrop Grumman' },
      { symbol: 'BA', name: 'Boeing' },
      { symbol: 'GD', name: 'General Dynamics' },
      { symbol: 'LHX', name: 'L3Harris' },
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: '^DJI', name: 'Dow Jones' },
      { symbol: '^VIX', name: 'VIX' },
      { symbol: 'GC=F', name: 'Gold' },
      { symbol: 'DX-Y.NYB', name: 'USD Index' },
      { symbol: 'CL=F', name: 'WTI Crude' },
      { symbol: 'BZ=F', name: 'Brent Crude' },
      { symbol: 'NG=F', name: 'Natural Gas' },
    ];
    const results = await Promise.all(
      symbols.map(async (s) => {
        try {
          const res = await fetchWithTimeout(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1d&range=5d`,
            8000,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (!res.ok) throw new Error('fail');

          const raw: any = await res.json();
          const meta = j(raw?.chart?.result?.[0])?.meta;
          if (!meta) throw new Error('no data');
          const price = meta.regularMarketPrice ?? 0;
          const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
          const change = Math.round((price - prev) * 100) / 100;
          const pct = prev ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
          return { symbol: s.symbol, name: s.name, price: Math.round(price * 100) / 100, change, changePercent: pct };
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          return { symbol: s.symbol, name: s.name, price: 0, change: 0, changePercent: 0, error: true };
        }
      })
    );
    return c.json(results, 200, corsHeaders(c));
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json([], 200, corsHeaders(c));
  }
}

/** Proxy: CoinGecko crypto prices */
export async function ironsightCryptoHandler(c: Context) {
  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true',
      8000
    );
    if (!res.ok) throw new Error('fail');

    const data: any = await res.json();
    const result = [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        price: data?.bitcoin?.usd ?? 0,
        changePercent: data?.bitcoin?.usd_24h_change ?? 0,
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        price: data?.ethereum?.usd ?? 0,
        changePercent: data?.ethereum?.usd_24h_change ?? 0,
      },
      {
        symbol: 'SOL',
        name: 'Solana',
        price: data?.solana?.usd ?? 0,
        changePercent: data?.solana?.usd_24h_change ?? 0,
      },
      {
        symbol: 'BNB',
        name: 'BNB',
        price: data?.binancecoin?.usd ?? 0,
        changePercent: data?.binancecoin?.usd_24h_change ?? 0,
      },
    ];
    return c.json(result, 200, corsHeaders(c));
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json([], 200, corsHeaders(c));
  }
}

/** Proxy: Polymarket prediction markets */
export async function ironsightPolymarketHandler(c: Context) {
  try {
    const slugs = [
      'will-israel-launch-a-full-ground-invasion-of-lebanon-in-2025',
      'iran-vs-israel-2025',
      'will-the-united-states-join-the-war-against-iran-in-2025',
      'will-there-be-a-ceasefire-in-gaza-before-july-2025',
      'will-iran-nuclear-test-2025',
    ];

    const results: any[] = [];
    for (const slug of slugs) {
      try {
        const res = await fetchWithTimeout(`https://gamma-api.polymarket.com/markets?slug=${slug}`, 8000);
        if (!res.ok) continue;

        const data: any = await res.json();
        const market = Array.isArray(data) ? data[0] : data;
        if (market?.question) {
          let outcomes: Array<{ label: string; price: number }> = [];
          try {
            outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || [];
          } catch (_catchErr) {
            console.error(
              'ironsightPolymarketHandler failed:',
              _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
            );
            outcomes = [];
          }
          results.push({
            id: market.id || slug,
            question: market.question,
            slug: market.slug || slug,
            outcomes,
            volume24hr: market.volume24hr || 0,
            volumeTotal: market.volume || 0,
            oneDayPriceChange: market.priceChange24hr || 0,
          });
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        continue;
      }
    }
    return c.json({ markets: results, count: results.length, updated: new Date().toISOString() }, 200, corsHeaders(c));
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ markets: [], count: 0, updated: new Date().toISOString() }, 200, corsHeaders(c));
  }
}

/** Proxy: NASA FIRMS fire detections */
export async function ironsightFiresHandler(c: Context) {
  try {
    const res = await fetchWithTimeout(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
      30000
    );
    if (!res.ok) throw new Error('fail');
    const text = await res.text();
    const lines = text.split('\n');
    if (!lines[0])
      return c.json(
        {
          total: 0,
          highIntensity: 0,
          possibleExplosions: 0,
          events: [],
          source: 'NASA FIRMS VIIRS',
          updated: new Date().toISOString(),
        },
        200,
        corsHeaders(c)
      );
    const header = lines[0].split(',');
    const latIdx = header.indexOf('latitude');
    const lonIdx = header.indexOf('longitude');
    const brightIdx = header.indexOf('bright_ti4');
    const frpIdx = header.indexOf('frp');
    const confIdx = header.indexOf('confidence');
    const dateIdx = header.indexOf('acq_date');
    const timeIdx = header.indexOf('acq_time');

    const events: any[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      if (cols.length < header.length) continue;
      const lat = parseFloat(cols[latIdx] ?? '');
      const lon = parseFloat(cols[lonIdx] ?? '');
      if (isNaN(lat) || isNaN(lon) || lat < 20 || lat > 42 || lon < 25 || lon > 65) continue;
      const brightness = parseFloat(cols[brightIdx] ?? '');
      const frp = parseFloat(cols[frpIdx] ?? '');
      let intensity: 'low' | 'medium' | 'high' | 'extreme' = 'low';
      if (frp > 100 || brightness > 400) intensity = 'extreme';
      else if (frp > 50 || brightness > 350) intensity = 'high';
      else if (frp > 20 || brightness > 320) intensity = 'medium';
      events.push({
        lat,
        lon,
        brightness: Math.round(brightness * 10) / 10,
        frp: Math.round(frp * 10) / 10,
        confidence: cols[confIdx] || '',
        intensity,
        datetime: `${cols[dateIdx] || ''}T${(cols[timeIdx] || '').substring(0, 2)}:${(cols[timeIdx] || '').substring(2, 4)}:00Z`,
        possibleExplosion: frp > 80 && brightness > 380,
      });
    }
    events.sort((a, b) => (b.frp || 0) - (a.frp || 0));
    const total = events.length;
    const highIntensity = events.filter((e) => e.intensity === 'high' || e.intensity === 'extreme').length;
    const possibleExplosions = events.filter((e) => e.possibleExplosion).length;
    return c.json(
      {
        total,
        highIntensity,
        possibleExplosions,
        events: events.slice(0, 100),
        source: 'NASA FIRMS VIIRS',
        updated: new Date().toISOString(),
      },
      200,
      corsHeaders(c)
    );
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json(
      {
        total: 0,
        highIntensity: 0,
        possibleExplosions: 0,
        events: [],
        source: 'NASA FIRMS VIIRS',
        error: 'fetch failed',
      },
      200,
      corsHeaders(c)
    );
  }
}
