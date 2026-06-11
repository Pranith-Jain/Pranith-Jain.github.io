import { describe, it, expect } from 'vitest';
import { fetchDepsDev, resolveLatestVersion } from '../../../src/lib/supply-chain/depsdev';

/** Fake fetch routing deps.dev v3 paths to captured-from-live fixtures.
 * Counts calls so we can assert the hard sub-call cap. */
function makeFetch() {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (/\/systems\/npm\/packages\/left-pad$/.test(url)) {
      return new Response(JSON.stringify({ versions: [{ versionKey: { version: '1.3.0' }, isDefault: true }] }), {
        status: 200,
      });
    }
    if (/\/systems\/npm\/packages\/left-pad\/versions\/1\.3\.0$/.test(url)) {
      return new Response(
        JSON.stringify({
          licenses: ['MIT'],
          advisoryKeys: [{ id: 'GHSA-xxxx-yyyy-zzzz' }],
          projectKeys: [{ id: 'github.com/stevemao/left-pad' }],
        }),
        { status: 200 }
      );
    }
    if (/:dependencies$/.test(url)) {
      return new Response(JSON.stringify({ nodes: [{}, {}, {}, {}] }), { status: 200 });
    }
    if (/\/projects\//.test(url)) {
      return new Response(JSON.stringify({ scorecard: { overallScore: 6.7 } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('fetchDepsDev', () => {
  it('maps an ok response, resolves latest version, never exceeds 6 sub-calls', async () => {
    const { f, calls } = makeFetch();
    const r = await fetchDepsDev('npm', 'left-pad', undefined, { fetch: f });
    expect(r.status).toBe('ok');
    expect(r.source).toBe('deps.dev');
    expect(r.package).toBe('left-pad');
    expect(r.ecosystem).toBe('npm');
    expect(r.version).toBe('1.3.0');
    expect(calls.length).toBeLessThanOrEqual(6);
    expect(r.findings.some((x) => x.id === 'GHSA-xxxx-yyyy-zzzz')).toBe(true);
    expect(typeof r.detail?.scorecard_score).toBe('number');
    expect(r.detail?.dependency_count).toBe(4);
    expect(r.detail?.licenses).toEqual(['MIT']);
  });

  it('honors a pinned version (skips latest-version resolution)', async () => {
    const { f, calls } = makeFetch();
    const r = await fetchDepsDev('npm', 'left-pad', '1.3.0', { fetch: f });
    expect(r.status).toBe('ok');
    expect(r.version).toBe('1.3.0');
    // No call to the bare /packages/<name> latest-resolution endpoint.
    expect(calls.some((u) => /\/packages\/left-pad$/.test(u))).toBe(false);
  });

  it('degrades (no graph) for an unsupported ecosystem, never throws', async () => {
    const f = (async () =>
      new Response(JSON.stringify({ versions: [{ versionKey: { version: '1.0.0' }, isDefault: true }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const r = await fetchDepsDev('go', 'golang.org/x/text', undefined, { fetch: f });
    // go is not in GetDependencies coverage → no dependency_count, still ok/empty not error.
    expect(['ok', 'empty']).toContain(r.status);
    expect(r.detail?.dependency_count).toBeUndefined();
  });

  it('returns empty on a 404 package, never throws', async () => {
    const f = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const r = await fetchDepsDev('npm', 'does-not-exist-pkg-zzz', undefined, { fetch: f });
    expect(r.status).toBe('empty');
  });

  it('returns error on a non-ok upstream, never throws', async () => {
    const f = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const r = await fetchDepsDev('npm', 'left-pad', undefined, { fetch: f });
    expect(r.status).toBe('error');
  });

  it('resolveLatestVersion picks the default version', async () => {
    const f = (async () =>
      new Response(
        JSON.stringify({
          versions: [
            { versionKey: { version: '0.9.0' }, isDefault: false },
            { versionKey: { version: '1.3.0' }, isDefault: true },
          ],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;
    const v = await resolveLatestVersion('npm', 'left-pad', { fetch: f });
    expect(v).toBe('1.3.0');
  });
});
