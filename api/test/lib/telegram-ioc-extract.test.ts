/**
 * Telegram IOC extractor tests.
 *
 * The extractor turns a `telegram_leak_entries` D1 row into a list of
 * `IocEntry` objects that drop into the cross-source correlation
 * pipeline. Tests focus on:
 *   - Hashes (MD5 / SHA-1 / SHA-256) with the all-digit / all-letter
 *     filter.
 *   - IPv4 + IPv4:port, with the reserved-range filter.
 *   - Domains from `domains_found` JSON + email-extracted domains.
 *   - URLs from `file_url` and `message_text` (with host extraction).
 *   - CVEs.
 *   - De-duplication and per-entry cap.
 *   - The D1 ingestor with a fake DB.
 */
import { describe, it, expect } from 'vitest';
import {
  extractIocsFromLeak,
  reliabilityForLeak,
  ingestTelegramLeaksFromD1,
  type TelegramLeakRow,
  type D1Like,
} from '../../src/lib/telegram-ioc-extract';

function baseRow(overrides: Partial<TelegramLeakRow> = {}): TelegramLeakRow {
  return {
    id: 1,
    channel_handle: 'secharvester',
    message_link: 'https://t.me/secharvester/1234',
    message_text: '',
    leak_type: 'ioc',
    credential_count: 0,
    file_url: null,
    domains_found: null,
    severity: 'medium',
    discovered_at: '2026-06-19T12:00:00Z',
    ...overrides,
  };
}

// ─── extractIocsFromLeak ────────────────────────────────────────────────────

describe('extractIocsFromLeak — hashes', () => {
  it('extracts a single SHA-256 hash', () => {
    const row = baseRow({
      message_text: 'New sample: 5d41402abc4b2a76b9719d911017c592a1c4bca7b7d8c5e2b3a4d5e6f7a8b9c0',
    });
    const out = extractIocsFromLeak(row);
    expect(
      out.some(
        (e) => e.type === 'hash' && e.value === '5d41402abc4b2a76b9719d911017c592a1c4bca7b7d8c5e2b3a4d5e6f7a8b9c0'
      )
    ).toBe(true);
  });

  it('extracts SHA-1 and MD5 from the same message', () => {
    const row = baseRow({
      message_text: 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d (sha1) and 5d41402abc4b2a76b9719d911017c592 (md5)',
    });
    const out = extractIocsFromLeak(row);
    const hashes = out.filter((e) => e.type === 'hash').map((e) => e.value);
    expect(hashes).toContain('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    expect(hashes).toContain('5d41402abc4b2a76b9719d911017c592');
  });

  it('rejects all-digit strings that match the SHA-256 length', () => {
    const row = baseRow({
      message_text: '1234567890123456789012345678901234567890123456789012345678901234',
    });
    const out = extractIocsFromLeak(row);
    expect(out.filter((e) => e.type === 'hash')).toEqual([]);
  });

  it('deduplicates repeated hashes', () => {
    const row = baseRow({
      message_text:
        'hash1: 5d41402abc4b2a76b9719d911017c592a1c4bca7b7d8c5e2b3a4d5e6f7a8b9c0\nhash2: 5d41402abc4b2a76b9719d911017c592a1c4bca7b7d8c5e2b3a4d5e6f7a8b9c0',
    });
    const out = extractIocsFromLeak(row);
    const sha = out.filter((e) => e.value === '5d41402abc4b2a76b9719d911017c592a1c4bca7b7d8c5e2b3a4d5e6f7a8b9c0');
    expect(sha.length).toBe(1);
  });
});

describe('extractIocsFromLeak — IPs', () => {
  it('extracts a plain IPv4', () => {
    const row = baseRow({ message_text: 'C2 at 198.51.100.42' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'ipv4' && e.value === '198.51.100.42')).toBe(true);
  });

  it('extracts IPv4:port and drops the port', () => {
    const row = baseRow({ message_text: 'C2 at 198.51.100.42:8443' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'ipv4' && e.value === '198.51.100.42')).toBe(true);
    expect(out.some((e) => e.value === '198.51.100.42:8443')).toBe(false);
  });

  it('rejects RFC1918 private ranges', () => {
    const row = baseRow({ message_text: '192.168.1.1 10.0.0.1 172.16.5.5' });
    const out = extractIocsFromLeak(row).filter((e) => e.type === 'ipv4');
    expect(out).toEqual([]);
  });

  it('rejects 0.0.0.0 and 127.0.0.1', () => {
    const row = baseRow({ message_text: '0.0.0.0 127.0.0.1' });
    const out = extractIocsFromLeak(row).filter((e) => e.type === 'ipv4');
    expect(out).toEqual([]);
  });

  it('rejects invalid octets', () => {
    const row = baseRow({ message_text: '999.999.999.999 1.2.3' });
    const out = extractIocsFromLeak(row).filter((e) => e.type === 'ipv4');
    expect(out).toEqual([]);
  });
});

describe('extractIocsFromLeak — domains', () => {
  it('extracts from the pre-computed domains_found JSON column', () => {
    const row = baseRow({
      domains_found: JSON.stringify(['example.com', 'malicious.test']),
      message_text: '',
    });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'domain' && e.value === 'example.com')).toBe(true);
    expect(out.some((e) => e.type === 'domain' && e.value === 'malicious.test')).toBe(true);
  });

  it('extracts domains from emails in the message text', () => {
    const row = baseRow({ message_text: 'creds leaked: user@example.com and admin@badactor.test' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'domain' && e.value === 'example.com')).toBe(true);
    expect(out.some((e) => e.type === 'domain' && e.value === 'badactor.test')).toBe(true);
  });

  it('deduplicates domains seen in both domains_found and message text', () => {
    const row = baseRow({
      domains_found: JSON.stringify(['example.com']),
      message_text: 'see user@example.com for details',
    });
    const out = extractIocsFromLeak(row).filter((e) => e.type === 'domain');
    const exampleCount = out.filter((e) => e.value === 'example.com').length;
    expect(exampleCount).toBe(1);
  });

  it('handles invalid JSON in domains_found gracefully', () => {
    const row = baseRow({ domains_found: 'this is not json', message_text: '' });
    const out = extractIocsFromLeak(row);
    expect(out).toEqual([]);
  });
});

