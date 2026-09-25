import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFlowvizTechniques,
  filterFlowvizTechniques,
  _resetFlowvizForTests,
  type FlowvizTechnique,
} from './flowviz-manifest';

function mockAssets(files: Record<string, unknown>): Fetcher {
  return {
    fetch: async (_req: Request) => {
      const url = new URL(_req.url);
      const data = files[url.pathname];
      if (data === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    },
  } as unknown as Fetcher;
}

const FAKE_TECHNIQUES: FlowvizTechnique[] = [
  { id: 'T1566', name: 'Phishing', tactics: [{ id: 'TA0001', name: 'Initial Access' }] },
  { id: 'T1566.001', name: 'Spearphishing Attachment', tactics: [{ id: 'TA0001', name: 'Initial Access' }] },
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactics: [{ id: 'TA0002', name: 'Execution' }] },
];

beforeEach(() => _resetFlowvizForTests());

describe('flowviz-manifest', () => {
  it('loads the technique index through ASSETS', async () => {
    const assets = mockAssets({ '/data/flowviz/techniques.json': FAKE_TECHNIQUES });
    const all = await loadFlowvizTechniques(assets);
    expect(all).toHaveLength(3);
    expect(all[0]!.id).toBe('T1566');
  });

  it('throws a helpful error when the asset is missing', async () => {
    const assets = mockAssets({});
    await expect(loadFlowvizTechniques(assets)).rejects.toThrow('flowviz asset missing');
  });

  it('prefix-ranks id/name matches above substring matches', () => {
    const out = filterFlowvizTechniques(FAKE_TECHNIQUES, { q: 'T1566' });
    expect(out.map((t) => t.id)).toEqual(['T1566', 'T1566.001']);
  });

  it('filters by tactic and caps limit', () => {
    const out = filterFlowvizTechniques(FAKE_TECHNIQUES, { tactic: 'ta0002', limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('T1059');
  });

  it('returns empty for a non-matching query', () => {
    expect(filterFlowvizTechniques(FAKE_TECHNIQUES, { q: 'zzz-nope' })).toEqual([]);
  });
});
