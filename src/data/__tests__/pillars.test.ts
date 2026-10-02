import { describe, it, expect } from 'vitest';
import { HUB_META } from '../../data/threatintel-hubs';
import { HUB_META as DFIR_HUB_META } from '../../data/dfir-hubs';
import { PILLARS, HUB_PILLAR, hubKey, pillarFor, pillarOrder, type Surface } from '../../data/pillars';
import { getSidebarForSection, PAGE_TITLES } from '../../data/sidebar-nav';

/**
 * The pillar layer is presentation-only, so these tests guard the two things
 * that would actually break a visitor:
 *
 *  1. Coverage — a hub with no pillar mapping would fall back to the first
 *     band and render in the wrong place, silently.
 *  2. Containment — banding must not drop, duplicate or relabel any tool.
 */

const ALL_HUBS: Array<{ surface: Surface; id: string; label: string; paths: string[] }> = [
  ...HUB_META.map((h) => ({
    surface: 'threatintel' as const,
    id: h.id,
    label: h.label,
    paths: h.pages.map((p) => p.path),
  })),
  ...DFIR_HUB_META.map((h) => ({
    surface: 'dfir' as const,
    id: h.id,
    label: h.label,
    paths: h.pages.map((p) => p.path),
  })),
];

describe('pillar taxonomy', () => {
  it('declares a small, ordered set of pillars', () => {
    expect(PILLARS.length).toBeGreaterThanOrEqual(6);
    expect(PILLARS.length).toBeLessThanOrEqual(10);
    expect(new Set(PILLARS.map((p) => p.id)).size).toBe(PILLARS.length);
    for (const p of PILLARS) {
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it('maps every hub on both surfaces to a real pillar', () => {
    const unmapped: string[] = [];
    for (const hub of ALL_HUBS) {
      const key = hubKey(hub.surface, hub.id);
      const pillarId = HUB_PILLAR[key];
      if (!pillarId || !PILLARS.some((p) => p.id === pillarId)) unmapped.push(key);
    }
    expect(unmapped, `hubs with no pillar mapping: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('has no mapping entries that do not correspond to a real hub', () => {
    const real = new Set(ALL_HUBS.map((h) => hubKey(h.surface, h.id)));
    const stale = Object.keys(HUB_PILLAR).filter((k) => !real.has(k));
    expect(stale, `stale mappings: ${stale.join(', ')}`).toEqual([]);
  });

  it('gives every pillar at least one hub', () => {
    for (const p of PILLARS) {
      const count = ALL_HUBS.filter((h) => pillarFor(h.surface, h.id).id === p.id).length;
      expect(count, `pillar "${p.id}" has no hubs`).toBeGreaterThan(0);
    }
  });

  it('orders pillars stably and resolves an unmapped hub without throwing', () => {
    for (const h of ALL_HUBS) {
      const order = pillarOrder(h.surface, h.id);
      expect(order).toBeGreaterThanOrEqual(0);
      expect(order).toBeLessThan(PILLARS.length);
    }
    expect(pillarFor('dfir', 'no-such-hub').id).toBe(PILLARS[0]!.id);
  });

  it('keeps the two shared hub ids (malware, ai-security) in one pillar each', () => {
    for (const shared of ['malware', 'ai-security']) {
      const dfir = pillarFor('dfir', shared);
      const ti = pillarFor('threatintel', shared);
      expect(dfir.id, `${shared} diverges between surfaces`).toBe(ti.id);
    }
  });
});

describe('sidebar banding', () => {
  it('bands the threat-intel sidebar', () => {
    const cfg = getSidebarForSection('/threatintel');
    expect(cfg).not.toBeNull();
    const banded = cfg!.groups.filter((g) => g.pillar);
    expect(banded.length).toBe(HUB_META.length);
    // A band label is printed once, on the first group of each pillar.
    const heads = cfg!.groups.filter((g) => g.pillar && g.pillarBlurb);
    expect(heads.length).toBe(new Set(banded.map((g) => g.pillar)).size);
  });

  it('bands the DFIR sidebar', () => {
    const cfg = getSidebarForSection('/dfir');
    expect(cfg).not.toBeNull();
    const banded = cfg!.groups.filter((g) => g.pillar);
    // +1 because buildDfirSidebar prepends a Home item into the first group.
    expect(banded.length).toBe(DFIR_HUB_META.length);
    const heads = cfg!.groups.filter((g) => g.pillar && g.pillarBlurb);
    expect(heads.length).toBe(new Set(banded.map((g) => g.pillar)).size);
  });

  it('emits each hub label exactly once per surface', () => {
    for (const [prefix, hubs] of [
      ['/threatintel', HUB_META],
      ['/dfir', DFIR_HUB_META],
    ] as const) {
      const titles = getSidebarForSection(prefix)!.groups.map((g) => g.title);
      for (const hub of hubs) {
        expect(titles.filter((t) => t === hub.label).length, `${prefix}: ${hub.label}`).toBe(1);
      }
    }
  });

  it('loses no tool: every hub page still appears in the sidebar', () => {
    for (const [prefix, hubs] of [
      ['/threatintel', HUB_META],
      ['/dfir', DFIR_HUB_META],
    ] as const) {
      const hrefs = new Set(getSidebarForSection(prefix)!.groups.flatMap((g) => g.items.map((i) => i.href)));
      for (const hub of hubs) {
        for (const p of hub.pages) {
          expect(hrefs.has(p.path), `${prefix}: lost ${p.path}`).toBe(true);
        }
      }
    }
  });

  it('groups hubs of the same pillar adjacently in pillar order', () => {
    for (const prefix of ['/threatintel', '/dfir'] as const) {
      const seen: string[] = [];
      for (const g of getSidebarForSection(prefix)!.groups) {
        if (!g.pillar) continue;
        if (seen[seen.length - 1] !== g.pillar) seen.push(g.pillar);
      }
      expect(new Set(seen).size, `${prefix}: a pillar appears in two bands`).toBe(seen.length);
      const expected = PILLARS.filter((p) => seen.includes(p.label)).map((p) => p.label);
      expect(seen, `${prefix}: bands out of pillar order`).toEqual(expected);
    }
  });

  it('keeps PAGE_TITLES covering every hub page (banding must not drop titles)', () => {
    for (const hubs of [HUB_META, DFIR_HUB_META]) {
      for (const hub of hubs) {
        for (const p of hub.pages) {
          expect(PAGE_TITLES[p.path], `missing title for ${p.path}`).toBe(p.label);
        }
      }
    }
  });
});
