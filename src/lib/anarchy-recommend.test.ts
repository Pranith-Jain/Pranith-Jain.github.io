import { describe, expect, it } from 'vitest';
import { recommendCourses, similarCourses, type RecommendCourse } from './anarchy-recommend';

const C = (
  id: string,
  tags: string[],
  extra: Partial<RecommendCourse> = {}
): RecommendCourse => ({
  id,
  title: `Course ${id}`,
  tags,
  provider: { name: 'P', host: 'p.test' },
  difficulty: 'beginner',
  hours: 2,
  ...extra,
});

const CATALOG: RecommendCourse[] = [
  C('0001', ['aiml', 'dev'], { difficulty: 'beginner' }),
  C('0002', ['aiml'], { difficulty: 'intermediate', provider: { name: 'Q', host: 'q.test' } }),
  C('0003', ['red'], { difficulty: 'advanced', hours: 8 }),
  C('0004', ['aiml', 'dev'], { difficulty: 'intermediate' }),
  C('0005', ['blue'], { difficulty: 'beginner' }),
  C('0006', ['aiml', 'dev', 'cloud'], { difficulty: 'advanced' }),
];

describe('recommendCourses', () => {
  it('excludes saved / done / doing courses', () => {
    const recs = recommendCourses(CATALOG, { saved: ['0001'], done: ['0002'], doing: ['3'] });
    const ids = recs.map((r) => r.course.id);
    expect(ids).not.toContain('0001');
    expect(ids).not.toContain('0002');
    expect(ids).not.toContain('0003');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('ranks tag affinity above unrelated courses', () => {
    const recs = recommendCourses(CATALOG, { saved: ['0001'] });
    expect(recs[0]!.course.id).toBe('0004'); // aiml+dev, same provider
    expect(recs[0]!.reasons.length).toBeGreaterThan(0);
  });

  it('nudges one difficulty rung above completed courses', () => {
    const recs = recommendCourses(CATALOG, { done: ['0001'] }); // beginner done
    const first = recs[0]!;
    expect(first.course.difficulty).toBe('intermediate');
    expect(first.reasons.join(' ')).toMatch(/next step/i);
  });

  it('gives cold-start picks without any library', () => {
    const recs = recommendCourses(CATALOG, {});
    expect(recs.length).toBe(CATALOG.length);
    expect(recs[0]!.course.difficulty).toBe('beginner');
    expect(recs[0]!.reasons[0]).toMatch(/starting point/i);
  });

  it('honors maxHours and limit, deterministically ordered', () => {
    const a = recommendCourses(CATALOG, { saved: ['1'], maxHours: 4, limit: 2 }).map((r) => r.course.id);
    const b = recommendCourses(CATALOG, { saved: ['0001'], maxHours: 4, limit: 2 }).map((r) => r.course.id);
    expect(a).toEqual(b); // "1" normalizes to "0001"
    expect(a.length).toBeLessThanOrEqual(2);
    for (const id of a) {
      expect(CATALOG.find((c) => c.id === id)!.hours).toBeLessThanOrEqual(4);
    }
  });
});

describe('similarCourses', () => {
  it('returns tag-sharing courses, never itself', () => {
    const sims = similarCourses(CATALOG, '0001', 3);
    expect(sims.map((s) => s.course.id)).toEqual(['0004', '0006', '0002']);
    expect(sims[0]!.reasons[0]).toMatch(/shares/i);
  });

  it('returns [] for unknown ids', () => {
    expect(similarCourses(CATALOG, '9999')).toEqual([]);
    expect(similarCourses(CATALOG, 'zzz')).toEqual([]);
  });
});
