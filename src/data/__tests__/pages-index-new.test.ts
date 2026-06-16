import { describe, it, expect } from 'vitest';
import { searchPages, hasPageMatch } from '../pages-index';

describe('new pages in catalog', () => {
  it.each([
    ['/dfir/x-verdikt', 'x-verdikt'],
    ['/dfir/dnscope', 'dnscope'],
    ['/dfir/attmap-ai', 'attmap-ai'],
    ['/dfir/tracerules', 'tracerules'],
    ['/dfir/regscope', 'regscope'],
    ['/threatintel/extremists', 'extremists'],
    ['/threatintel/predators', 'predators'],
  ])('has catalog entry for %s', (path, query) => {
    const matches = searchPages(query, { limit: 5 });
    const found = matches.some((m) => m.page.path === path);
    expect(found, `Path ${path} should be found via search for "${query}"`).toBe(true);
  });

  it('extremism query finds the Extremism Monitoring page', () => {
    expect(hasPageMatch('extremism')).toBe(true);
  });

  it('predator query finds the Predator Monitoring page', () => {
    expect(hasPageMatch('predator')).toBe(true);
  });

  it('registry query finds REGSCOPE', () => {
    const matches = searchPages('registry');
    expect(matches.some((m) => m.page.path === '/dfir/regscope')).toBe(true);
  });

  it('mitre query finds ATTMAP-AI', () => {
    const matches = searchPages('mitre');
    expect(matches.some((m) => m.page.path === '/dfir/attmap-ai')).toBe(true);
  });
});
