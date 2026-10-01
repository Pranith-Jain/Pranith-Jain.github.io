/**
 * Per-host tools nav.
 *
 * The bug: every tools host shared one nav array, so `scout.` advertised
 * PANOPTICON's eight-page threat-intel dropdown while rendering the recon
 * scanner. Nav and landing disagreed about which product you were on.
 *
 * Two invariants are asserted here, and the second is the one that is easy to
 * regress:
 *
 *  1. A host's nav promotes only its OWN product as a top-level item.
 *  2. Every cross-host link is ABSOLUTE and points at the owning host.
 *
 * (2) matters because all tools hosts serve the same route table. A relative
 * `/threatintel` in SCOUT's nav is not "a link to PANOPTICON" — it is a
 * request that renders the threat-intel pages under SCOUT's chrome, which
 * looks like a broken SCOUT sub-page rather than a navigation.
 */

import { describe, it, expect } from 'vitest';
import { TOOLS_NAV_BY_HOST, toolsNavLinks, type NavLinkExt } from '../content';
import { TOOL_HOSTS_BY_PATH } from '../../lib/surface';

const HOSTS = Object.keys(TOOL_HOSTS_BY_PATH).map((p) => TOOL_HOSTS_BY_PATH[p]!);
/**
 * What a host's own top-level nav item points at.
 *
 * The four AREA hosts link to their apex path (`/dfir`, `/threatintel`, ...)
 * because their `/` and their apex path render the same component. The three
 * SINGLE-PAGE hosts link to `/`, because there `/` IS that tool - `SurfaceHome`
 * renders the Agent Suite / Copilot / Briefings landing for them. Using the
 * apex path there would be redundant and, for agent/copilot, would also name
 * a path whose canonical owner is a different host.
 */
const SELF_HREF: Record<string, string> = {
  crucible: '/dfir',
  panopticon: '/threatintel',
  scout: '/radar',
  argus: '/argus',
  agent: '/',
  copilot: '/',
  brief: '/',
};

function switcher(nav: NavLinkExt[]): NavLinkExt | undefined {
  return nav.find((l) => l.label === 'Other tools');
}

describe('TOOLS_NAV_BY_HOST', () => {
  it('has an entry for every configured tools host', () => {
    for (const host of HOSTS) {
      expect(TOOLS_NAV_BY_HOST[host], `no nav for ${host}`).toBeDefined();
    }
    expect(Object.keys(TOOLS_NAV_BY_HOST).sort()).toEqual([...HOSTS].sort());
  });

  it('keeps only the owning product as a top-level item (others go in the switcher)', () => {
    for (const [host, nav] of Object.entries(TOOLS_NAV_BY_HOST)) {
      const self = SELF_HREF[host.split('.')[0]!];
      const topLevel = nav.filter((l) => l.label !== 'Home' && l.label !== 'Other tools' && !l.cta);
      const labels = topLevel.map((l) => l.label);

      expect(labels, `${host} top-level items`).toHaveLength(1);
      // The single top-level item must be the host's own product.
      expect(topLevel[0]!.href, `${host} points at the wrong product`).toBe(self);

      // PANOPTICON / CRUCIBLE must NOT be top-level anywhere except their own host.
      if (host !== 'panopticon.pranithjain.qzz.io') {
        expect(labels, `${host} must not promote PANOPTICON`).not.toContain('PANOPTICON');
      }
      if (host !== 'crucible.pranithjain.qzz.io') {
        expect(labels, `${host} must not promote CRUCIBLE`).not.toContain('CRUCIBLE');
      }
    }
  });

  it('lists every other product in the cross-host switcher', () => {
    for (const [host, nav] of Object.entries(TOOLS_NAV_BY_HOST)) {
      const sw = switcher(nav);
      expect(sw, `${host} has no "Other tools" switcher`).toBeDefined();
      const labels = (sw!.children ?? []).map((c) => c.label);
      // 7 hosts, this one excluded.
      expect(labels.length, `${host} switcher should list the other 6`).toBe(6);
      expect(labels, `${host} lists itself`).not.toContain(
        TOOLS_NAV_BY_HOST[host]!.find((l) => l.href === SELF_HREF[host.split('.')[0]!])!.label
      );
    }
  });

  it('makes every switcher link absolute and pointing at another host root', () => {
    for (const [host, nav] of Object.entries(TOOLS_NAV_BY_HOST)) {
      for (const link of switcher(nav)?.children ?? []) {
        expect(link.href, `${host} -> ${link.label} must be absolute`).toMatch(/^https:\/\//);

        const url = new URL(link.href);
        // Each link lands on the TARGET host's root, which is where that host
        // renders its own product (see SurfaceHome). It must not stay on the
        // current host, or it would be a dead-looking self-link.
        expect(url.hostname, `${link.href} should name a host`).toBeTruthy();
        expect(url.hostname, `${link.href} must not point back at ${host}`).not.toBe(host);
        expect(url.pathname, `${link.href} should land on the target root`).toBe('/');
      }
    }
  });

  it('switcher covers every host except the current one', () => {
    for (const [host, nav] of Object.entries(TOOLS_NAV_BY_HOST)) {
      const targets = (switcher(nav)?.children ?? []).map((c) => new URL(c.href).hostname);
      for (const other of HOSTS) {
        if (other === host) continue;
        expect(targets, `${host} switcher missing ${other}`).toContain(other);
      }
    }
  });

  it("keeps the host's own nav link relative (it is the same host)", () => {
    for (const [host, nav] of Object.entries(TOOLS_NAV_BY_HOST)) {
      const own = nav.find((l) => l.href === SELF_HREF[host.split('.')[0]!]);
      expect(own, `${host} own link`).toBeDefined();
      expect(own!.href).toMatch(/^\//);
    }
  });

  it('falls back to an all-tools nav that still reaches every product', () => {
    const labels = toolsNavLinks.map((l) => l.label);
    for (const want of ['PANOPTICON', 'CRUCIBLE', 'SCOUT', 'ARGUS', 'Agent', 'Copilot', 'Daily Briefs']) {
      expect(labels, `fallback nav missing ${want}`).toContain(want);
    }
    expect(labels).toContain('Portfolio');
  });
});
