import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { requireAdminMiddleware } from '../../src/lib/admin-auth';
import { validate } from '../../src/lib/validate';
import { cryptoWatchAddSchema } from '../../src/lib/validation-schemas';
import {
  cryptoWatchAddHandler,
  cryptoWatchListHandler,
  cryptoWatchRemoveHandler,
  cryptoAlertsHandler,
} from '../../src/routes/crypto-monitor';

function app() {
  const a = new Hono<any>();
  a.use('/api/v1/crypto-monitor', requireAdminMiddleware);
  a.use('/api/v1/crypto-monitor/*', requireAdminMiddleware);
  a.post('/api/v1/crypto-monitor/watch', validate('json', cryptoWatchAddSchema), cryptoWatchAddHandler);
  a.get('/api/v1/crypto-monitor/watches', cryptoWatchListHandler);
  a.delete('/api/v1/crypto-monitor/watch/:address/:chain', cryptoWatchRemoveHandler);
  a.get('/api/v1/crypto-monitor/alerts', cryptoAlertsHandler);
  return a;
}
const env = (): any => ({ ...testEnv, ADMIN_TOKEN: 'sekret' });
const bearer = { 'content-type': 'application/json', Authorization: 'Bearer sekret' };

describe('crypto-monitor (admin, mini-app)', () => {
  it('401 without admin token', async () => {
    const r = await app().request('/api/v1/crypto-monitor/watches', {}, env());
    expect(r.status).toBe(401);
  });
  it('400 on a bad chain', async () => {
    const r = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ address: '0xabc', chain: 'doge', alert_types: ['new_transfer'] }),
      },
      env()
    );
    expect(r.status).toBe(400);
  });
  it('400 when large_transfer is selected without min_amount', async () => {
    const r = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ address: '0xabc', chain: 'evm', alert_types: ['large_transfer'] }),
      },
      env()
    );
    expect(r.status).toBe(400);
  });
  it('400 on a private/loopback webhook host (SSRF guard)', async () => {
    const r = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({
          address: '0xabc',
          chain: 'evm',
          alert_types: ['new_transfer'],
          webhook_url: 'http://127.0.0.1/x',
        }),
      },
      env()
    );
    expect(r.status).toBe(400);
  });
  it('add -> list -> alerts -> delete round-trip', async () => {
    const add = await app().request(
      '/api/v1/crypto-monitor/watch',
      {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({ address: '0xWATCHED1', chain: 'evm', alert_types: ['new_transfer'] }),
      },
      env()
    );
    expect(add.status).toBe(201);
    const list = await app().request('/api/v1/crypto-monitor/watches', { headers: bearer }, env());
    const { watches } = (await list.json()) as { watches: { address: string }[] };
    expect(watches.some((w) => w.address === '0xWATCHED1')).toBe(true);
    const alerts = await app().request(
      '/api/v1/crypto-monitor/alerts?address=0xWATCHED1&chain=evm',
      { headers: bearer },
      env()
    );
    expect(alerts.status).toBe(200);
    const del = await app().request(
      '/api/v1/crypto-monitor/watch/0xWATCHED1/evm',
      { method: 'DELETE', headers: bearer },
      env()
    );
    expect(del.status).toBe(200);
  });
});
