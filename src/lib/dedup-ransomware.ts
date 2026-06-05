/**
 * Dedup ransomware victims for front-end counting surfaces.
 *
 * The upstream worker merge in api/src/routes/ransomware-recent.ts collapses
 * same-day (group, victim) dupes per fetcher, but the same victim can still
 * appear on multiple days when different trackers index it 1-3 days apart.
 * For any "this group made N claims" surface each unique victim should count
 * once, so we collapse across days too — keep the EARLIEST discovery date.
 *
 * Used by:
 *   - src/components/threatintel/LivePulse.tsx   (computeRansom)
 *   - src/components/threatintel/TodaysRead.tsx  (weeklyRansomwareLine)
 *   - src/components/LiveSignalStrip.tsx         (24h tile)
 *   - src/components/HeroLiveSparkline.tsx       (7d sparkline)
 *   - src/pages/threatintel/Metrics.tsx          (already inlined there)
 *
 * Keep the key shape and Date.parse fallback behaviour identical across
 * callers so a victim counted on one surface counts on all of them.
 */
export interface DedupRansomwareVictim {
  group: string;
  /** Optional — some upstream shapes don't carry a victim name. */
  victim?: string;
  /** ISO timestamp of upstream discovery. */
  discovered: string;
}

export function dedupRansomwareVictims(victims: DedupRansomwareVictim[]): DedupRansomwareVictim[] {
  const byKey = new Map<string, DedupRansomwareVictim>();
  for (const v of victims ?? []) {
    if (!v?.group) continue;
    const victim = v.victim?.toLowerCase() ?? '';
    if (!victim) continue;
    const key = `${v.group.toLowerCase()}|${victim}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, v);
      continue;
    }
    const prevT = Date.parse(prev.discovered ?? '');
    const curT = Date.parse(v.discovered ?? '');
    if (!Number.isNaN(curT) && (Number.isNaN(prevT) || curT < prevT)) {
      byKey.set(key, v);
    }
  }
  return [...byKey.values()];
}