describe('extractIocsFromLeak — URLs', () => {
  it('extracts a URL from file_url', () => {
    const row = baseRow({ file_url: 'https://malicious.example.com/payload.zip' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'url' && e.value === 'https://malicious.example.com/payload.zip')).toBe(true);
  });

  it('extracts a URL from message text and pulls the host into the domain bucket', () => {
    const row = baseRow({ message_text: 'Download: https://malicious.example.com/payload.zip' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'url' && e.value.startsWith('https://malicious.example.com'))).toBe(true);
    expect(out.some((e) => e.type === 'domain' && e.value === 'malicious.example.com')).toBe(true);
  });

  it('strips trailing punctuation', () => {
    const row = baseRow({ message_text: 'see https://example.com/path, also https://other.com/foo.' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.value === 'https://example.com/path')).toBe(true);
    expect(out.some((e) => e.value === 'https://other.com/foo')).toBe(true);
  });

  it('extracts IPv4 host from URL into the IP bucket', () => {
    const row = baseRow({ message_text: 'http://198.51.100.99/bad' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'ipv4' && e.value === '198.51.100.99')).toBe(true);
  });
});

describe('extractIocsFromLeak — CVEs', () => {
  it('extracts a single CVE', () => {
    const row = baseRow({ message_text: 'Active exploitation of CVE-2026-1234' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.type === 'cve' && e.value === 'CVE-2026-1234')).toBe(true);
  });

  it('extracts multiple CVEs from one message', () => {
    const row = baseRow({ message_text: 'See CVE-2026-1111 and CVE-2026-2222 for context' });
    const out = extractIocsFromLeak(row);
    const cves = out
      .filter((e) => e.type === 'cve')
      .map((e) => e.value)
      .sort();
    expect(cves).toEqual(['CVE-2026-1111', 'CVE-2026-2222']);
  });

  it('normalizes case to uppercase', () => {
    const row = baseRow({ message_text: 'cve-2026-1234 is bad' });
    const out = extractIocsFromLeak(row);
    expect(out.some((e) => e.value === 'CVE-2026-1234')).toBe(true);
  });
});

describe('extractIocsFromLeak — context and timestamp', () => {
  it('tags every IOC with the channel handle as context', () => {
    const row = baseRow({
      channel_handle: 'lockbitsupport',
      message_text: 'C2 at 198.51.100.7',
    });
    const out = extractIocsFromLeak(row);
    expect(out.every((e) => e.context === 'telegram:lockbitsupport')).toBe(true);
  });

  it('stamps every IOC with the leak discovered_at timestamp', () => {
    const row = baseRow({
      message_text: 'C2 at 198.51.100.7',
      discovered_at: '2026-06-19T12:00:00Z',
    });
    const out = extractIocsFromLeak(row);
    expect(out.every((e) => e.timestamp === '2026-06-19T12:00:00Z')).toBe(true);
  });
});

