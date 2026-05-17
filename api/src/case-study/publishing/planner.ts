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

  // Topic diversity: never schedule the same case-study type twice in a week
  // while a different type is available. Walk approved highest-score first,
  // taking one of each unseen type. If we still need more, fill with the
  // next-highest remaining regardless of type. This is what stops the queue
  // publishing "ransom" every day when cve/actor/breach candidates exist.
  const byScore = [...approved].sort((a, b) => b.score - a.score);
  const seenTypes = new Set<string>();
  const diverse: Candidate[] = [];
  for (const cand of byScore) {
    if (diverse.length >= targetN) break;
    if (seenTypes.has(cand.type)) continue;
    seenTypes.add(cand.type);
    diverse.push(cand);
  }
  for (const cand of byScore) {
    if (diverse.length >= targetN) break;
    if (!diverse.includes(cand)) diverse.push(cand);
  }
  const fifo = diverse;
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
