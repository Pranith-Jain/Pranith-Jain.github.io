import type { KVNamespace } from '@cloudflare/workers-types';
import type { Slot } from '../types';
import { kv } from '../kv-keys';

export async function getSchedule(ns: KVNamespace): Promise<Slot[]> {
  const raw = (await ns.get(kv.scheduleUpcoming, 'json')) as Slot[] | null;
  return raw ?? [];
}

export async function setSchedule(ns: KVNamespace, slots: Slot[]): Promise<void> {
  const sorted = [...slots].sort((a, b) => a.slotAt.localeCompare(b.slotAt));
  await ns.put(kv.scheduleUpcoming, JSON.stringify(sorted));
}

export async function markSlotStatus(
  ns: KVNamespace,
  candidateId: string,
  status: Slot['status'],
  extras: Partial<Slot> = {}
): Promise<void> {
  const current = await getSchedule(ns);
  const updated = current.map((s) => (s.candidateId === candidateId ? { ...s, status, ...extras } : s));
  await setSchedule(ns, updated);
}

export async function removeSlot(ns: KVNamespace, candidateId: string): Promise<void> {
  const current = await getSchedule(ns);
  await setSchedule(
    ns,
    current.filter((s) => s.candidateId !== candidateId)
  );
}

export async function pickDueSlot(ns: KVNamespace, now: Date): Promise<Slot | null> {
  const slots = await getSchedule(ns);
  for (const s of slots) {
    if (s.status === 'pending' && new Date(s.slotAt) <= now) return s;
  }
  return null;
}
