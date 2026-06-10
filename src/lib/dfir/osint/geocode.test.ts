// src/lib/dfir/osint/geocode.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPlace, reverseGeocode } from './geocode';

afterEach(() => vi.restoreAllMocks());

describe('searchPlace', () => {
  it('maps Nominatim results to {label,lat,lng}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify([{ display_name: 'Berlin, Germany', lat: '52.52', lon: '13.405' }]))
      )
    );
    const out = await searchPlace('berlin');
    expect(out[0]).toEqual({ label: 'Berlin, Germany', lat: 52.52, lng: 13.405 });
  });
  it('returns [] on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      })
    );
    expect(await searchPlace('x')).toEqual([]);
  });
  it('returns [] for a blank query without calling fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await searchPlace('   ')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it('returns [] when Nominatim responds with a non-array body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Unable to geocode' })))
    );
    expect(await searchPlace('nowhere')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('returns display_name for coords', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ display_name: '1 Main St' })))
    );
    expect(await reverseGeocode(1, 2)).toBe('1 Main St');
  });
  it('returns null on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      })
    );
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});
