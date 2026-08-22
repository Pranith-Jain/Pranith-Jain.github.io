import { describe, it, expect, vi } from 'vitest';
import { submissionProviders, submitSample, getSubmissionStatus } from '../../src/lib/sample-submission';

const SAMPLE_B64 = Buffer.from('MZ fake pe bytes for testing').toString('base64');

function mockFetch(handler: (url: string) => { status: number; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const { status, body } = handler(url);
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
}

describe('submissionProviders', () => {
  it('reports per-provider configuration state', () => {
    const none = submissionProviders({});
    expect(none.every((p) => !p.configured)).toBe(true);
    expect(none.find((p) => p.id === 'hybridanalysis')?.kind).toBe('dynamic_detonation');
    const both = submissionProviders({ VT_API_KEY: 'k', HYBRID_ANALYSIS_API_KEY: 'k2' });
    expect(both.every((p) => p.configured)).toBe(true);
  });
});

describe('submitSample', () => {
  it('rejects invalid base64', async () => {
    const r = await submitSample({}, { dataBase64: '!!!not-base64@@@' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('base64');
  });

  it('fails with a combined reason when nothing is configured', async () => {
    const r = await submitSample({}, { dataBase64: SAMPLE_B64 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no provider accepted');
  });

  it('skips unconfigured providers but submits to the configured one', async () => {
    mockFetch((url) =>
      url.includes('virustotal.com/api/v3/files')
        ? { status: 200, body: { data: { id: 'an-123' } } }
        : { status: 404, body: {} }
    );
    const r = await submitSample({ VT_API_KEY: 'k' }, { dataBase64: SAMPLE_B64, filename: 'evil.exe' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.submitted).toHaveLength(1);
      expect(r.submitted[0]).toMatchObject({ provider: 'virustotal', analysisId: 'an-123' });
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.skipped[0]).toMatchObject({ provider: 'hybridanalysis' });
    }
  });

  it('submits to both providers when both keys exist', async () => {
    mockFetch((url) =>
      url.includes('hybrid-analysis.com')
        ? { status: 200, body: { job_id: 'j-9', state: 'IN_QUEUE' } }
        : { status: 200, body: { data: { id: 'an-5' } } }
    );
    const r = await submitSample({ VT_API_KEY: 'k', HYBRID_ANALYSIS_API_KEY: 'h' }, { dataBase64: SAMPLE_B64 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.submitted.map((s) => s.provider).sort()).toEqual(['hybridanalysis', 'virustotal']);
      expect(r.skipped).toHaveLength(0);
    }
  });

  it('collects per-provider failures without sinking the batch', async () => {
    mockFetch((url) =>
      url.includes('hybrid-analysis.com') ? { status: 401, body: {} } : { status: 200, body: { data: { id: 'an-6' } } }
    );
    const r = await submitSample({ VT_API_KEY: 'k', HYBRID_ANALYSIS_API_KEY: 'bad' }, { dataBase64: SAMPLE_B64 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.submitted).toHaveLength(1);
      expect(r.skipped[0]?.provider).toBe('hybridanalysis');
      expect(String(r.skipped[0]?.reason)).toContain('401');
    }
  });
});

describe('getSubmissionStatus', () => {
  it('errors when no ids given', async () => {
    const r = await getSubmissionStatus({ VT_API_KEY: 'k' }, {});
    expect(r.ok).toBe(false);
  });

  it('polls VT analysis and HA state independently', async () => {
    mockFetch((url) =>
      url.includes('/analyses/')
        ? {
            status: 200,
            body: {
              data: {
                id: 'an-1',
                attributes: {
                  status: 'completed',
                  stats: { malicious: 3 },
                  meta: { file_info: { sha256: 'a'.repeat(64) } },
                },
              },
            },
          }
        : { status: 200, body: [{ state: 'FINISHED' }] }
    );
    const r = await getSubmissionStatus(
      { VT_API_KEY: 'k', HYBRID_ANALYSIS_API_KEY: 'h' },
      { virustotalAnalysisId: 'an-1', sha256: 'b'.repeat(64) }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const vt = r.results.find((x) => x.provider === 'virustotal');
      const ha = r.results.find((x) => x.provider === 'hybridanalysis');
      expect(vt?.status).toBe('completed');
      expect(ha?.state).toBe('FINISHED');
    }
  });
});
