/**
 * Category normalizers for the SOC dashboards. Upstream feeds (ransomware.live,
 * ransomfeed.it, NVD description heuristics) emit category strings in mixed
 * languages, casings, and junk tokens. These pure functions canonicalize every
 * sector / country / vendor / severity string to clean English BEFORE it becomes
 * a chart label or KPI headline. Anything unrecognized buckets to "Unknown" so
 * no foreign-language or garbage label ever leaks into the UI.
 *
 * Keep these as the single chokepoint — pages must not hand raw upstream strings
 * to charts.
 */

function clean(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** lowercase + strip accents for lookup-key matching. */
function key(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ─── Sector ───────────────────────────────────────────────────────── */

const SECTOR_MAP: Record<string, string> = {
  healthcare: 'Healthcare',
  health: 'Healthcare',
  finance: 'Finance',
  financial: 'Finance',
  government: 'Government',
  technology: 'Technology',
  tech: 'Technology',
  manufacturing: 'Manufacturing',
  education: 'Education',
  retail: 'Retail',
  energy: 'Energy',
  'professional services': 'Professional Services',
  services: 'Professional Services',
  transportation: 'Transportation',
  media: 'Media',
  construction: 'Construction',
  industry: 'Manufacturing',
  salud: 'Healthcare',
  sanidad: 'Healthcare',
  saude: 'Healthcare',
  financiero: 'Finance',
  finanzas: 'Finance',
  finanziario: 'Finance',
  gobierno: 'Government',
  governo: 'Government',
  'administracion publica': 'Government',
  'admin. publica': 'Government',
  publica: 'Government',
  tecnologia: 'Technology',
  servicios: 'Professional Services',
  servizi: 'Professional Services',
  educacion: 'Education',
  educacao: 'Education',
  istruzione: 'Education',
  construccion: 'Construction',
  costruzioni: 'Construction',
  energia: 'Energy',
  industria: 'Manufacturing',
  manifatturiero: 'Manufacturing',
  transporte: 'Transportation',
  trasporti: 'Transportation',
  comercio: 'Retail',
  'venta minorista': 'Retail',
};

const UNCLASSIFIED = new Set([
  '',
  'otros',
  'other',
  'others',
  'na',
  'n/a',
  'none',
  'varios',
  'unknown',
  'desconocido',
  'altro',
  'altri',
]);

export function normalizeSector(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (UNCLASSIFIED.has(k)) return 'Unknown';
  return SECTOR_MAP[k] ?? (s ? titleCase(s) : 'Unknown');
}

/* ─── Country ──────────────────────────────────────────────────────── */

const COUNTRY_MAP: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'estados unidos': 'United States',
  'stati uniti': 'United States',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  'reino unido': 'United Kingdom',
  'regno unito': 'United Kingdom',
  de: 'Germany',
  alemania: 'Germany',
  germania: 'Germany',
  deutschland: 'Germany',
  fr: 'France',
  francia: 'France',
  es: 'Spain',
  espana: 'Spain',
  spagna: 'Spain',
  it: 'Italy',
  italia: 'Italy',
  br: 'Brazil',
  brasil: 'Brazil',
  au: 'Australia',
  australia: 'Australia',
  ca: 'Canada',
  canada: 'Canada',
};

export function normalizeCountry(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (k === '' || k === 'desconocido' || k === 'unknown' || k === 'n/a') return 'Unknown';
  return COUNTRY_MAP[k] ?? (s ? titleCase(s) : 'Unknown');
}

/* ─── Vendor ───────────────────────────────────────────────────────── */

const VENDOR_JUNK = new Set([
  '',
  'other',
  'unknown',
  'unspecified',
  'improper',
  'missing',
  'multiple',
  'various',
  'no identificado',
  'incorrect',
  'insufficient',
]);

const VENDOR_CANON: Record<string, string> = {
  wordpress: 'WordPress',
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  linux: 'Linux',
  adobe: 'Adobe',
  cisco: 'Cisco',
  oracle: 'Oracle',
  ibm: 'IBM',
  hp: 'HP',
  github: 'GitHub',
  gitlab: 'GitLab',
};

export function normalizeVendor(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (VENDOR_JUNK.has(k)) return 'Unknown';
  return VENDOR_CANON[k] ?? s;
}

/* ─── Severity ─────────────────────────────────────────────────────── */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'CRITICAL',
  critico: 'CRITICAL',
  crit: 'CRITICAL',
  high: 'HIGH',
  alto: 'HIGH',
  alta: 'HIGH',
  medium: 'MEDIUM',
  medio: 'MEDIUM',
  media: 'MEDIUM',
  moderate: 'MEDIUM',
  low: 'LOW',
  bajo: 'LOW',
  baja: 'LOW',
};

export function normalizeSeverity(raw: string | null | undefined): Severity {
  return SEVERITY_MAP[key(clean(raw))] ?? 'UNKNOWN';
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
