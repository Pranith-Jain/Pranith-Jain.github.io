import { describe, it, expect } from 'vitest';
import { threatActors } from './threat-actors';

describe('threatActors', () => {
  it('has at least 15 actors', () => {
    expect(threatActors.length).toBeGreaterThanOrEqual(15);
  });
  it('all have unique slugs', () => {
    const slugs = threatActors.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('includes APT-ShadowByte from the homework bundle', () => {
    expect(threatActors.find((a) => a.slug === 'apt-shadowbyte')).toBeDefined();
  });
  it('includes major nation-state APTs (Sandworm, APT28, APT29, Lazarus)', () => {
    const names = threatActors.map((a) => a.name.toLowerCase());
    expect(names.some((n) => n.includes('sandworm'))).toBe(true);
    expect(names.some((n) => n.includes('apt28') || n.includes('fancy'))).toBe(true);
    expect(names.some((n) => n.includes('apt29') || n.includes('cozy'))).toBe(true);
    expect(names.some((n) => n.includes('lazarus'))).toBe(true);
  });
  it('all have valid sophistication values', () => {
    const valid = ['novice', 'intermediate', 'advanced', 'expert', 'nation-state'];
    for (const a of threatActors) expect(valid).toContain(a.sophistication);
  });
});
