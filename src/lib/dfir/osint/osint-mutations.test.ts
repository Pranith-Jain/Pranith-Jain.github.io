import { describe, it, expect } from 'vitest';
import { deleteIdentifier, deletePin, updateIdentifier, updatePin, setPosition } from './osint-mutations';
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

describe('updateIdentifier', () => {
  it('updates type and fields of the matching identifier, preserving customIconId', () => {
    const src = fixture();
    src.identifiers[0] = { ...src.identifiers[0], customIconId: 'ic1' };
    const out = updateIdentifier(src, 'i1', { type: 'twitter', fields: { handle: 'b' } });
    const i1 = out.identifiers.find((i) => i.id === 'i1')!;
    expect(i1.type).toBe('twitter');
    expect(i1.fields).toEqual({ handle: 'b' });
    expect(i1.customIconId).toBe('ic1');
    expect(out.identifiers.find((i) => i.id === 'i2')!.type).toBe('phone'); // sibling intact
  });
  it('is a no-op when the id is absent', () => {
    const out = updateIdentifier(fixture(), 'nope', { type: 'x', fields: {} });
    expect(out.identifiers.map((i) => i.type)).toEqual(['instagram', 'phone']);
  });
  it('does not mutate the input', () => {
    const src = fixture();
    updateIdentifier(src, 'i1', { type: 'twitter', fields: { handle: 'b' } });
    expect(src.identifiers[0].type).toBe('instagram');
  });
});

describe('updatePin', () => {
  it('replaces the matching pin by id, leaving others intact', () => {
    const out = updatePin(fixture(), {
      id: 'p1',
      lat: 1,
      lng: 2,
      label: 'New',
      iconKey: 'default',
      color: '#dc2626',
      note: 'n',
    });
    const p1 = out.pins.find((p) => p.id === 'p1')!;
    expect(p1.label).toBe('New');
    expect(p1.color).toBe('#dc2626');
    expect(p1.note).toBe('n');
    expect(out.pins.find((p) => p.id === 'p2')!.label).toBe('L2'); // sibling intact
  });
  it('is a no-op when the id is absent', () => {
    const out = updatePin(fixture(), { id: 'nope', lat: 0, lng: 0, label: 'x', iconKey: 'default', color: '#fff' });
    expect(out.pins.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('setPosition', () => {
  it('stores a position keyed by identifier id (immutably)', () => {
    const src = fixture();
    const out = setPosition(src, 'i1', { x: 10, y: 20 });
    expect(out.positions).toEqual({ i1: { x: 10, y: 20 } });
    expect(src.positions).toBeUndefined(); // input untouched
  });
  it('merges with existing positions', () => {
    const out = setPosition({ ...fixture(), positions: { i2: { x: 1, y: 1 } } }, 'i1', { x: 5, y: 5 });
    expect(out.positions).toEqual({ i2: { x: 1, y: 1 }, i1: { x: 5, y: 5 } });
  });
});

describe('deleteIdentifier prunes positions', () => {
  it('drops the deleted identifier from positions', () => {
    const src = { ...fixture(), positions: { i1: { x: 1, y: 2 }, i2: { x: 3, y: 4 } } };
    const out = deleteIdentifier(src, 'i1');
    expect(out.positions).toEqual({ i2: { x: 3, y: 4 } });
  });
});
