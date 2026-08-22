import { describe, it, expect } from 'vitest';
import {
  veloConfig,
  veloListClients,
  veloGetClient,
  veloListFlows,
  veloCollectArtifact,
  veloGetFlowStatus,
  veloGetFlowResults,
  veloCreateHunt,
  veloGetHunt,
  veloListHunts,
} from '../../src/lib/velociraptor';

const CFG_ENV = { VELO_API_URL: 'https://velo.example.com:8889', VELO_API_TOKEN: 'tok-123' };

function okFetch(payload: unknown): Fetcher {
  return {
    fetch: async () =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
  } as unknown as Fetcher;
}

describe('veloConfig', () => {
  it('returns null when URL unset', () => {
    expect(veloConfig({})).toBeNull();
  });
  it('prefers bearer token over basic', () => {
    const cfg = veloConfig({
      VELO_API_URL: 'https://v:8889/',
      VELO_API_TOKEN: 't1',
      VELO_USERNAME: 'u',
      VELO_PASSWORD: 'p',
    })!;
    expect(cfg.baseUrl).toBe('https://v:8889'); // trailing slash stripped
    expect(cfg.authHeader).toBe('Bearer t1');
  });
  it('falls back to basic auth', () => {
    const cfg = veloConfig({ VELO_API_URL: 'https://v', VELO_USERNAME: 'u', VELO_PASSWORD: 'p' })!;
    expect(cfg.authHeader.startsWith('Basic ')).toBe(true);
  });
});

describe('veloListClients', () => {
  it('degrades gracefully when unconfigured', async () => {
    const r = await veloListClients({}, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.configured).toBe(false);
      expect(r.data.hint).toContain('VELO_API_URL');
    }
  });

  it('normalizes clients and strips nanosecond timestamps', async () => {
    const fetcher = okFetch({
      clients: [
        {
          client_id: 'C.1234',
          hostname: 'DC01',
          os_info: { system: 'windows', release: '10', machine: 'amd64', fqdn: 'dc01.corp' },
          last_seen_at: 1755000000000000000,
          labels: ['prod'],
        },
      ],
    });
    const r = await veloListClients(CFG_ENV, { limit: 10, self: fetcher });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.count).toBe(1);
      expect(r.data.clients?.[0]).toMatchObject({
        client_id: 'C.1234',
        hostname: 'DC01',
        arch: 'amd64',
        labels: ['prod'],
        lastSeen: new Date(1755000000000).toISOString(),
      });
    }
  });
});

describe('veloGetClient / veloListFlows', () => {
  it('errors on missing client', async () => {
    const r = await veloGetClient(CFG_ENV, 'C.nope', { self: okFetch({}) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not found');
  });

  it('maps flow summaries with artifact names from request', async () => {
    const fetcher = okFetch({
      flows: [
        {
          flow_id: 'F.ABC1',
          state: 'FINISHED',
          create_time: 1755000000000000000,
          request: { artifacts: ['Windows.Sysinternals.Autoruns'] },
        },
      ],
    });
    const r = await veloListFlows(CFG_ENV, 'C.1234', { self: fetcher });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.flows?.[0]).toMatchObject({
        flow_id: 'F.ABC1',
        artifacts: ['Windows.Sysinternals.Autoruns'],
        state: 'FINISHED',
      });
    }
  });
});

describe('veloCollectArtifact', () => {
  it('rejects empty artifact list before calling upstream', async () => {
    const r = await veloCollectArtifact(CFG_ENV, { client_id: 'C.1', artifacts: [] }, { self: okFetch({}) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('artifacts');
  });

  it('returns flow id + poll hint on success', async () => {
    const r = await veloCollectArtifact(
      CFG_ENV,
      {
        client_id: 'C.1234',
        artifacts: ['Windows.Detection.Yara.NTFS'],
        parameters: { YaraRule: 'rule a{}' },
        urgent: true,
      },
      { self: okFetch({ flow_id: 'F.XYZ9', state: 'RUNNING' }) }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.flowId).toBe('F.XYZ9');
      expect(r.data.state).toBe('RUNNING');
      expect(r.data.hint).toContain("flow_id='F.XYZ9'");
    }
  });
});

describe('veloGetFlowStatus / veloGetFlowResults', () => {
  it('surfaces running state with poll hint', async () => {
    const r = await veloGetFlowStatus(CFG_ENV, 'C.1', 'F.XYZ9', {
      self: okFetch({ context: { flow_id: 'F.XYZ9', state: 'RUNNING', request: { artifacts: ['A'] } } }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.hint).toContain('poll again');
  });

  it('paginates results and flags truncation', async () => {
    let call = 0;
    const fetcher = {
      fetch: async () => {
        call++;
        return new Response(
          JSON.stringify({
            columns: ['Name', 'PID'],
            rows: Array.from({ length: 100 }, (_, i) => ({ Name: `p${i}`, PID: i })),
            total_rows: 250,
          }),
          { status: 200 }
        );
      },
    } as unknown as Fetcher;
    const r = await veloGetFlowResults(CFG_ENV, 'C.1', 'F.XYZ9', { rows: 100, self: fetcher });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rows).toHaveLength(100);
      expect(r.data.totalRows).toBe(250);
      expect(r.data.truncated).toBe(true);
      expect(r.data.hint).toContain('offset=100');
    }
    expect(call).toBe(1);
  });
});

describe('velo hunts', () => {
  it('create rejects empty artifacts before calling upstream', async () => {
    const r = await veloCreateHunt(CFG_ENV, { artifacts: [] }, { self: okFetch({}) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('artifacts');
  });

  it('creates an all-endpoints hunt with poll hint', async () => {
    const r = await veloCreateHunt(
      CFG_ENV,
      { artifacts: ['Windows.Detection.Yara.NTFS'], expireHours: 48 },
      { self: okFetch({ hunt_id: 'H.HX7K2A', state: 'RUNNING' }) }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.huntId).toBe('H.HX7K2A');
      expect(r.data.hint).toContain("hunt_id='H.HX7K2A'");
    }
  });

  it('get surfaces running state with hint; missing hunt errors', async () => {
    const ok = await veloGetHunt(CFG_ENV, 'H.1', {
      self: okFetch({
        hunt: { hunt_id: 'H.1', state: 'RUNNING', request: { artifacts: ['A'] }, total_clients_scheduled: 12 },
      }),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.hunt?.state).toBe('RUNNING');
      expect(ok.data.hint).toContain('poll again');
    }
    const miss = await veloGetHunt(CFG_ENV, 'H.nope', { self: okFetch({}) });
    expect(miss.ok).toBe(false);
  });

  it('lists hunts with normalized artifact arrays', async () => {
    const r = await veloListHunts(CFG_ENV, {
      limit: 5,
      self: okFetch({ hunts: [{ hunt_id: 'H.Z', state: 'STOPPED', request: { artifacts: ['Custom.X'] } }] }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.count).toBe(1);
      expect((r.data.hunts?.[0]?.artifacts as string[])[0]).toBe('Custom.X');
    }
  });
});
