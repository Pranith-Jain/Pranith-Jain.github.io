import { describe, it, expect } from 'vitest';
import { runPlanner } from '../../../src/case-study/publishing/planner';
import type { Candidate } from '../../../src/case-study/types';

const c = (key: string): Candidate => ({
  key,
  type: 'cve',
  title: key,
  rationale: '',
  score: 0.9,
  evidence: {},
  discoveredAt: '',
  status: 'approved',
});

describe('runPlanner', () => {
  it('plans 2-3 slots in the upcoming week', async () => {
    let written: any[] = [];
    await runPlanner({
      listApproved: async () => [c('a'), c('b'), c('c'), c('d')],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date('2026-05-17T23:00:00Z'),
      random: () => 0.5,
    });
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written.length).toBeLessThanOrEqual(3);
    for (const slot of written) {
      const t = new Date(slot.slotAt);
      expect(t.getTime()).toBeGreaterThan(Date.UTC(2026, 4, 17, 23));
      expect(t.getTime()).toBeLessThan(Date.UTC(2026, 4, 24, 23));
    }
  });

  it('produces empty schedule when no approved items', async () => {
    let written: any[] | null = null;
    await runPlanner({
      listApproved: async () => [],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date(),
      random: Math.random,
    });
    expect(written).toEqual([]);
  });

  it('does not exceed approved-queue length', async () => {
    let written: any[] = [];
    await runPlanner({
      listApproved: async () => [c('only-one')],
      setSchedule: async (slots) => {
        written = slots;
      },
      now: new Date('2026-05-17T23:00:00Z'),
      random: () => 0.5,
    });
    expect(written.length).toBe(1);
  });
});
