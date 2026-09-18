/**
 * Tests for the Anarchy recommend/similar wrappers (filter helpers are
 * covered implicitly by the shared scorer suite in
 * src/lib/anarchy-recommend.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  recommendAnarchyCourses,
  similarAnarchyCourses,
  type AnarchyCourseSlim,
  type AnarchyIndex,
} from './anarchy-manifest';

const C = (
  id: string,
  tags: string[],
  extra: Partial<AnarchyCourseSlim> = {}
): AnarchyCourseSlim => ({
  id,
  title: `Course ${id}`,
  href: 'https://p.test/',
  img: null,
  tags,
  provider: { name: 'P', host: 'p.test', icon: '🔗' },
  difficulty: 'beginner',
  hours: 2,
  preview: `preview ${id}`,
  sizeBytes: 10,
  ...extra,
});

const IDX = {
  source: 'kazamadono.github.io',
  url: 'https://kazamadono.github.io/',
  coursesUrl: 'https://kazamadono.github.io/courses.json',
  description: 'test',
  license: 'test',
  author: 'KazamaDono',
  authorUrl: 'https://github.com/KazamaDono',
  syncedAt: '2026-09-18T00:00:00.000Z',
  builtAt: '2026-09-18T00:00:00.000Z',
  counts: { courses: 4, categories: 3 },
  topProviders: [{ name: 'P', count: 4 }],
  prereqGraph: {},
  categories: [
    { tag: 'aiml', count: 3 },
    { tag: 'dev', count: 2 },
    { tag: 'blue', count: 1 },
  ],
  topTags: [{ tag: 'aiml', count: 3 }],
  courses: [
    C('0001', ['aiml', 'dev']),
    C('0002', ['aiml'], { difficulty: 'intermediate' }),
    C('0003', ['blue']),
    C('0004', ['aiml', 'dev'], { difficulty: 'intermediate', hours: 4 }),
  ],
} as AnarchyIndex;

describe('recommendAnarchyCourses', () => {
  it('excludes library courses and ranks tag matches first', () => {
    const recs = recommendAnarchyCourses(IDX, { saved: ['0001'] });
    expect(recs.map((r) => r.course.id)).toEqual(['0004', '0002', '0003']);
    expect(recs[0]!.score).toBeGreaterThan(recs[1]!.score);
    expect(recs[0]!.reasons.length).toBeGreaterThan(0);
  });

  it('respects maxHours and limit', () => {
    const recs = recommendAnarchyCourses(IDX, { maxHours: 2, limit: 1 });
    expect(recs.length).toBe(1);
    expect(recs[0]!.course.hours).toBeLessThanOrEqual(2);
  });
});

describe('similarAnarchyCourses', () => {
  it('finds tag-sharing courses, never the course itself', () => {
    const sims = similarAnarchyCourses(IDX, '0001', 10);
    // 0004 (2 shared tags) > 0002 (1 shared tag) > 0003 (same provider only)
    expect(sims.map((s) => s.course.id)).toEqual(['0004', '0002', '0003']);
  });

  it('returns [] for unknown ids', () => {
    expect(similarAnarchyCourses(IDX, '9999')).toEqual([]);
  });
});
