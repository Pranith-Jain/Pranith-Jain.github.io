import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isReconConfigured,
  isReconTool,
  reconBase,
  runRecon,
  ReconUnconfiguredError,
  ReconBridgeError,
  type ReconEnv,
} from '../../src/lib/recon-bridge';

const env: ReconEnv = { RECON_BRIDGE_URL: 'https://recon.example.com', RECON_BRIDGE_TOKEN: 'tok' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('isReconConfigured', () => {
  it('is false when the bridge URL is unset or blank', () => {
    expect(isReconConfigured({})).toBe(false);
    expect(isReconConfigured({ RECON_BRIDGE_URL: '  ' })).toBe(false);
  });
  it('is true when the bridge URL is set', () => {
    expect(isReconConfigured(env)).toBe(true);
  });
});

describe('isReconTool', () => {
  it('accepts the four supported tools', () => {
    expect(isReconTool('subfinder')).toBe(true);
    expect(isReconTool('amass')).toBe(true);
    expect(isReconTool('theharvester')).toBe(true);
    expect(isReconTool('spiderfoot')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isReconTool('nmap')).toBe(false);
    expect(isReconTool('')).toBe(false);
  });
});

describe('reconBase', () => {
  it('strips trailing slashes', () => {
    expect(reconBase({ RECON_BRIDGE_URL: 'https://recon.example.com/' })).toBe('https://recon.example.com');
    expect(reconBase({ RECON_BRIDGE_URL: 'https://recon.example.com' })).toBe('https://recon.example.com');
  });
});

describe('runRecon', () => {
  it('throws ReconUnconfiguredError when the bridge URL is unset', async () => {
    await expect(runRecon({}, { tool: 'subfinder', target: 'example.com' })).rejects.toBeInstanceOf(
      ReconUnconfiguredError
    );
  });

  it('POSTs {tool,target} to /recon with a Bearer header and normalizes the result', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            subdomains: ['a.example.com', 'b.example.com'],
            hosts: ['1.2.3.4'],
            emails: ['x@example.com'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    const r = await runRecon(env, { tool: 'subfinder', target: 'example.com' });

    expect(r.tool).toBe('subfinder');
    expect(r.target).toBe('example.com');
    expect(r.subdomains).toEqual(['a.example.com', 'b.example.com']);
    expect(r.hosts).toEqual(['1.2.3.4']);
    expect(r.emails).toEqual(['x@example.com']);
    expect(r.count).toBe(4);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://recon.example.com/recon');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({ tool: 'subfinder', target: 'example.com' });
  });

  it('dedupes results and tolerates missing arrays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ subdomains: ['a.example.com', 'a.example.com', 'c.example.com'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const r = await runRecon(env, { tool: 'amass', target: 'example.com' });
    expect(r.subdomains).toEqual(['a.example.com', 'c.example.com']);
    expect(r.hosts).toEqual([]);
    expect(r.emails).toEqual([]);
  });

  it('throws ReconBridgeError on a non-2xx upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 502 }));
    await expect(runRecon(env, { tool: 'subfinder', target: 'example.com' })).rejects.toBeInstanceOf(ReconBridgeError);
  });
});
