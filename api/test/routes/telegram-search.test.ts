/**
 * tgstat HTML parser unit tests.
 *
 * Tests use synthetic HTML fixtures modeled on the live tgstat SSR
 * shell. When tgstat's HTML changes the tests fail loudly so we know
 * to update the parser.
 */
import { describe, it, expect } from 'vitest';
import {
  parseTgstatSearch,
  parseCount,
  extractDescription,
  extractMeta,
} from '../../src/routes/telegram-search';

const FIXTURE_HTML = `
<html>
<body>
  <div class="media">
    <div class="media-body">
      <a href="/en/channel/@vxunderground" class="text-body">
        <h5 class="mb-0">@vxunderground</h5>
        <div class="text-muted">vx-underground</div>
      </a>
      <div class="text-muted">Largest public malware-source-code archive</div>
      <div class="text-muted font-12">125.5K subscribers · 4 posts/day</div>
    </div>
  </div>
  <div class="media">
    <div class="media-body">
      <a href="/en/channel/@RansomLook" class="text-body">
        <h5 class="mb-0">@RansomLook</h5>
        <div class="text-muted">RansomLook</div>
      </a>
      <div class="text-muted">Ransomware operator tracker</div>
      <div class="text-muted font-12">4.8K subscribers · 1.1 posts/day</div>
    </div>
  </div>
  <div class="media">
    <div class="media-body">
      <a href="/en/channel/@hack_channel_with_no_meta" class="text-body">
        <h5 class="mb-0">@hack_channel_with_no_meta</h5>
        <div class="text-muted">no meta</div>
      </a>
    </div>
  </div>
</body>
</html>
`;

describe('parseCount', () => {
  it('parses bare integers', () => {
    expect(parseCount('456', undefined)).toBe(456);
  });
  it('parses K suffix', () => {
    expect(parseCount('12.5', 'K')).toBe(12_500);
    expect(parseCount('4.8', 'K')).toBe(4_800);
  });
  it('parses M suffix', () => {
    expect(parseCount('1.2', 'M')).toBe(1_200_000);
  });
  it('strips commas', () => {
    expect(parseCount('1,234', undefined)).toBe(1_234);
  });
  it('returns null for non-numeric input', () => {
    expect(parseCount('abc', undefined)).toBe(null);
  });
});

describe('parseTgstatSearch', () => {
  it('extracts handle, name, description from each card', () => {
    const out = parseTgstatSearch(FIXTURE_HTML);
    expect(out.length).toBe(3);
    expect(out[0]!.handle).toBe('vxunderground');
    expect(out[0]!.name).toBe('vx-underground');
    expect(out[0]!.description).toContain('malware-source-code');
    expect(out[0]!.tgstat_url).toBe('https://tgstat.com/en/channel/@vxunderground');
  });

  it('parses subscriber + posts-per-day from the meta div', () => {
    const out = parseTgstatSearch(FIXTURE_HTML);
    expect(out[0]!.subscribers).toBe(125_500);
    expect(out[0]!.posts_per_day).toBe(4);
    expect(out[1]!.subscribers).toBe(4_800);
    expect(out[1]!.posts_per_day).toBe(1.1);
  });

  it('tolerates missing meta (subscribers null, posts null)', () => {
    const out = parseTgstatSearch(FIXTURE_HTML);
    const last = out[2]!;
    expect(last.handle).toBe('hack_channel_with_no_meta');
    expect(last.subscribers).toBe(null);
    expect(last.posts_per_day).toBe(null);
  });

  it('deduplicates repeated handles', () => {
    const dup = FIXTURE_HTML + FIXTURE_HTML;
    expect(parseTgstatSearch(dup).length).toBe(3);
  });

  it('returns [] for empty input', () => {
    expect(parseTgstatSearch('')).toEqual([]);
    expect(parseTgstatSearch('<html></html>')).toEqual([]);
  });

  it('tags every result with source=tgstat', () => {
    const out = parseTgstatSearch(FIXTURE_HTML);
    expect(out.every((r) => r.source === 'tgstat')).toBe(true);
  });
});

describe('extractDescription + extractMeta', () => {
  it('extracts the second text-muted div as the description', () => {
    const desc = extractDescription(`
      <div class="text-muted">@handle</div>
      <div class="text-muted">First description</div>
    `);
    expect(desc).toBe('First description');
  });

  it('falls back to empty string when description missing', () => {
    expect(extractDescription('<div class="text-muted">only one</div>')).toBe('');
  });

  it('extracts subscriber + posts from font-12 meta div', () => {
    const meta = extractMeta('<div class="text-muted font-12">12.5K subscribers · 4 posts/day</div>');
    expect(meta.subscribers).toBe(12_500);
    expect(meta.posts_per_day).toBe(4);
  });
});
