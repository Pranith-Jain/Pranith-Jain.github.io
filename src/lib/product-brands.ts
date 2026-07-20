/**
 * Single source of truth for product codenames and surface labels.
 *
 * Rule of thumb:
 *   - Product chrome (top bar, breadcrumbs, nav, page titles): use CODE names
 *   - Marketing subtitles: CODE + role ("CRUCIBLE — DFIR toolkit")
 *   - Never invent a third name for the same surface
 */

export type ProductId = 'crucible' | 'panopticon' | 'scout' | 'argus' | 'portfolio';

export interface ProductBrand {
  id: ProductId;
  /** Short uppercase mark shown in chrome */
  code: string;
  /** One-line role for subtitles / SEO section */
  role: string;
  /** Primary home path */
  href: string;
  /** Default privacy/hosting kicker for heroes */
  kicker: string;
  /** Default DataPageLayout back label */
  backLabel: string;
  /** PageMeta `section` string */
  metaSection: string;
}

export const PRODUCTS: Record<ProductId, ProductBrand> = {
  crucible: {
    id: 'crucible',
    code: 'CRUCIBLE',
    role: 'DFIR toolkit',
    href: '/dfir',
    kicker: 'Browser-side forensics · Most tools run locally · No signup',
    backLabel: 'CRUCIBLE',
    metaSection: 'CRUCIBLE',
  },
  panopticon: {
    id: 'panopticon',
    code: 'PANOPTICON',
    role: 'Threat intel platform',
    href: '/threatintel',
    kicker: 'Live CTI · Public feeds · Edge-hosted · Free to browse',
    backLabel: 'PANOPTICON',
    metaSection: 'PANOPTICON',
  },
  scout: {
    id: 'scout',
    code: 'SCOUT',
    role: 'Recon scanner',
    href: '/radar',
    kicker: 'Domain recon · Edge-hosted scan · Free · No signup',
    backLabel: 'SCOUT',
    metaSection: 'SCOUT',
  },
  argus: {
    id: 'argus',
    code: 'ARGUS',
    role: 'Threat nexus',
    href: '/threatnexus',
    kicker: 'Nation-state CTI · Interactive maps · Curated APT data',
    backLabel: 'ARGUS',
    metaSection: 'ARGUS',
  },
  portfolio: {
    id: 'portfolio',
    code: 'Portfolio',
    role: 'Security analyst site',
    href: '/',
    kicker: 'Security analyst · Detection engineering · Open tools',
    backLabel: 'Home',
    metaSection: 'Portfolio',
  },
};

/** CVE/KEV vertical at /threat-intel — not the full PANOPTICON app. */
export const THREAT_INTEL_VERTICAL = {
  code: 'CVE & KEV Catalog',
  role: 'NVD + CISA KEV + IOC families',
  href: '/threat-intel',
  metaSection: 'CVE & KEV Catalog',
  kicker: 'Read-only threat data · NVD · CISA KEV · Sector briefs',
} as const;

export function productForPath(pathname: string): ProductBrand {
  if (pathname.startsWith('/dfir')) return PRODUCTS.crucible;
  if (pathname.startsWith('/threatintel')) return PRODUCTS.panopticon;
  if (pathname.startsWith('/radar')) return PRODUCTS.scout;
  if (pathname.startsWith('/threatnexus') || pathname.startsWith('/argus')) return PRODUCTS.argus;
  return PRODUCTS.portfolio;
}

/** Accent utility for section headers (uses existing Tailwind classes — not tokens). */
export function accentClassForPath(pathname: string): string {
  if (pathname.startsWith('/threatintel') || pathname.startsWith('/threat-intel')) {
    return 'text-rose-600 dark:text-rose-400';
  }
  return 'text-brand-600 dark:text-brand-400';
}

export function metaSectionForPath(pathname: string): string {
  if (pathname.startsWith('/threat-intel')) return THREAT_INTEL_VERTICAL.metaSection;
  return productForPath(pathname).metaSection;
}

export function kickerForPath(pathname: string): string {
  if (pathname.startsWith('/threat-intel')) return THREAT_INTEL_VERTICAL.kicker;
  return productForPath(pathname).kicker;
}

/** "CRUCIBLE — DFIR toolkit" marketing title */
export function marketingTitle(id: ProductId): string {
  const p = PRODUCTS[id];
  return `${p.code} — ${p.role}`;
}
