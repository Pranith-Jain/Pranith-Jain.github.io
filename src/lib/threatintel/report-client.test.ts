import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildReport, pollReport, type Report } from './report-client';

const sampleReport = { meta: { id: 'r1', status: 'done' } } as unknown as Report;

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('buildReport', () => {
  it('POSTs subject/template/tlp and returns the report id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report_id: 'rep-9' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const id = await buildReport('LockBit', 'ransomware-group', 'AMBER');
    expect(id).toBe('rep-9');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/report/build');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ subject: 'LockBit', template: 'ransomware-group', tlp: 'AMBER' });
  });

  it('throws on a non-ok build response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(buildReport('x', undefined, 'AMBER')).rejects.toThrow(/401/);
  });
});

describe('pollReport', () => {
  it('reports progress then resolves with the report when done', async () => {
    const responses = [
      new Response(JSON.stringify({ phase: 'gather', pct: 30, detail: 'Gathering' }), { status: 200 }),
      new Response(JSON.stringify({ phase: 'done', pct: 100, detail: 'Done', report: sampleReport }), { status: 200 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const report = await pollReport('rep-9', (p) => seen.push(p.phase), { intervalMs: 1 });
    expect(seen).toContain('gather');
    expect(report.meta.id).toBe('r1');
  });

  it('rejects when the build errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ phase: 'error', detail: 'boom' }), { status: 200 }))
    );
    await expect(pollReport('rep-9', () => {}, { intervalMs: 1 })).rejects.toThrow(/boom/);
  });
});
