/**
 * Tests for the worker-side stateless TG live search core.
 * Run via: npx vitest run worker/lib/tg-live-search.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tgLiveSearch, parsePreviewMessages, isValidChannelHandle } from './tg-live-search';

const NOW = new Date().toISOString();

function channelHtml(handle: string, posts: { id: number; text: string }[]): string {
  return posts
    .map(
      (p) => `<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text" dir="auto">${p.text}</div>
    <a class="tgme_widget_message_date" href="https://t.me/${handle}/${p.id}"><time datetime="${NOW}">x</time></a>
  </div>
</div>`
    )
    .join('\n');
}

beforeEach(() => vi.restoreAllMocks());

describe('parsePreviewMessages', () => {
  it('extracts permalink/datetime/text with the route selectors', () => {
    const msgs = parsePreviewMessages(channelHtml('CVEDetector', [{ id: 1, text: 'CVE-2026-1 RCE<br>patch now' }]));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.permalink).toContain('t.me/CVEDetector/1');
    expect(msgs[0]?.text).toContain('CVE-2026-1 RCE\npatch now');
  });

  it('skips blocks without permalink/datetime', () => {
    expect(parsePreviewMessages('<div class="tgme_widget_message_wrap">no fields</div>')).toHaveLength(0);
  });
});

describe('isValidChannelHandle', () => {
  it('accepts handles with optional @', () => {
    expect(isValidChannelHandle('CVEDetector')).toBe(true);
    expect(isValidChannelHandle('@ctiwatch')).toBe(true);
    expect(isValidChannelHandle('bad-handle!')).toBe(false);
    expect(isValidChannelHandle('ab')).toBe(false);
  });
});

describe('tgLiveSearch', () => {
  function mock(map: Record<string, string | null>) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const m = /t\.me\/s\/([^/?]+)/.exec(url);
      const html = m ? map[m[1]!] : undefined;
      if (html == null) return new Response('nf', { status: 404 });
      return new Response(html, { status: 200 });
    });
  }

  it('AND-matches tokens and returns snippets newest-first', async () => {
    mock({
      CVEDetector: channelHtml('CVEDetector', [{ id: 7, text: 'CVE-2026-1234 critical RCE — patch immediately' }]),
    });
    const r = await tgLiveSearch('CVE-2026-1234 rce', ['CVEDetector']);
    expect(r.count).toBe(1);
    expect(r.hits[0]?.matched).toEqual(['cve-2026-1234', 'rce']);
    expect(r.channels[0]).toMatchObject({ handle: 'CVEDetector', ok: true, messages: 1 });
  });

  it('reports dead channels as diagnostics, keeps going', async () => {
    mock({ CVEDetector: channelHtml('CVEDetector', [{ id: 1, text: 'cve news' }]) });
    const r = await tgLiveSearch('cve', ['CVEDetector', 'breachdetect', 'bad-handle!']);
    expect(r.channels.find((c) => c.handle === 'breachdetect')?.ok).toBe(false);
    expect(r.channels.find((c) => c.handle === 'bad-handle!')?.note).toBe('invalid handle');
  });

  it('caps results', async () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: i, text: `cve item ${i}` }));
    mock({ CVEDetector: channelHtml('CVEDetector', posts) });
    const r = await tgLiveSearch('cve', ['CVEDetector'], { maxResults: 3 });
    expect(r.count).toBe(3);
  });
});
