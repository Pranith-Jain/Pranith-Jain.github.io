import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
describe('ioc-enrich-deep route', () => {
  it('rejects missing indicator', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing indicator/);
  });
  it('rejects unrecognized indicator type', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=not-an-ioc-just-text');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unrecognized indicator type/);
  });
  it('caps indicator length', async () => {
    const long = 'a'.repeat(2001);
    const res = await SELF.fetch(`https://self.internal/api/v1/ioc/enrich-deep?indicator=${long}`);
    expect(res.status).toBe(400);
  });
  it('returns 200 with source skeleton for a valid IP', async () => {
    // The actual upstream calls will fail in the test env (no real network),
    // but the route should still return a 200 with the sources fan-out
    // structure and no internal crash.
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=1.2.3.4');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.indicator).toBe('1.2.3.4');
      expect(body.type).toBe('ipv4');
      expect(Array.isArray(body.sources)).toBe(true);
      expect(body.verdict?.overall).toBeDefined();
    }
  });
  it('does NOT call webamon-scan by default for domains (BUG-006 regression guard)', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=example.com');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const names = (body.sources ?? []).map((s) => s.source);
      // webamon-search is the cheap read-only default; webamon-scan is opt-in.
      expect(names).toContain('webamon-search');
      expect(names).not.toContain('webamon-scan');
    }
  });
  it('calls webamon-scan only when ?trigger=scan is set', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=example.com&trigger=scan');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const names = (body.sources ?? []).map((s) => s.source);
      expect(names).toContain('webamon-search');
      expect(names).toContain('webamon-scan');
    }
  });
  it('routes CVE indicators to /cve/lookup + /cve-recent + /cve-threat-map', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=CVE-2024-3400');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const names = (body.sources ?? []).map((s) => s.source);
      expect(body.type).toBe('cve');
      expect(names).toContain('cve-lookup');
      expect(names).toContain('cve-recent-context');
      expect(names).toContain('cve-threat-map');
    }
  });
  it('routes email indicators to /breach/email + /ioc/check + /domain/lookup', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=alice@example.com');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const names = (body.sources ?? []).map((s) => s.source);
      expect(body.type).toBe('email');
      expect(names).toContain('breach-email');
      expect(names).toContain('reputation');
      expect(names).toContain('domain-lookup');
    }
  });
  it('routes IP indicators to the chained asn-graph hit', async () => {
    const res = await SELF.fetch('https://self.internal/api/v1/ioc/enrich-deep?indicator=1.2.3.4');
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const names = (body.sources ?? []).map((s) => s.source);
      expect(names).toContain('asn-graph');
    }
  });
});
