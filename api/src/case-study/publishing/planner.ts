import type { Candidate, Slot } from '../types';

export interface RunPlannerDeps {
  listApproved: () => Promise<Candidate[]>;
  setSchedule: (slots: Slot[]) => Promise<void>;
  now: Date;
  random: () => number;
}

const WEEKDAY_WEIGHTS: Array<{ dayOffset: number; weight: number }> = [
  { dayOffset: 1, weight: 2 },
  { dayOffset: 2, weight: 4 },
  { dayOffset: 3, weight: 4 },
  { dayOffset: 4, weight: 4 },
  { dayOffset: 5, weight: 2 },
  { dayOffset: 6, weight: 1 },
  { dayOffset: 7, weight: 1 },
];

function pickWeightedDistinct(rand: () => number, n: number): number[] {
  const pool = [...WEEKDAY_WEIGHTS];
  const picked: number[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, x) => s + x.weight, 0);
    let r = rand() * totalWeight;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx]!.weight;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    picked.push(pool[idx]!.dayOffset);
    pool.splice(idx, 1);
  }
  return picked.sort((a, b) => a - b);
}

export async function runPlanner(deps: RunPlannerDeps): Promise<{ scheduled: number }> {
  const approved = await deps.listApproved();
  if (approved.length === 0) {
    await deps.setSchedule([]);
    console.log(JSON.stringify({ job: 'planner', scheduled: 0, ts: deps.now.toISOString() }));
    return { scheduled: 0 };
  }

  const targetN = Math.min(approved.length, 2 + Math.floor(deps.random() * 2));
  const dayOffsets = pickWeightedDistinct(deps.random, targetN);
  const baseDay = new Date(
    Date.UTC(deps.now.getUTCFullYear(), deps.now.getUTCMonth(), deps.now.getUTCDate(), 0, 0, 0, 0)
  );

  const fifo = approved.slice(0, targetN);
  const slots: Slot[] = dayOffsets.map((off, i) => {
    const hour = 9 + Math.floor(deps.random() * 9);
    const minute = Math.floor(deps.random() * 60);
    const t = new Date(baseDay.getTime() + off * 24 * 3600 * 1000);
    t.setUTCHours(hour, minute, 0, 0);
    return { slotAt: t.toISOString(), candidateId: fifo[i]!.key, status: 'pending' };
  });

  await deps.setSchedule(slots);
  console.log(
    JSON.stringify({
      job: 'planner',
      scheduled: slots.length,
      ids: slots.map((s) => s.candidateId),
      ts: deps.now.toISOString(),
    })
  );
  return { scheduled: slots.length };
}
