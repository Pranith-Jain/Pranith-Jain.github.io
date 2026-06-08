/**
 * Pure utility functions for the CTI Platform globe.
 * Severity → color mapping, arc synthesis, KPI derivation, normalizers.
 */

import { CHART_SEV } from '../soc/tone';
import { getCentroid } from './country-centroids';

/* ─── Severity types ──────────────────────────────────────────────────── */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/* ─── Severity → globe hex color ───────────────────────────────────────── */

const GLOBE_SEV_COLOR: Record<Severity, string> = {
  critical: '#e11d48',
  high: '#f43f5e',
  medium: '#f59e0b',
  low: '#10b981',
  info: '#0ea5e9',
};

export function severityColor(sev: Severity): string {
  return GLOBE_SEV_COLOR[sev] ?? '#64748b';
}

export function severityFromCount(count: number, thresholds = { critical: 1000, high: 500, medium: 100 }): Severity {
  if (count >= thresholds.critical) return 'critical';
  if (count >= thresholds.high) return 'high';
  if (count >= thresholds.medium) return 'medium';
  return 'low';
}

/* ─── Chart severity helpers (reuse tone.ts) ──────────────────────────── */

export function chartSeverityColor(sev: string): string {
  return CHART_SEV[sev.toUpperCase()] ?? '#64748b';
}

/* ─── Data shapes (normalized from API responses) ──────────────────────── */

export interface CtiPoint {
  lat: number;
  lng: number;
  severity: Severity;
  count: number;
  label: string;
  countryCode: string;
}

export interface CtiArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  severity: Severity;
  label: string;
}

export interface ThreatCard {
  id: string;
  title: string;
  severity: string;
  score: number | null;
  kev: boolean;
  source: string;
  published: string;
}

export interface FeedItem {
  id: string;
  value: string;
  kind: string;
  source: string;
  observedAt?: string;
}

export interface CtiKpis {
  entries24h: number;
  critical: number;
  high: number;
  geoCount: number;
}

export interface SectorSlice {
  label: string;
  value: number;
}

export interface CtiData {
  arcs: CtiArc[];
  points: CtiPoint[];
  topThreats: ThreatCard[];
  feed: FeedItem[];
  kpis: CtiKpis;
  sectors: SectorSlice[];
  generatedAt: string | null;
  degraded: boolean;
}

/* ─── Arc synthesis ────────────────────────────────────────────────────── */

const FOCAL_LAT = 30;
const FOCAL_LNG = 10;

/**
 * Build arcs from source-country points to a focal target node.
 * This models "observed source telemetry converging on a monitored point"
 * — NOT invented attacker→victim attribution.
 */
export function synthesizeArcs(points: CtiPoint[]): CtiArc[] {
  return points
    .filter((p) => p.count > 0 && (p.lat !== 0 || p.lng !== 0))
    .slice(0, 40)
    .map((p) => ({
      startLat: p.lat,
      startLng: p.lng,
      endLat: FOCAL_LAT,
      endLng: FOCAL_LNG,
      color: severityColor(p.severity),
      severity: p.severity,
      label: `${p.label} → focal target (observed source telemetry)`,
    }));
}

/* ─── KPI derivation ───────────────────────────────────────────────────── */

export function deriveKpis(points: CtiPoint[], feedCount: number): CtiKpis {
  const critical = points.filter((p) => p.severity === 'critical').length;
  const high = points.filter((p) => p.severity === 'high').length;
  const geoCount = new Set(points.map((p) => p.countryCode).filter(Boolean)).size;
  return {
    entries24h: feedCount,
    critical,
    high,
    geoCount,
  };
}

/* ─── Normalizers ──────────────────────────────────────────────────────── */

interface ThreatMapCountry {
  country: string;
  countryCode: string;
  count: number;
  sources: Record<string, number>;
}

interface ThreatMapResponse {
  generated_at: string;
  countries: ThreatMapCountry[];
}

