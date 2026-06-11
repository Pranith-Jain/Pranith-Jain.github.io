import type { Sev } from './types';

/* ─── Cache reader ──────────────────────────────────────────────────────── */

export async function readKvJson<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  try {
    if (!kv) return null;
    const val = await kv.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

/* ─── Spread static data timestamps across last N hours ────────────── */
export function hoursAgo(maxHours = 24): string {
  return new Date(Date.now() - Math.random() * maxHours * 3600000).toISOString();
}

export const asSev = (s: string | undefined, fallback: Sev = 'medium'): Sev =>
  ['critical', 'high', 'medium', 'low'].includes(s ?? '') ? (s as Sev) : fallback;
