// Small utilities used by views.

import type { Actor, FeedItem } from '../types';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - d) / 86400000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Spotlight ⌘K search across actors + their malware + CVEs + TTPs.
export interface SearchHit {
  type: 'actor' | 'malware' | 'cve' | 'ttp' | 'campaign';
  id: string;
  label: string;
  sub: string;
  actorId?: string;
}

export function searchAll(q: string, actors: Actor[]): SearchHit[] {
  if (!q || q.length < 2) return [];
  const ql = q.toLowerCase();
  const out: SearchHit[] = [];

  for (const a of actors) {
    if (a.name.toLowerCase().includes(ql))         out.push({ type: 'actor', id: a.id, label: a.name, sub: a.aka.join(' · '), actorId: a.id });
    if (a.apt?.toLowerCase().includes(ql))         out.push({ type: 'actor', id: a.id, label: a.apt!,  sub: a.name, actorId: a.id });
    if (a.aka.some(k => k.toLowerCase().includes(ql))) {
      if (!out.find(x => x.type === 'actor' && x.id === a.id)) {
        out.push({ type: 'actor', id: a.id, label: a.name, sub: a.aka.join(' · '), actorId: a.id });
      }
    }
    for (const m of a.malware) {
      if (m.name.toLowerCase().includes(ql)) out.push({ type: 'malware', id: `${a.id}/${m.name}`, label: m.name, sub: `${m.type} · ${m.platform}`, actorId: a.id });
    }
    for (const c of a.cves) {
      if (c.id.toLowerCase().includes(ql)) out.push({ type: 'cve', id: c.id, label: c.id, sub: `${c.product} · CVSS ${c.cvss}`, actorId: a.id });
    }
    for (const t of a.ttps) {
      if (t.id.toLowerCase().includes(ql) || t.name.toLowerCase().includes(ql)) {
        out.push({ type: 'ttp', id: `${a.id}/${t.id}`, label: `${t.id} — ${t.name}`, sub: t.tactic, actorId: a.id });
      }
    }
    for (const c of a.campaigns) {
      if (c.name.toLowerCase().includes(ql)) out.push({ type: 'campaign', id: `${a.id}/${c.name}`, label: c.name, sub: c.summary.slice(0, 90), actorId: a.id });
    }
  }

  return out.slice(0, 30);
}

export function groupFeed(items: FeedItem[]) {
  const out: Record<string, FeedItem[]> = {};
  for (const item of items) {
    const day = item.published.slice(0, 10);
    (out[day] ??= []).push(item);
  }
  return Object.entries(out).sort(([a], [b]) => (a < b ? 1 : -1));
}

export function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
