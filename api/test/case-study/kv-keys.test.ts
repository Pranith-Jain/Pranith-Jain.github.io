import { describe, it, expect } from 'vitest';
import { kv } from '../../src/case-study/kv-keys';

describe('kv key helpers', () => {
  it('candidates key includes type and stable key', () => {
    expect(kv.candidate('cve', 'cve-2026-1234')).toBe('candidates:cve:cve-2026-1234');
  });
  it('candidates type prefix is listable', () => {
    expect(kv.candidatesPrefix('cve')).toBe('candidates:cve:');
  });
  it('approved key', () => {
    expect(kv.approved('cve-2026-1234')).toBe('approved:cve-2026-1234');
  });
  it('post key uses slug', () => {
    expect(kv.post('cve-2026-1234-fortinet')).toBe('posts:cve-2026-1234-fortinet');
  });
  it('static keys', () => {
    expect(kv.scheduleUpcoming).toBe('schedule:upcoming');
    expect(kv.postsIndex).toBe('posts:index');
    expect(kv.metaRss).toBe('meta:rss');
  });
  it('dedup key', () => {
    expect(kv.dedup('cve-2026-1234')).toBe('meta:dedup:cve-2026-1234');
  });
  it('failed key', () => {
    expect(kv.failed('slot-2026-05-19')).toBe('failed:slot-2026-05-19');
  });
});
