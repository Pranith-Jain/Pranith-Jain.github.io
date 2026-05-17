import type { Victim } from './discovery/ransomware';

// Ransomlook.io exposes a free public JSON feed of recent ransomware victim claims (no auth).
const RANSOMLOOK_URL = 'https://www.ransomlook.io/api/recent';

interface RansomlookEntry {
  post_title: string;
  group_name: string;
  discovered: string;
  link?: string | null;
}

export async function fetchRecentVictims(fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<Victim[]> {
  try {
    const r = await fetchImpl(RANSOMLOOK_URL, {
      headers: { 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`ransomlook.io ${r.status}`);
    const raw = (await r.json()) as RansomlookEntry[];
    return raw
      .filter((e) => e.post_title && e.group_name)
      .map((e) => ({
        group: e.group_name,
        victim: e.post_title,
        postedAt: e.discovered.replace(' ', 'T'),
        url: e.link ? `https://www.ransomlook.io${e.link.startsWith('/') ? '' : '/'}${e.link}` : undefined,
      }));
  } catch (err) {
    console.warn('fetchRecentVictims failed', err);
    return [];
  }
}
