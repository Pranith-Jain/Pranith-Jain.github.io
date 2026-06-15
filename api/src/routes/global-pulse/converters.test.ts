// api/src/routes/global-pulse/converters.test.ts
//
// Unit tests for the pure converter functions. The geo / hand
// shelling around the converters is exercised by integration; here
// we just check the heuristic logic.

import { describe, it, expect } from 'vitest';
import { fromFirms, fromUkmto } from './converters';
import type { FirmsUkmtoResponse } from '../firms-ukmto';

const makeFirm = (overrides: Partial<{ id: string; lat: number; lng: number; frp: number; brightness: number; acq_date: string; acq_time: string; satellite: string; confidence: string; daynight: 'D' | 'N' }> = {}) => ({
  id: 'firms-1',
  lat: 0,
  lng: 0,
  frp: 5,
  brightness: 320,
  acq_date: '2026-06-13',
  acq_time: '0342',
  satellite: 'NOAA-20',
  confidence: 'high',
  daynight: 'D' as const,
  ...overrides,
});

const makeIncident = (overrides: Partial<{ id: string; title: string; category: string; date: string; lat: number; lng: number }> = {}) => ({
  id: 'ukmto-1',
  title: 'Suspicious approach',
  category: 'suspicious approach',
  date: '2026-06-13',
  lat: 12.0,
  lng: 45.0,
  ...overrides,
});

const empty: FirmsUkmtoResponse = { generated_at: '2026-06-13T00:00:00Z', fires: [], incidents: [] };

describe('fromFirms', () => {
  it('returns [] for empty / nullish input', () => {
    expect(fromFirms(null)).toEqual([]);
    expect(fromFirms(undefined)).toEqual([]);
    expect(fromFirms(empty)).toEqual([]);
  });

  it('drops low-FRP noise (FRP < 1 MW)', () => {
    const r = fromFirms({ ...empty, fires: [makeFirm({ frp: 0.5 })] });
    expect(r).toEqual([]);
  });

  it('marks FRP >= 50 MW as critical', () => {
    const r = fromFirms({ ...empty, fires: [makeFirm({ frp: 60 })] });
    expect(r[0]?.severity).toBe('critical');
  });

  it('marks FRP 10..50 MW as high', () => {
    const r = fromFirms({ ...empty, fires: [makeFirm({ frp: 15 })] });
    expect(r[0]?.severity).toBe('high');
  });

  it('marks FRP 1..10 MW with brightness >= 340 K as medium', () => {
    const r = fromFirms({ ...empty, fires: [makeFirm({ frp: 5, brightness: 350 })] });
    expect(r[0]?.severity).toBe('medium');
  });

  it('caps the rendered list at 250, sorted by FRP desc', () => {
    const fires = Array.from({ length: 300 }, (_, i) => makeFirm({ id: `f-${i}`, frp: i + 1 }));
    const r = fromFirms({ ...empty, fires });
    expect(r.length).toBe(250);
    // Highest FRP first.
    expect(r[0]?.title).toContain('FRP 300.0');
    expect(r[249]?.title).toContain('FRP 51.0');
  });

  it('builds a valid ISO timestamp from acq_date + acq_time', () => {
    const r = fromFirms({ ...empty, fires: [makeFirm({ acq_date: '2026-06-13', acq_time: '0342' })] });
    expect(r[0]?.timestamp).toBe('2026-06-13T03:42Z');
  });
});

describe('fromUkmto', () => {
  it('returns [] for empty / nullish input', () => {
    expect(fromUkmto(null)).toEqual([]);
    expect(fromUkmto(undefined)).toEqual([]);
    expect(fromUkmto(empty)).toEqual([]);
  });

  it('piracy / armed attack → critical', () => {
    expect(fromUkmto({ ...empty, incidents: [makeIncident({ category: 'Piracy' })] })[0]?.severity).toBe('critical');
    expect(fromUkmto({ ...empty, incidents: [makeIncident({ category: 'Armed Attack' })] })[0]?.severity).toBe('critical');
  });

  it('suspicious approach → high', () => {
    expect(fromUkmto({ ...empty, incidents: [makeIncident({ category: 'Suspicious Approach' })] })[0]?.severity).toBe('high');
  });

  it('unknown category → medium (visible but not high-priority)', () => {
    expect(fromUkmto({ ...empty, incidents: [makeIncident({ category: 'advisory' })] })[0]?.severity).toBe('medium');
  });

  it('parses incident date to ISO', () => {
    const r = fromUkmto({ ...empty, incidents: [makeIncident({ date: '2026-06-13' })] });
    expect(r[0]?.timestamp).toBe('2026-06-13T00:00:00.000Z');
  });
});
