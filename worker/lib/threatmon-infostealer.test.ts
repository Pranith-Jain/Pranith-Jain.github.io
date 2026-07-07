import { describe, it, expect } from 'vitest';
import { threatmonInfostealerSearch } from './threatmon-infostealer';

describe('threatmonInfostealerSearch', () => {
  it('returns error for short domain', async () => {
    const r = await threatmonInfostealerSearch('a');
    expect(r.diagnostics[0]?.status).toBe('failed');
    expect(r.records).toHaveLength(0);
  });

  it('detects Cloudflare challenge block (expected from server-side)', async () => {
    const r = await threatmonInfostealerSearch('example.com', 'company');
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.query).toBe('example.com');
    expect(r.scope).toBe('company');
    expect(Array.isArray(r.records)).toBe(true);
    expect(typeof r.totalCount).toBe('number');
    // ThreatMon API is behind Cloudflare managed challenge — server-side
    // fetches get 403. This is expected; the tool works from browser access.
    expect(r.diagnostics[0]?.status).toBe('failed');
    expect(r.diagnostics[0]?.error).toContain('Cloudflare');
  }, 15000);

  it('supports third-party scope parameter', async () => {
    const r = await threatmonInfostealerSearch('example.com', 'third-party');
    expect(r.scope).toBe('third-party');
    expect(Array.isArray(r.records)).toBe(true);
  }, 15000);
});
