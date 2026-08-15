import { describe, it, expect, beforeEach } from 'vitest';
import { getSchedule, setSchedule, markSlotStatus, pickDueSlot } from '../../../src/case-study/storage/schedule';
import type { Slot } from '../../../src/case-study/types';

function mockKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: 'json') {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const slots: Slot[] = [
  { slotAt: '2026-05-19T14:23:00Z', candidateId: 'cve-2026-1234', status: 'pending' },
  { slotAt: '2026-05-21T11:07:00Z', candidateId: 'actor-fin7', status: 'pending' },
];

describe('schedule storage', () => {
  beforeEach(async () => {
    // The schedule is mirrored into caches.default (slot
    // https://schedule-cache.internal/v1) and read BEFORE KV, so a slot
    // written by a previous test in the same pool would shadow the fresh
    // per-test KV store. Delete the single slot by URL. (Enumerating keys
    // is avoided — cache.keys() does not resolve in this pool.)
    try {
      const cache = (caches as unknown as { default: Cache }).default;
      await cache.delete('https://schedule-cache.internal/v1');
    } catch {
      /* best-effort */
    }
  });

  it('round-trips schedule', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    expect(await getSchedule(ns)).toEqual(slots);
  });

  it('empty schedule by default', async () => {
    const ns = mockKV() as any;
    expect(await getSchedule(ns)).toEqual([]);
  });

  it('markSlotStatus mutates by candidateId', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    await markSlotStatus(ns, 'cve-2026-1234', 'publishing');
    const updated = await getSchedule(ns);
    expect(updated[0]!.status).toBe('publishing');
  });

  it('pickDueSlot returns earliest pending slot at or before now', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    const due = await pickDueSlot(ns, new Date('2026-05-20T00:00:00Z'));
    expect(due?.candidateId).toBe('cve-2026-1234');
  });

  it('pickDueSlot returns null if nothing is due', async () => {
    const ns = mockKV() as any;
    await setSchedule(ns, slots);
    const due = await pickDueSlot(ns, new Date('2026-05-15T00:00:00Z'));
    expect(due).toBeNull();
  });
});
