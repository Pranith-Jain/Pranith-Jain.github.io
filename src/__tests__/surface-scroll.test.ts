/**
 * Portfolio-only smooth scrolling.
 *
 * The behaviour under test is CSS, but two things about it are JS-owned and
 * can silently break:
 *
 *   1. `data-surface` on <html> — the anchor offset is scoped to
 *      `html[data-surface='portfolio']`. If the attribute is missing, every
 *      in-page anchor lands underneath the sticky header.
 *   2. The prerender stamp — both prerender trees must carry the right value
 *      or first paint disagrees with the hydrated DOM (and the tools tree
 *      would claim the portfolio's offset).
 *
 * These assert the wiring. The rendered contrast ratios are asserted in
 * `token-contrast.test.ts`; the scroll geometry itself is asserted by parsing
 * `index.css`, since jsdom does not implement smooth scrolling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applySurfaceAttribute } from '../lib/apply-surface';
import { TOOL_HOSTS } from '../lib/surface';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function setHostname(host: string) {
  // jsdom lets host be reassigned on the location object.
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: { ...window.location, hostname: host },
  });
}

describe('applySurfaceAttribute', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-surface');
    setHostname('pranithjain.qzz.io');
  });

  it('tags a normal host as the portfolio surface', () => {
    applySurfaceAttribute();
    expect(document.documentElement.dataset.surface).toBe('portfolio');
  });

  it('tags a tools host as the tools surface', () => {
    setHostname(TOOL_HOSTS[0]!);
    applySurfaceAttribute();
    expect(document.documentElement.dataset.surface).toBe('tools');
  });

  it('is case-insensitive about the hostname', () => {
    setHostname(TOOL_HOSTS[0]!.toUpperCase());
    applySurfaceAttribute();
    expect(document.documentElement.dataset.surface).toBe('tools');
  });

  it('covers every configured tools host', () => {
    for (const host of TOOL_HOSTS) {
      setHostname(host);
      applySurfaceAttribute();
      expect(document.documentElement.dataset.surface, `host ${host}`).toBe('tools');
    }
  });

  it('treats localhost (dev) as the portfolio surface', () => {
    setHostname('localhost');
    applySurfaceAttribute();
    expect(document.documentElement.dataset.surface).toBe('portfolio');
  });

  it('is idempotent and does not clobber the theme class', () => {
    document.documentElement.classList.add('dark');
    applySurfaceAttribute();
    applySurfaceAttribute();
    expect(document.documentElement.dataset.surface).toBe('portfolio');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('leaves index.html free of a hardcoded surface (set at runtime)', () => {
    const shell = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    // If this were hardcoded to portfolio the tools hosts would inherit it.
    expect(shell).not.toContain('data-surface=');
  });
});

describe('index.css scroll wiring', () => {
  it('keeps smooth scrolling globally', () => {
    // Deliberately not surface-scoped: UA-level behaviour with no per-element
    // cost, and the tools surface already depends on it.
    expect(css).toContain('scroll-behavior: smooth');
  });

  it('routes the anchor offset through a CSS variable on html', () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*var\(--scroll-anchor-offset/);
  });

  it('scopes the offset value to the portfolio surface only', () => {
    const scoped = css.match(/html\[data-surface='portfolio'\]\s*\{[^}]*--scroll-anchor-offset/g);
    expect(scoped, 'expected at least one portfolio-scoped offset').not.toBeNull();
    expect(css).not.toMatch(/html\[data-surface='tools'\][^{]*\{[^}]*--scroll-anchor-offset/);
  });

  it('reverts smooth scrolling under prefers-reduced-motion', () => {
    // The global reduced-motion block zeroes animation/transition but says
    // nothing about scrolling, so without this a visitor who asks for reduced
    // motion still gets animated scroll jumps on anchors.
    const block = /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/.exec(css);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/html\s*\{[^}]*scroll-behavior:\s*auto\s*!important/);
  });
});

describe('prerender stamps the surface onto both trees', () => {
  const prerender = readFileSync(resolve(process.cwd(), 'scripts/prerender.mjs'), 'utf8');

  it('injects data-surface into the <html> tag', () => {
    // `$1` re-inserts the captured existing attributes (lang, id) so the stamp
    // adds to the tag rather than replacing it.
    expect(prerender).toMatch(/\.replace\(\/\<html\(\[\^\>\]\*\)\>\/, `<html\$1 data-surface="\$\{surface\}">`\)/);
  });

  it('runs both surfaces so each tree gets its own value', () => {
    expect(prerender).toContain("runPass(ROUTES, 'portfolio'");
    expect(prerender).toContain("runPass(toolsRoutes, 'tools'");
  });
});
