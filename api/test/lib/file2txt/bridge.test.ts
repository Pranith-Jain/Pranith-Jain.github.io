import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractViaBridge, BridgeUnavailable } from '../../../src/lib/file2txt/bridge';

const FILE = new Uint8Array([1, 2, 3]);

afterEach(() => vi.restoreAllMocks());

describe('extractViaBridge', () => {
  it('throws BridgeUnavailable when env is unset', async () => {
    await expect(extractViaBridge(FILE, 'application/pdf', 'r.pdf', {} as any, 'pdf')).rejects.toBeInstanceOf(
      BridgeUnavailable
    );
  });

  it('posts to the bridge and returns its text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ text: 'extracted from pdf' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { FILE2TXT_BRIDGE_URL: 'https://bridge.example', FILE2TXT_BRIDGE_TOKEN: 'tok' } as any;

    const r = await extractViaBridge(FILE, 'application/pdf', 'r.pdf', env, 'pdf');

    expect(r.text).toBe('extracted from pdf');
    expect(r.meta).toEqual({ kind: 'pdf', method: 'bridge', truncated: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://bridge.example/extract');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws on non-200 from the bridge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const env = { FILE2TXT_BRIDGE_URL: 'https://bridge.example' } as any;
    await expect(extractViaBridge(FILE, 'application/pdf', 'r.pdf', env, 'pdf')).rejects.toThrow();
  });
});