export function normalizeThreatMap(data: ThreatMapResponse): { points: CtiPoint[]; generatedAt: string } {
  const points: CtiPoint[] = data.countries
    .filter((c) => c.count > 0)
    .map((c) => {
      const centroid = getCentroid(c.countryCode);
      return {
        lat: centroid?.lat ?? 0,
        lng: centroid?.lng ?? 0,
        severity: severityFromCount(c.count),
        count: c.count,
        label: `${c.country} — ${c.count} indicators`,
        countryCode: c.countryCode,
      };
    })
    .filter((p) => p.lat !== 0 || p.lng !== 0);

  return { points, generatedAt: data.generated_at };
}

interface RansomwareCountry {
  country: string;
  countryCode: string;
  victim_count: number;
  groups: string[];
}

interface RansomwareMapResponse {
  generated_at: string;
  countries: RansomwareCountry[];
}

export function normalizeRansomwareMap(data: RansomwareMapResponse): { points: CtiPoint[]; generatedAt: string } {
  const points: CtiPoint[] = data.countries
    .filter((c) => c.victim_count > 0)
    .map((c) => {
      const centroid = getCentroid(c.countryCode);
      return {
        lat: centroid?.lat ?? 0,
        lng: centroid?.lng ?? 0,
        severity: severityFromCount(c.victim_count, { critical: 50, high: 20, medium: 5 }),
        count: c.victim_count,
        label: `${c.country} — ${c.victim_count} victims`,
        countryCode: c.countryCode,
      };
    })
    .filter((p) => p.lat !== 0 || p.lng !== 0);

  return { points, generatedAt: data.generated_at };
}

interface CveThreatMapCountry {
  country: string;
  countryCode: string;
  cve_count: number;
  cvss_avg: number;
}

interface CveThreatMapResponse {
  generated_at: string;
  countries: CveThreatMapCountry[];
}

export function normalizeCveThreatMap(data: CveThreatMapResponse): { points: CtiPoint[]; generatedAt: string } {
  const points: CtiPoint[] = data.countries
    .filter((c) => c.cve_count > 0)
    .map((c) => {
      const centroid = getCentroid(c.countryCode);
      return {
        lat: centroid?.lat ?? 0,
        lng: centroid?.lng ?? 0,
        severity: (c.cvss_avg >= 9
          ? 'critical'
          : c.cvss_avg >= 7
            ? 'high'
            : c.cvss_avg >= 4
              ? 'medium'
              : 'low') as Severity,
        count: c.cve_count,
        label: `${c.country} — ${c.cve_count} CVEs (avg CVSS ${c.cvss_avg.toFixed(1)})`,
        countryCode: c.countryCode,
      };
    })
    .filter((p) => p.lat !== 0 || p.lng !== 0);

  return { points, generatedAt: data.generated_at };
}

/* ─── Top-threat normalizer ────────────────────────────────────────────── */

interface CveRecentItem {
  id: string;
  severity: string;
  score: number | null;
  kev: boolean;
  published: string;
  description?: string;
}

interface CveRecentResponse {
  generated_at: string;
  cves: CveRecentItem[];
}

export function normalizeTopThreats(data: CveRecentResponse): ThreatCard[] {
  return data.cves.slice(0, 10).map((c) => ({
    id: c.id,
    title: c.id,
    severity: c.severity,
    score: c.score,
    kev: c.kev,
    source: c.kev ? 'CISA KEV' : 'NVD',
    published: c.published,
  }));
}

/* ─── Live-feed normalizer ─────────────────────────────────────────────── */

interface LiveIocItem {
  value: string;
  kind: string;
  source: string;
  observed_at?: string;
}

interface LiveIocsResponse {
  items: LiveIocItem[];
}

export function normalizeFeed(data: LiveIocsResponse): FeedItem[] {
  return data.items.slice(0, 50).map((item, i) => ({
    id: `feed-${i}-${item.value.slice(0, 20)}`,
    value: item.value,
    kind: item.kind,
    source: item.source,
    observedAt: item.observed_at,
  }));
}

/* ─── Sector normalizer ────────────────────────────────────────────────── */

interface RansomwareRecentSector {
  sector: string;
  count: number;
}

interface RansomwareRecentResponse {
  sectors: RansomwareRecentSector[];
}

export function normalizeSectors(data: RansomwareRecentResponse): SectorSlice[] {
  return (data.sectors ?? []).map((s) => ({
    label: s.sector || 'Unknown',
    value: s.count,
  }));
}
