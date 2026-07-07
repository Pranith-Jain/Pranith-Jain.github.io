import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseDatamarkets,
  parseDefacements,
  toIso,
  MAX_ITEMS_PER_FEED,
  fetchAFDatamarkets,
  fetchAFDefacements,
  parseAFRansomwareVictims,
  parseAFDataleaks,
  type AFEntry,
} from '../../src/lib/andreafortuna-feeds';

const DATAMARKETS_FIXTURE: AFEntry[] = [
  {
    url: 'https://demonforums.net/Thread-test-pack',
    name: 'DemonForums - Test ULP Pack',
    source: 'demonforums',
    screenshot: 'https://urlscan.io/screenshots/abc.png',
    timestamp: '2026-05-15T02:08:01.440399',
    urlscan: 'https://urlscan.io/result/abc/',
    id: 'abc123',
  },
  {
    url: 'https://exploit.in/forum/thread-2',
    name: 'Exploit.in - Stolen DB',
    source: 'exploitin',
    timestamp: '2026-05-14T13:30:23.167810',
    id: 'def456',
  },
];

const DEFACEMENTS_FIXTURE: AFEntry[] = [
  {
    url: 'https://victim.example.com/index.html',
    name: 'Recent defacement reported by Hax.or: https://victim.example.com/index.html',
    source: 'hax',
    screenshot: '',
    timestamp: '2026-05-15T02:07:54.767388',
    id: 'xyz789',
  },
];

describe('toIso', () => {
  it('coerces AF microsecond timestamps to ISO 8601 with Z', () => {
    expect(toIso('2026-05-15T02:08:01.440399')).toBe('2026-05-15T02:08:01.440Z');
  });

  it('returns undefined for unparseable input', () => {
    expect(toIso('not-a-date')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(toIso('')).toBeUndefined();
  });
});

describe('parseDatamarkets', () => {
  it('maps AF entries to CybercrimeItem shape per spec §4.2', () => {
    const items = parseDatamarkets(DATAMARKETS_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'DemonForums - Test ULP Pack',
      url: 'https://demonforums.net/Thread-test-pack',
      source: 'andreafortuna-demonforums',
      category: 'underground-forums',
      published: '2026-05-15T02:08:01.440Z',
      description: 'Underground forum thread',
      tags: ['demonforums', 'credentials', 'forum'],
    });
  });

  it('uses the AF entry source value in the tags array', () => {
    const items = parseDatamarkets(DATAMARKETS_FIXTURE);
    expect(items[1]!.tags).toContain('exploitin');
  });

  it('skips malformed entries missing url or name without throwing', () => {
    const bad: AFEntry[] = [
      { url: '', name: 'no url', source: 'x', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://ok.example.com/', name: '', source: 'x', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://good.example.com/', name: 'good', source: 'x', timestamp: '2026-05-15T00:00:00' },
    ];
    const items = parseDatamarkets(bad);
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://good.example.com/');
  });

  it('caps output at MAX_ITEMS_PER_FEED', () => {
    const many: AFEntry[] = Array.from({ length: MAX_ITEMS_PER_FEED + 50 }, (_, i) => ({
      url: `https://demonforums.net/Thread-${i}`,
      name: `Thread ${i}`,
      source: 'demonforums',
      timestamp: '2026-05-15T02:08:01.440399',
    }));
    expect(parseDatamarkets(many)).toHaveLength(MAX_ITEMS_PER_FEED);
  });

  it('returns empty array for empty input', () => {
    expect(parseDatamarkets([])).toEqual([]);
  });
});

describe('parseDefacements', () => {
  it('maps AF entries to LiveIoc shape per spec §4.2', () => {
    const items = parseDefacements(DEFACEMENTS_FIXTURE);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      value: 'https://victim.example.com/index.html',
      kind: 'url',
      source: 'andreafortuna-defacements',
      reporter: 'hax.or',
      context: 'website defacement',
      observed_at: '2026-05-15T02:07:54.767Z',
    });
  });

  it('skips entries with no url', () => {
    const bad: AFEntry[] = [
      { url: '', name: 'no url', source: 'hax', timestamp: '2026-05-15T00:00:00' },
      { url: 'https://ok.example.com/', name: 'ok', source: 'hax', timestamp: '2026-05-15T00:00:00' },
    ];
    expect(parseDefacements(bad)).toHaveLength(1);
  });

  it('caps output at MAX_ITEMS_PER_FEED', () => {
    const many: AFEntry[] = Array.from({ length: MAX_ITEMS_PER_FEED + 50 }, (_, i) => ({
      url: `https://defaced-${i}.example.com/`,
      name: `Defacement ${i}`,
      source: 'hax',
      timestamp: '2026-05-15T02:07:54.767388',
    }));
    expect(parseDefacements(many)).toHaveLength(MAX_ITEMS_PER_FEED);
  });
});

