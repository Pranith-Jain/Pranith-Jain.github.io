/**
 * Unit tests for telegram-firehose dedup (fingerprint + dedupeFeedItems).
 *
 * Pure functions, no network — offline + deterministic.
 *
 * Run locally (sandbox disabled) per docs/loops/api-tests-unsandboxed.md:
 *   npx vitest run test/routes/telegram-dedup.test.ts
 */

import { describe, it, expect } from 'vitest';
import { fingerprintItemText, dedupeFeedItems, type TelegramFeedItem } from '../../src/routes/telegram-feed';

function item(over: Partial<TelegramFeedItem> & { permalink: string }): TelegramFeedItem {
  return {
    channel_handle: 'ch1',
    channel_name: 'Ch 1',
    channel_topic: 'osint',
    channel_blurb: 'blurb',
    datetime: '2026-09-21T00:00:00.000Z',
    text: 'Some default sufficiently long message text for fingerprinting purposes here.',
    ...over,
  };
}

describe('fingerprintItemText', () => {
  it('folds case, punctuation and URLs', () => {
    const a = fingerprintItemText('BREAKING: CVE-2026-1234 RCE! Details: https://example.com/x');
    const b = fingerprintItemText('breaking cve 2026 1234 rce details');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it('returns null for short stubs so generic reactions never merge', () => {
    expect(fingerprintItemText('🔥')).toBeNull();
    expect(fingerprintItemText('+1 agree with this post')).toBeNull();
  });
});

describe('dedupeFeedItems', () => {
  it('drops exact permalink replays', () => {
    const items = [
      item({ permalink: 'https://t.me/ch/1', text: 'First unique message with enough length to fingerprint well ok' }),
      item({ permalink: 'https://t.me/ch/1', text: 'First unique message with enough length to fingerprint well ok' }),
    ];
    const { items: out, removed } = dedupeFeedItems(items);
    expect(out).toHaveLength(1);
    expect(removed).toBe(1);
  });

  it('collapses cross-channel syndicated copies, keeping the longer text', () => {
    // Same 200-char fingerprint: the longer copy extends the shared core text.
    const core =
      'Syndicated breach report about victim corp with exfiltrated data details here and additional context words to pass two hundred characters total length ok yes indeed extra padding text here now and then some more filler words to cross it';
    const items = [
      item({ permalink: 'https://t.me/a/1', channel_handle: 'a', text: core }),
      item({
        permalink: 'https://t.me/b/9',
        channel_handle: 'b',
        text: `${core} plus extra paragraphs of analysis appended`,
      }),
    ];
    const { items: out, removed } = dedupeFeedItems(items);
    expect(out).toHaveLength(1);
    expect(removed).toBe(1);
    // Longer copy wins.
    expect(out[0]!.channel_handle).toBe('b');
  });

  it('keeps distinct stories and short reactions apart', () => {
    const items = [
      item({
        permalink: 'https://t.me/a/1',
        text: 'Ransomware gang claims victim alpha in manufacturing sector today',
      }),
      item({
        permalink: 'https://t.me/b/2',
        text: 'Phishing kit targets banking customers across europe this week now',
      }),
      item({ permalink: 'https://t.me/c/3', text: '🔥' }),
      item({ permalink: 'https://t.me/d/4', text: '🔥' }),
    ];
    const { items: out, removed } = dedupeFeedItems(items);
    expect(out).toHaveLength(4);
    expect(removed).toBe(0);
  });

  it('is stable and deterministic on empty input', () => {
    expect(dedupeFeedItems([])).toEqual({ items: [], removed: 0 });
  });
});