describe('extractIocsFromLeak — per-entry cap', () => {
  it('respects the perEntryCap parameter', () => {
    const row = baseRow({
      message_text: Array.from({ length: 200 }, (_, i) => `198.51.100.${(i % 254) + 1}`).join(' '),
    });
    const out = extractIocsFromLeak(row, { perEntryCap: 10 });
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it('defaults to 50', () => {
    const row = baseRow({
      message_text: Array.from({ length: 200 }, (_, i) => `198.51.100.${(i % 254) + 1}`).join(' '),
    });
    const out = extractIocsFromLeak(row);
    expect(out.length).toBeLessThanOrEqual(50);
  });
});

describe('extractIocsFromLeak — empty / edge cases', () => {
  it('returns [] for an empty message', () => {
    const out = extractIocsFromLeak(baseRow({ message_text: '' }));
    expect(out).toEqual([]);
  });

  it('returns [] for null message_text', () => {
    const out = extractIocsFromLeak(baseRow({ message_text: null }));
    expect(out).toEqual([]);
  });

  it('handles a message with no IOCs gracefully', () => {
    const out = extractIocsFromLeak(baseRow({ message_text: 'Just a comment with no IoCs or CVEs.' }));
    expect(out).toEqual([]);
  });
});

describe('reliabilityForLeak', () => {
  it('maps critical severity to B (usually reliable)', () => {
    expect(reliabilityForLeak(baseRow({ severity: 'critical' }))).toBe('B');
  });
  it('maps high to B', () => {
    expect(reliabilityForLeak(baseRow({ severity: 'high' }))).toBe('B');
  });
  it('maps medium to C (fairly reliable)', () => {
    expect(reliabilityForLeak(baseRow({ severity: 'medium' }))).toBe('C');
  });
  it('maps low to D (not usually reliable)', () => {
    expect(reliabilityForLeak(baseRow({ severity: 'low' }))).toBe('D');
  });
});

// ─── ingestTelegramLeaksFromD1 ──────────────────────────────────────────────

function fakeD1(rows: TelegramLeakRow[]): D1Like {
  return {
    prepare(_sql: string) {
      return {
        bind(_binds: unknown) {
          return {
            async all<T>(): Promise<{ results?: T[] }> {
              return { results: rows as T[] };
            },
          };
        },
      };
    },
  };
}

describe('ingestTelegramLeaksFromD1', () => {
  it('returns empty result when D1 is null/undefined', async () => {
    const a = await ingestTelegramLeaksFromD1(null);
    expect(a.entries).toEqual([]);
    expect(a.meta.ok).toBe(false);
    const b = await ingestTelegramLeaksFromD1(undefined);
    expect(b.entries).toEqual([]);
    expect(b.meta.ok).toBe(false);
  });

  it('extracts IOCs from every row in the result set', async () => {
    const db = fakeD1([
      baseRow({ id: 1, message_text: 'C2 at 198.51.100.5' }),
      baseRow({ id: 2, message_text: 'CVE-2026-9999 in the wild' }),
      baseRow({ id: 3, message_text: '' }),
    ]);
    const { entries, meta } = await ingestTelegramLeaksFromD1(db);
    expect(meta.ok).toBe(true);
    expect(meta.rowsScanned).toBe(3);
    expect(meta.iocsExtracted).toBe(entries.length);
    expect(meta.iocsExtracted).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.type === 'ipv4' && e.value === '198.51.100.5')).toBe(true);
    expect(entries.some((e) => e.type === 'cve' && e.value === 'CVE-2026-9999')).toBe(true);
  });

  it('passes the windowDays argument through to the meta', async () => {
    const db = fakeD1([]);
    const { meta } = await ingestTelegramLeaksFromD1(db, 14);
    expect(meta.windowDays).toBe(14);
  });

  it('uses the perEntryCap argument for every row', async () => {
    const db = fakeD1([
      baseRow({
        message_text: Array.from({ length: 100 }, (_, i) => `198.51.100.${(i % 254) + 1}`).join(' '),
      }),
    ]);
    const { entries } = await ingestTelegramLeaksFromD1(db, 7, 5);
    expect(entries.length).toBeLessThanOrEqual(5);
  });

  it('returns an empty result with the error message when the query throws', async () => {
    const db: D1Like = {
      prepare() {
        return {
          bind() {
            return {
              async all<T>(): Promise<{ results?: T[] }> {
                throw new Error('D1 unavailable');
              },
            };
          },
        };
      },
    };
    const { entries, meta } = await ingestTelegramLeaksFromD1(db);
    expect(entries).toEqual([]);
    expect(meta.ok).toBe(false);
    expect(meta.error).toBe('D1 unavailable');
  });
});
