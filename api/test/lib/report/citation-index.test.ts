import { describe, it, expect } from 'vitest';
import { CitationIndex } from '../../../src/lib/report/citation-index';
import type { CitationEntry } from '../../../src/lib/report/types';

describe('CitationIndex', () => {
  it('assigns stable ascending refs starting at 1', () => {
    const idx = new CitationIndex();
    const a = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'CVE-2024-1709 CVSS 10.0' });
    const b = idx.ref({ sourceId: 'kev', name: 'CISA KEV', authority: 'A', fragment: 'added 2024-02-22' });
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('dedupes identical (sourceId, fragment) to the same ref', () => {
    const idx = new CitationIndex();
    const first = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'same' });
    const again = idx.ref({ sourceId: 'nvd', name: 'NVD', authority: 'A', fragment: 'same' });
    expect(again).toBe(first);
    expect(idx.entries()).toHaveLength(1);
  });

  it('returns entries in ref order', () => {
    const idx = new CitationIndex();
    idx.ref({ sourceId: 's1', name: 'S1', authority: 'C', fragment: 'x' });
    idx.ref({ sourceId: 's2', name: 'S2', authority: 'C', fragment: 'y' });
    expect(idx.entries().map((e: CitationEntry) => e.ref)).toEqual([1, 2]);
    expect(idx.entries().map((e: CitationEntry) => e.sourceId)).toEqual(['s1', 's2']);
  });
});
