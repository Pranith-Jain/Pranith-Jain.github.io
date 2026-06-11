import { describe, it, expect } from 'vitest';
import { fetchDepsDev } from '../../../src/lib/supply-chain/depsdev';

// LIVE-FORMAT SMOKE — skipped by default (real network). Run on demand:
//   cd api && npx vitest run test/lib/supply-chain/depsdev.live.test.ts (dangerouslyDisableSandbox)
describe.skip('fetchDepsDev (LIVE deps.dev format)', () => {
  it('lodash (npm) resolves a version + scorecard against the real v3 API', async () => {
    const r = await fetchDepsDev('npm', 'lodash', undefined);
    expect(r.status).toBe('ok');
    expect(r.source).toBe('deps.dev');
    expect(typeof r.version).toBe('string');
    // Scorecard + dependency_count are present for a supported ecosystem.
    expect(r.detail).toBeDefined();
  }, 20000);
});
