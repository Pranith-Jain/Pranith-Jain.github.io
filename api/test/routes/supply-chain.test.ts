import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env as testEnv } from 'cloudflare:test';
import { validate } from '../../src/lib/validate';
import { depsDevPackageSchema } from '../../src/lib/validation-schemas';
import { depsDevPackageHandler } from '../../src/routes/supply-chain';

function pkgApp() {
  const a = new Hono<any>();
  a.get('/api/v1/supply-chain/package', validate('query', depsDevPackageSchema), depsDevPackageHandler);
  return a;
}
const env = (): any => ({ ...testEnv, OPEN_PUBLIC_READS: 'true' });

describe('deps.dev package route (mini-app)', () => {
  it('400 on missing name (schema mirrors handler reads)', async () => {
    const r = await pkgApp().request('/api/v1/supply-chain/package?system=npm', {}, env());
    expect(r.status).toBe(400);
  });
  it('400 on missing system', async () => {
    const r = await pkgApp().request('/api/v1/supply-chain/package?name=left-pad', {}, env());
    expect(r.status).toBe(400);
  });
  it('400 on an unknown system enum value', async () => {
    const r = await pkgApp().request('/api/v1/supply-chain/package?system=cocoapods&name=left-pad', {}, env());
    expect(r.status).toBe(400);
  });
  it('200 with a valid system+name (schema accepts the handler reads)', async () => {
    const r = await pkgApp().request('/api/v1/supply-chain/package?system=npm&name=left-pad&version=1.3.0', {}, env());
    // Upstream may be empty/error from the sandbox, but the request must NOT 400 on schema.
    expect(r.status).not.toBe(400);
    expect([200, 502]).toContain(r.status);
  });
});
