export interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  /** Heuristic sector classification - see api/src/lib/sector-classifier.ts. */
  sector?: string;
}

export interface RecentCve {
  id: string;
  published: string;
  modified: string;
  description?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
  score: number | null;
  kev: boolean;
  kev_added?: string;
}

export interface PhishingUrl {
  url: string;
  source: 'openphish' | 'phishtank';
  target?: string;
  verified?: boolean;
}

export interface ThreatMapResponse {
  generated_at: string;
  total_ips: number;
  countries: { country: string; countryCode: string; count: number }[];
  source_counts: Record<string, number>;
}

export interface MalwareSample {
  sha256: string;
  signature?: string;
  tags?: string[];
  file_type?: string;
  first_seen?: string;
}

export interface ReleakRow {
  key: string;
  group_count: number;
  raw_names: string[];
  claims: { group: string; raw_victim: string; discovered: string }[];
}

export interface C2Response {
  generated_at: string;
  count: number;
  sources: { id: string; name: string; count: number }[];
  frameworks: Record<string, number>;
}

export interface BreachDisclosure {
  name: string;
  title: string;
  pwn_count?: number;
  added_date?: string;
  breach_date?: string;
}

export interface PulseEntity {
  label: string;
  kind: 'cve' | 'actor' | 'technique' | 'malware';
  source_count: number;
  sources: string[];
}

export interface DeepDarkCtiResponse {
  generated_at: string;
  categories: { id: string; label: string; count: number }[];
  total: number;
}

// Canonical severity colour ramp. Mirrors src/components/Badge.tsx
// SEVERITY_TONE - kept as raw hex here because these feed inline SVG fills.
// `low` is slate (not emerald): a low-severity CVE is still a CVE and green
// reads as "safe/done", inconsistent with the severity meaning.
export const SEVERITY_COLORS: Record<RecentCve['severity'], string> = {
  CRITICAL: '#e11d48', // rose-600
  HIGH: '#f97316', // orange-500
  MEDIUM: '#f59e0b', // amber-500
  LOW: '#94a3b8', // slate-400
  NONE: '#cbd5e1', // slate-300
  UNKNOWN: '#64748b', // slate-500
};

export function ago(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Date.now() - t;
}

export function withinDays(iso: string, n: number): boolean {
  return ago(iso) <= n * 86400_000;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/* ─── SVG chart primitives ──────────────────────────────────────────── */

