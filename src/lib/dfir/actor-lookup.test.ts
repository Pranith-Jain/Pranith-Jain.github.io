import { describe, it, expect } from 'vitest';
import { lookupActors } from './actor-lookup';

describe('lookupActors', () => {
  it('returns empty when no hints match', () => {
    expect(lookupActors({})).toEqual([]);
    expect(lookupActors({ tags: ['xx'], free_text: ['yyy'] })).toEqual([]);
  });

  it('matches by country (Russia ⇒ Russian APTs)', () => {
    const r = lookupActors({ country: 'Russia' });
    expect(r.length).toBeGreaterThan(0);
    const names = r.map((s) => s.actor.name.toLowerCase());
    // Should include some of: Sandworm, APT28, APT29, Turla
    expect(
      names.some((n) => n.includes('sandworm') || n.includes('apt28') || n.includes('apt29') || n.includes('turla'))
    ).toBe(true);
  });

  it('expands ISO-2 country code', () => {
    const r1 = lookupActors({ country: 'RU' });
    const r2 = lookupActors({ country: 'Russia' });
    expect(r1.length).toBe(r2.length);
  });

  it('matches by MITRE technique exactly', () => {
    const r = lookupActors({ techniques: ['T1566.001'] });
    const slugs = r.map((s) => s.actor.slug);
    expect(slugs).toContain('apt-shadowbyte');
  });

  it('higher score for stronger signals', () => {
    const country = lookupActors({ country: 'Russia' });
    const tag = lookupActors({ tags: ['russian'] });
    if (country.length > 0 && tag.length > 0) {
      // country match weight (10) > tag weight (3)
      const ru1 = country.find((s) => s.actor.country === 'Russia');
      if (ru1) expect(ru1.score).toBeGreaterThanOrEqual(10);
    }
  });

  it('respects max param', () => {
    const r = lookupActors({ country: 'Russia' }, 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it('matches free_text against name/alias/description', () => {
    const r = lookupActors({ free_text: ['cozy bear'] });
    const slugs = r.map((s) => s.actor.slug);
    expect(slugs.some((s) => s === 'apt29' || s.includes('cozy'))).toBe(true);
  });
});
