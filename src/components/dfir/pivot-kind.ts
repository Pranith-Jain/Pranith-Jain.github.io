/**
 * Pivot helper — shared regexes and detection logic for the PivotBar search
 * input. Lives in its own file (not in PivotBar.tsx) so that React Fast Refresh
 * can hot-reload component edits without re-evaluating the helpers, and so the
 * eslint `react-refresh/only-export-components` rule is satisfied.
 */

export type PivotKind = 'ip' | 'domain' | 'unknown';

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function detectKind(value: string): PivotKind {
  const v = value.trim();
  if (IPV4_RE.test(v)) return 'ip';
  if (DOMAIN_RE.test(v)) return 'domain';
  return 'unknown';
}

export const ROUTE_FOR: Record<Exclude<PivotKind, 'unknown'>, (v: string) => string> = {
  ip: (v) => `/dfir/host?ip=${encodeURIComponent(v)}`,
  domain: (v) => `/dfir/domain?domain=${encodeURIComponent(v)}`,
};
