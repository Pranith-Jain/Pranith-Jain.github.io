import type { Victim } from './discovery/ransomware';

// ransomware.live exposes a free public JSON feed of recent victim posts.
const RANSOMWARE_LIVE_URL = 'https://api.ransomware.live/v2/recentvictims';

interface RansomwareLiveEntry {
  victim: string;
  group: string;
  attackdate?: string;
  published?: string;
  discovered?: string;
  post_url?: string;
}

export async function fetchRecentVictims(fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<Victim[]> {
  try {
    const r = await fetchImpl(RANSOMWARE_LIVE_URL, {
      headers: { 'User-Agent': 'pranithjain.qzz.io case-study-discovery' },
    });
    if (!r.ok) throw new Error(`ransomware.live ${r.status}`);
    const raw = (await r.json()) as RansomwareLiveEntry[];
    return raw
      .filter((e) => e.victim && e.group)
      .map((e) => ({
        group: e.group,
        victim: e.victim,
        postedAt: (e.discovered ?? e.published ?? e.attackdate ?? new Date().toISOString()).replace(' ', 'T'),
        url: e.post_url,
      }));
  } catch (err) {
    console.warn('fetchRecentVictims failed', err);
    return [];
  }
}
