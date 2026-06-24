/**
 * Telegram → Actor correlation helper tests.
 *
 * These tests cover the three attribution sources independently and the
 * de-duplication + confidence-bump logic. The Cache API is faked with
 * a no-op for MISP + deepdarkCTI inputs so the test runs in isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { correlateHandle, handlesForActor } from '../../src/lib/telegram-actor-correlate';
// Build a minimal in-memory Cache for MISP / DDC payloads.
function fakeCache(payloads) {
  const map = new Map(Object.entries(payloads).map(([k, v]) => [k, new Response(JSON.stringify(v))]));
  return {
    match: async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      return map.get(url) ?? null;
    },
    put: async () => {
      /* no-op */
    },
    delete: async () => true,
  };
}
describe('correlateHandle — in-repo catalog', () => {
  it('returns a hit with the right shape for a known handle', async () => {
    const hits = await correlateHandle('apt28world');
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.actor_id).toBe('apt28');
    expect(top.sources).toContain('catalog');
    expect(top.confidence).toBeGreaterThan(0.8);
    expect(top.citations.length).toBeGreaterThan(0);
  });
  it('strips leading @ when matching', async () => {
    const a = await correlateHandle('apt28world');
    const b = await correlateHandle('@apt28world');
    expect(a[0]?.actor_id).toBe(b[0]?.actor_id);
  });
  it('is case-insensitive', async () => {
    const a = await correlateHandle('apt28world');
    const b = await correlateHandle('APT28WORLD');
    expect(a.length).toBe(b.length);
  });
  it('returns [] for an unknown handle', async () => {
    const hits = await correlateHandle('this_channel_does_not_exist_xyz');
    expect(hits).toEqual([]);
  });
  it('returns [] for an empty / whitespace handle', async () => {
    expect(await correlateHandle('')).toEqual([]);
    expect(await correlateHandle('@')).toEqual([]);
  });
  it('matches when the handle is one of several on a single actor', async () => {
    const hits = await correlateHandle('cryptohackalert');
    expect(hits.some((h) => h.actor_id === 'lazarus')).toBe(true);
  });
});
describe('correlateHandle — deepdarkCTI', () => {
  beforeEach(() => {
    // Reset module-level cache between test groups. The test file uses a
    // unique handle not in the catalog so we can attribute every hit to
    // the DDC source.
  });
  it('surfaces DDC entries that map an actor to a handle', async () => {
    const cache = fakeCache({
      'https://deepdarkcti-cache.internal/v1': {
        entries: [
          {
            name: 'Test Threat Actor',
            url: 'https://t.me/ddcti_test_actor',
            onion: false,
            status: 'online',
            category: 'Threat-Actor Telegram',
            source_file: 'telegram_threat_actors.md',
            actor: 'test-actor',
            attack_type: 'phishing',
            notes: 'observed 2026-06-01',
          },
        ],
      },
    });
    const hits = await correlateHandle('ddcti_test_actor', { cache });
    expect(hits.length).toBe(1);
    expect(hits[0].actor_id).toBe('test-actor');
    expect(hits[0].sources).toContain('deepdarkcti');
    expect(hits[0].note).toContain('2026-06-01');
  });
  it('skips DDC entries from non-Telegram categories', async () => {
    const cache = fakeCache({
      'https://deepdarkcti-cache.internal/v1': {
        entries: [
          {
            name: 'Discord Server',
            url: 'https://t.me/somehandle',
            onion: false,
            status: 'online',
            category: 'Discord',
            source_file: 'discord.md',
          },
        ],
      },
    });
    const hits = await correlateHandle('somehandle', { cache });
    expect(hits).toEqual([]);
  });
  it('merges DDC and catalog hits, raising confidence and adding both sources', async () => {
    const cache = fakeCache({
      'https://deepdarkcti-cache.internal/v1': {
        entries: [
          {
            name: 'LockBit',
            url: 'https://t.me/lockbitsupport',
            onion: false,
            status: 'online',
            category: 'Threat-Actor Telegram',
            source_file: 'telegram_threat_actors.md',
            actor: 'lockbit',
            attack_type: 'ransomware',
          },
        ],
      },
    });
    const hits = await correlateHandle('lockbitsupport', { cache });
    expect(hits.length).toBe(1);
    expect(hits[0].sources.sort()).toEqual(['catalog', 'deepdarkcti']);
    // Catalog baseline is 0.9, DDC adds 0.1, capped at 1.0.
    expect(hits[0].confidence).toBeCloseTo(1.0, 5);
  });
});
describe('correlateHandle — MISP', () => {
  it('surfaces actors with the associated-telegram-handle custom field', async () => {
    const cache = fakeCache({
      'https://misp-galaxy-actors.internal/v1': {
        values: [
          {
            value: 'MISP-THREAT-ACTOR-1',
            meta: {
              'associated-telegram-handle': 'misp_test_handle',
              country: 'Russia',
            },
          },
        ],
      },
    });
    const hits = await correlateHandle('misp_test_handle', { cache });
    expect(hits.length).toBe(1);
    expect(hits[0].actor_id).toBe('MISP-THREAT-ACTOR-1');
    expect(hits[0].sources).toContain('misp');
    expect(hits[0].country).toBe('Russia');
  });
  it('handles MISP associated-telegram-handle as an array', async () => {
    const cache = fakeCache({
      'https://misp-galaxy-actors.internal/v1': {
        values: [
          {
            value: 'MISP-THREAT-ACTOR-2',
            meta: { 'associated-telegram-handle': ['a', 'b'] },
          },
        ],
      },
    });
    expect((await correlateHandle('a', { cache })).length).toBe(1);
    expect((await correlateHandle('b', { cache })).length).toBe(1);
    expect((await correlateHandle('c', { cache })).length).toBe(0);
  });
});
describe('handlesForActor', () => {
  it('returns the catalog handles for an actor', async () => {
    const handles = await handlesForActor('apt28');
    expect(handles).toContain('apt28world');
  });
  it('returns [] for an unknown actor', async () => {
    const handles = await handlesForActor('this-actor-does-not-exist');
    expect(handles).toEqual([]);
  });
  it('merges DDC and catalog results', async () => {
    const cache = fakeCache({
      'https://deepdarkcti-cache.internal/v1': {
        entries: [
          {
            name: 'LockBit Mirror',
            url: 'https://t.me/lockbit_sup',
            onion: false,
            status: 'online',
            category: 'Threat-Actor Telegram',
            source_file: 'telegram_threat_actors.md',
            actor: 'lockbit',
            attack_type: 'ransomware',
          },
        ],
      },
    });
    const handles = await handlesForActor('lockbit', { cache });
    expect(handles.sort()).toEqual(['lockbit_sup', 'lockbitsupport']);
  });
});