describe('fetchAFDatamarkets / fetchAFDefacements', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetchAFDatamarkets returns parsed items on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            url: 'https://demonforums.net/Thread-1',
            name: 'DemonForums - test',
            source: 'demonforums',
            timestamp: '2026-05-15T02:08:01.440399',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const items = await fetchAFDatamarkets();
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://demonforums.net/Thread-1');
    expect(items[0]!.category).toBe('underground-forums');
  });

  it('fetchAFDatamarkets returns [] on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDatamarkets returns [] on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDatamarkets returns [] on malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    expect(await fetchAFDatamarkets()).toEqual([]);
  });

  it('fetchAFDefacements returns parsed items on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            url: 'https://victim.example.com/',
            name: 'Recent defacement reported by Hax.or: https://victim.example.com/',
            source: 'hax',
            timestamp: '2026-05-15T02:07:54.767388',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const items = await fetchAFDefacements();
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe('andreafortuna-defacements');
    expect(items[0]!.kind).toBe('url');
  });

  it('fetchAFDefacements returns [] when upstream gives non-array JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"oops": true}', { status: 200 }));
    expect(await fetchAFDefacements()).toEqual([]);
  });
});

describe('parseAFRansomwareVictims', () => {
  it('splits "Group: Victim - description" into structured fields', () => {
    const out = parseAFRansomwareVictims([
      {
        url: 'http://kyblog.onion',
        name: 'Kyber: L3HARRIS - L3Harris is a global aerospace and defense innovator',
        source: 'ransomlook',
        screenshot: '',
        timestamp: '2026-03-19T07:35:53.186331',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      victim: 'L3HARRIS',
      group: 'kyber',
      description: 'L3Harris is a global aerospace and defense innovator',
      source_url: 'http://kyblog.onion',
      origin: 'andreafortuna',
    });
    expect(out[0]!.discovered).toBe('2026-03-19T07:35:53.186Z');
  });

  it('handles entries with no description segment', () => {
    const out = parseAFRansomwareVictims([
      {
        url: 'http://x.onion',
        name: 'Loki: Credit Freedom & Restoration',
        source: 'ransomlook',
        screenshot: 'https://www.ransomlook.io/screenshots/loki/x.png',
        timestamp: '2026-03-12T18:27:54.917558',
      },
    ]);
    expect(out[0]).toMatchObject({
      victim: 'Credit Freedom & Restoration',
      group: 'loki',
      screen_url: 'https://www.ransomlook.io/screenshots/loki/x.png',
    });
    expect(out[0]!.description).toBeUndefined();
  });

  it('falls back to source as group when no colon present', () => {
    const out = parseAFRansomwareVictims([
      { url: 'http://y.onion', name: 'SomeVictimOnly', source: 'ransomlook', timestamp: '2026-01-01T00:00:00' },
    ]);
    expect(out[0]).toMatchObject({ victim: 'SomeVictimOnly', group: 'ransomlook' });
  });
});

describe('parseAFDataleaks', () => {
  it('parses HIBP-style name into title + pwn_count, slug as name', () => {
    const out = parseAFDataleaks([
      {
        url: 'https://haveibeenpwned.com/Breach/Abrigo',
        name: 'Have i been pwned? - Abrigo - 711,099 breached accounts',
        source: 'haveibeenpwned',
        timestamp: '2026-05-14T08:27:19.421028',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'Abrigo',
      title: 'Abrigo',
      pwn_count: 711099,
      verified: false,
      sensitive: false,
      origin: 'andreafortuna',
    });
    expect(out[0]!.added_date).toBe('2026-05-14T08:27:19.421Z');
  });

  it('handles a title with no pwn-count tail', () => {
    const out = parseAFDataleaks([
      {
        url: 'https://haveibeenpwned.com/Breach/FooCorp',
        name: 'Have i been pwned? - FooCorp',
        source: 'haveibeenpwned',
        timestamp: '2026-05-14T08:27:19.421028',
      },
    ]);
    expect(out[0]).toMatchObject({ name: 'FooCorp', title: 'FooCorp' });
    expect(out[0]!.pwn_count).toBeUndefined();
  });
});
