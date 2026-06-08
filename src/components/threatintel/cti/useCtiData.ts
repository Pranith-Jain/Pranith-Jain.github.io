import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../../lib/fetch-json';
import type { CtiData, CtiPoint, CtiArc, ThreatCard, FeedItem, SectorSlice } from './geo';
import {
  normalizeThreatMap,
  normalizeRansomwareMap,
  normalizeCveThreatMap,
  normalizeTopThreats,
  normalizeFeed,
  normalizeSectors,
  synthesizeArcs,
  deriveKpis,
} from './geo';

/* ─── Mode / layer types ───────────────────────────────────────────────── */

export type CtiMode = 'severity' | 'ransomware' | 'incident';

export type ExtraLayer = 'c2' | 'breach' | 'darkweb' | 'cyber_attack' | 'war_room' | 'aircraft';

interface UseCtiDataOptions {
  mode: CtiMode;
  windowDays: number;
  layers: Set<ExtraLayer>;
}

/* ─── Endpoint map ─────────────────────────────────────────────────────── */

const MODE_ENDPOINTS: Record<CtiMode, string> = {
  severity: '/api/v1/threat-map',
  ransomware: '/api/v1/ransomware-map',
  incident: '/api/v1/cve-threat-map',
};

/* ─── Hook ─────────────────────────────────────────────────────────────── */

export function useCtiData({ mode, windowDays, layers: _layers }: UseCtiDataOptions) {
  const [data, setData] = useState<CtiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const myId = ++loadIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const mapUrl = MODE_ENDPOINTS[mode];
        const topUrl = `/api/v1/cve-recent?days=${windowDays}`;
        const feedUrl = '/api/v1/live-iocs';
        const sectorUrl = `/api/v1/ransomware-recent?days=${windowDays}`;

        const fetchOpts = { signal, cache: 'no-store' as RequestCache };

        const [mapRes, topRes, feedRes, sectorRes] = await Promise.allSettled([
          fetchJson<unknown>(mapUrl, fetchOpts),
          fetchJson<unknown>(topUrl, fetchOpts),
          fetchJson<unknown>(feedUrl, fetchOpts),
          fetchJson<unknown>(sectorUrl, fetchOpts),
        ]);

        if (loadIdRef.current !== myId) return;

        // Normalize map points based on mode
        let points: CtiPoint[] = [];
        let generatedAt: string | null = null;
        if (mapRes.status === 'fulfilled') {
          const mapData = mapRes.value as Record<string, unknown>;
          if (mode === 'severity') {
            const n = normalizeThreatMap(mapData as unknown as Parameters<typeof normalizeThreatMap>[0]);
            points = n.points;
            generatedAt = n.generatedAt;
          } else if (mode === 'ransomware') {
            const n = normalizeRansomwareMap(mapData as unknown as Parameters<typeof normalizeRansomwareMap>[0]);
            points = n.points;
            generatedAt = n.generatedAt;
          } else {
            const n = normalizeCveThreatMap(mapData as unknown as Parameters<typeof normalizeCveThreatMap>[0]);
            points = n.points;
            generatedAt = n.generatedAt;
          }
        }

        // Synthesize arcs from points
        const arcs: CtiArc[] = synthesizeArcs(points);

        // Top threats
        let topThreats: ThreatCard[] = [];
        if (topRes.status === 'fulfilled') {
          topThreats = normalizeTopThreats(topRes.value as unknown as Parameters<typeof normalizeTopThreats>[0]);
        }

        // Live feed
        let feed: FeedItem[] = [];
        if (feedRes.status === 'fulfilled') {
          feed = normalizeFeed(feedRes.value as unknown as Parameters<typeof normalizeFeed>[0]);
        }

        // Sectors
        let sectors: SectorSlice[] = [];
        if (sectorRes.status === 'fulfilled') {
          sectors = normalizeSectors(sectorRes.value as unknown as Parameters<typeof normalizeSectors>[0]);
        }

        // KPIs
        const kpis = deriveKpis(points, feed.length);

        const degraded = mapRes.status === 'rejected' || topRes.status === 'rejected' || feedRes.status === 'rejected';

        setData({ arcs, points, topThreats, feed, kpis, sectors, generatedAt, degraded });
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          setError(e instanceof Error ? e.message : 'Failed to load CTI data.');
        }
      } finally {
        setLoading(false);
      }
    },
    [mode, windowDays]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return { data, loading, error, refresh: load };
}
