import { describe, it, expect } from 'vitest';
import { deleteIdentifier, deletePin } from './osint-mutations';
import { emptyProject, type OsintProject } from './osint-schema';

function fixture(): OsintProject {
  const p = emptyProject('Case');
  p.identifiers = [
    { id: 'i1', type: 'instagram', fields: { handle: 'a' } },
    { id: 'i2', type: 'phone', fields: { number: '123' } },
  ];
  p.pins = [
    { id: 'p1', lat: 1, lng: 2, label: 'L1', iconKey: 'default', color: '#2c3ee5' },
    { id: 'p2', lat: 3, lng: 4, label: 'L2', iconKey: 'default', color: '#16a34a' },
  ];
  p.links = [
    { id: 'l1', identifierId: 'i1', pinId: 'p1' },
    { id: 'l2', identifierId: 'i1', pinId: 'p2' },
    { id: 'l3', identifierId: 'i2', pinId: 'p1' },
  ];
  return p;
}

describe('deleteIdentifier', () => {
  it('removes the identifier and every link referencing it, leaving others intact', () => {
    const out = deleteIdentifier(fixture(), 'i1');
    expect(out.identifiers.map((i) => i.id)).toEqual(['i2']);
    expect(out.links.map((l) => l.id)).toEqual(['l3']); // only i2-p1 survives
    expect(out.pins.map((p) => p.id)).toEqual(['p1', 'p2']); // pins untouched
  });

  it('is a no-op when the id is absent', () => {
    const src = fixture();
    const out = deleteIdentifier(src, 'nope');
    expect(out.identifiers).toHaveLength(2);
    expect(out.links).toHaveLength(3);
  });

  it('does not mutate the input project', () => {
    const src = fixture();
    deleteIdentifier(src, 'i1');
    expect(src.identifiers).toHaveLength(2);
    expect(src.links).toHaveLength(3);
  });
});

describe('deletePin', () => {
  it('removes the pin and every link referencing it, leaving others intact', () => {
    const out = deletePin(fixture(), 'p1');
    expect(out.pins.map((p) => p.id)).toEqual(['p2']);
    expect(out.links.map((l) => l.id)).toEqual(['l2']); // only i1-p2 survives
    expect(out.identifiers.map((i) => i.id)).toEqual(['i1', 'i2']); // identifiers untouched
  });

  it('is a no-op when the id is absent', () => {
    const out = deletePin(fixture(), 'nope');
    expect(out.pins).toHaveLength(2);
    expect(out.links).toHaveLength(3);
  });
});
