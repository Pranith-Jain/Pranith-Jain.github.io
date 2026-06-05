import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { featuresHandler } from '../../src/routes/features';

function app() {
  const a = new Hono<any>();
  a.get('/api/v1/features', featuresHandler);
  return a;
}

describe('GET /api/v1/features', () => {
  it('reports both bridges dormant when no *_BRIDGE_URL is set', async () => {
    const r = await app().request('/api/v1/features', {}, {});
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ cape: false, recon: false, samples: true });
  });

  it('reports cape enabled once CAPE_BRIDGE_URL is set', async () => {
    const r = await app().request('/api/v1/features', {}, { CAPE_BRIDGE_URL: 'https://cape.example.com' });
    expect(await r.json()).toEqual({ cape: true, recon: false, samples: true });
  });

  it('reports recon enabled once RECON_BRIDGE_URL is set', async () => {
    const r = await app().request('/api/v1/features', {}, { RECON_BRIDGE_URL: 'https://recon.example.com' });
    expect(await r.json()).toEqual({ cape: false, recon: true, samples: true });
  });

  it('treats a blank/whitespace URL as unconfigured', async () => {
    const r = await app().request('/api/v1/features', {}, { CAPE_BRIDGE_URL: '   ', RECON_BRIDGE_URL: '' });
    expect(await r.json()).toEqual({ cape: false, recon: false, samples: true });
  });

  it('never leaks the URL or token values, only booleans', async () => {
    const r = await app().request(
      '/api/v1/features',
      {},
      {
        CAPE_BRIDGE_URL: 'https://cape.example.com',
        CAPE_BRIDGE_TOKEN: 'super-secret',
        RECON_BRIDGE_URL: 'https://r.example.com',
      }
    );
    const body = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['cape', 'recon', 'samples']);
    expect(JSON.stringify(body)).not.toContain('super-secret');
    expect(JSON.stringify(body)).not.toContain('cape.example.com');
  });

  it('sets a short public cache header', async () => {
    const r = await app().request('/api/v1/features', {}, {});
    expect(r.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('always reports samples=true regardless of bridge secrets', async () => {
    // /api/v1/sample/scan is always-on; verify it stays advertised even
    // with both bridges configured (or neither).
    const r = await app().request(
      '/api/v1/features',
      {},
      {
        CAPE_BRIDGE_URL: 'https://cape.example.com',
        RECON_BRIDGE_URL: 'https://recon.example.com',
      }
    );
    const body = (await r.json()) as { samples: boolean };
    expect(body.samples).toBe(true);
  });
});
