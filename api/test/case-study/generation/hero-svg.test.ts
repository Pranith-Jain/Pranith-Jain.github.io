import { describe, it, expect } from 'vitest';
import { renderHeroSvg } from '../../../src/case-study/generation/hero-svg';

describe('renderHeroSvg', () => {
  it('returns a valid SVG containing the title and type chip', () => {
    const svg = renderHeroSvg({ title: 'CVE-2026-1234 — Fortinet', type: 'cve' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('CVE');
    expect(svg).toContain('CVE-2026-1234');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it('escapes XML special characters in titles', () => {
    const svg = renderHeroSvg({ title: 'Lumma & Co. <evil>', type: 'malware' });
    expect(svg).toContain('Lumma &amp; Co. &lt;evil&gt;');
  });
});
