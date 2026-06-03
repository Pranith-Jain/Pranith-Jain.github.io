import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isCapeConfigured,
  capeApiBase,
  submitFile,
  taskStatus,
  fetchReport,
  normalizeReport,
  CapeUnconfiguredError,
  CapeBridgeError,
  type CapeEnv,
} from '../../src/lib/cape-bridge';

const env: CapeEnv = { CAPE_BRIDGE_URL: 'https://cape.example.com', CAPE_BRIDGE_TOKEN: 'tok' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('isCapeConfigured', () => {
  it('is false when the bridge URL is unset or blank', () => {
    expect(isCapeConfigured({})).toBe(false);
    expect(isCapeConfigured({ CAPE_BRIDGE_URL: '' })).toBe(false);
    expect(isCapeConfigured({ CAPE_BRIDGE_URL: '   ' })).toBe(false);
  });

  it('is true when the bridge URL is set', () => {
    expect(isCapeConfigured(env)).toBe(true);
  });
});

describe('capeApiBase', () => {
  it('appends /apiv2 to a bare base and strips trailing slashes', () => {
    expect(capeApiBase({ CAPE_BRIDGE_URL: 'https://cape.example.com' })).toBe('https://cape.example.com/apiv2');
    expect(capeApiBase({ CAPE_BRIDGE_URL: 'https://cape.example.com/' })).toBe('https://cape.example.com/apiv2');
  });

  it('does not double up when the URL already ends in /apiv2', () => {
    expect(capeApiBase({ CAPE_BRIDGE_URL: 'https://cape.example.com/apiv2' })).toBe('https://cape.example.com/apiv2');
    expect(capeApiBase({ CAPE_BRIDGE_URL: 'https://cape.example.com/apiv2/' })).toBe('https://cape.example.com/apiv2');
  });
});

describe('submitFile', () => {
  it('throws CapeUnconfiguredError when the bridge URL is unset', async () => {
    await expect(submitFile({}, { bytes: new Uint8Array([1, 2, 3]), filename: 'x.bin' })).rejects.toBeInstanceOf(
      CapeUnconfiguredError
    );
  });

  it('POSTs multipart to tasks/create/file/ with a Token auth header and returns the task id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: { task_ids: [4242] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const ref = await submitFile(env, { bytes: new Uint8Array([1, 2, 3]), filename: 'evil.exe' });

    expect(ref.task_id).toBe(4242);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cape.example.com/apiv2/tasks/create/file/');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token tok');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('also reads the legacy single-task response shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ task_id: 7 }), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const ref = await submitFile(env, { bytes: new Uint8Array([1]), filename: 'a.bin' });
    expect(ref.task_id).toBe(7);
  });

  it('throws CapeBridgeError on a non-2xx upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(submitFile(env, { bytes: new Uint8Array([1]), filename: 'a.bin' })).rejects.toBeInstanceOf(
      CapeBridgeError
    );
  });
});

describe('taskStatus', () => {
  it('GETs tasks/view/{id}/ and returns the id + status', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: false, data: { id: 12, status: 'reported' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const s = await taskStatus(env, 12);
    expect(s).toEqual({ id: 12, status: 'reported' });
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe('https://cape.example.com/apiv2/tasks/view/12/');
  });
});

describe('fetchReport', () => {
  it('GETs tasks/report/{id}/ and returns the raw payload', async () => {
    const raw = { info: { score: 1 } };
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(raw), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    const r = await fetchReport(env, 9);
    expect(r).toEqual(raw);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe('https://cape.example.com/apiv2/tasks/report/9/');
  });
});

describe('normalizeReport', () => {
  const raw = {
    info: { score: 8.5 },
    signatures: [{ name: 'antidbg', description: 'Anti-debug', severity: 3 }],
    target: { file: { name: 'evil.exe', sha256: 'a'.repeat(64) } },
    dropped: [{ name: 'drop.dll', sha256: 'b'.repeat(64) }],
    network: {
      domains: [{ domain: 'evil.test' }],
      dns: [{ request: 'c2.test' }],
      hosts: ['1.2.3.4', { ip: '5.6.7.8' }],
      http: [{ uri: 'http://evil.test/payload' }],
    },
  };

  it('maps the CAPE malscore (0-10) to a 0-100 score and a malicious verdict', () => {
    const n = normalizeReport(raw, 100);
    expect(n.task_id).toBe(100);
    expect(n.score).toBe(85);
    expect(n.verdict).toBe('malicious');
  });

  it('extracts network + dropped + target IOCs without duplicates', () => {
    const n = normalizeReport(raw, 100);
    expect(n.iocs.domains).toEqual(expect.arrayContaining(['evil.test', 'c2.test']));
    expect(n.iocs.ips).toEqual(expect.arrayContaining(['1.2.3.4', '5.6.7.8']));
    expect(n.iocs.urls).toContain('http://evil.test/payload');
    expect(n.iocs.hashes).toEqual(expect.arrayContaining(['a'.repeat(64), 'b'.repeat(64)]));
    expect(n.signatures).toHaveLength(1);
    expect(n.target?.filename).toBe('evil.exe');
  });

  it('treats a low score as clean and tolerates a missing network section', () => {
    const n = normalizeReport({ info: { score: 0.5 }, target: { file: {} } }, 1);
    expect(n.verdict).toBe('clean');
    expect(n.iocs).toEqual({ domains: [], ips: [], urls: [], hashes: [] });
  });

  it('reports unknown when the score is absent', () => {
    const n = normalizeReport({}, 1);
    expect(n.verdict).toBe('unknown');
    expect(n.score).toBe(0);
  });
});
