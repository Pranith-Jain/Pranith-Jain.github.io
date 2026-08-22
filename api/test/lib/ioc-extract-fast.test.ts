import { describe, it, expect } from 'vitest';
import {
  extractObservables,
  refangDefanged,
  isValidIpv6,
} from '../../src/lib/ioc-extract-fast';

// Realistic mini threat report — single source of truth for the end-to-end
// counts assertion. Deliberately mixes defanged indicators, dedupe traps
// (URL hosts, email domains), and one redacted/invalid XMR string.
const REPORT = `INCIDENT REPORT #4712 - Credential Theft Wave

Analyst note: sample submitted by soc@example-org.com (internal).

Initial access exploited CVE-2024-21412 in an outdated proxy. The implant
beaconed to hxxps://cdn-update[.]com/a/gate.php and fetched a second stage
from 45.33.32.156:8080. DNS telemetry also flagged updates-cdn[.]com and
mail-verify(dot)net.

Payload hash (SHA-256):
  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

Persistence via HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run with
value C:\\Users\\jsmith\\AppData\\Roaming\\svchost.exe; secondary copy at
/usr/local/lib/libupdate.so. Synchronization object Global\\UpdateCheck
observed; Local\\SessionMutex secondary.

Wallet sweep suspected — victim address bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh,
laundering hop 0x71C7656EC7ab88b098defB751B7401B5f6d8976F, XMR payout
48jew8b1Ao... (redacted).

Related reporting: CVE-2023-36884, CVE-2024-21412.
Contact: threat-intel@example-org.com`;

describe('refangDefanged', () => {
  it('normalizes hXXp schemes, bracketed dots, word-dots, and at-markers', () => {
    const t = 'See hXXps://good[.]example/x and bad(dot)site.org plus admin[at]corp.com';
    const { text, count } = refangDefanged(t);
    expect(count).toBe(4);
    expect(text).toBe('See https://good.example/x and bad.site.org plus admin@corp.com');
  });

  it('leaves prose "(at)" and version-like dots untouched', () => {
    const t = 'We will ping you (at) noon; app v1.2 is fine. Contact a[@]b.co soon';
    const { text, count } = refangDefanged(t);
    expect(text).toContain('(at) noon');
    expect(text).toContain('v1.2 is fine');
    // Only the a[@]b.co marker should be rewritten.
    expect(count).toBe(1);
    expect(text).toContain('a@b.co');
  });

  it('returns count 0 for clean text', () => {
    const { text, count } = refangDefanged('plain https://clean.example/path text');
    expect(count).toBe(0);
    expect(text).toBe('plain https://clean.example/path text');
  });
});

describe('extractObservables — ipv4', () => {
  it('rejects out-of-range octets but accepts valid IPs', () => {
    const r = extractObservables('256.1.1.1 down, 1.2.3.256 down, fallback 192.168.0.1 up');
    expect(r.counts.ipv4).toBe(1);
    expect(r.observables.map((o) => o.value)).toEqual(['192.168.0.1']);
  });

  it('skips version-like and over-long dotted numbers', () => {
    const r = extractObservables('Shipped build v1.2.3.4 yesterday; seq 1.2.3.4.5 ignored.');
    expect(r.counts.ipv4).toBe(0);
    expect(r.counts.domain).toBe(0);
  });
});

describe('extractObservables — url', () => {
  it('strips trailing punctuation and unbalanced parens', () => {
    const r = extractObservables(
      'Download https://evil.example/payload.exe., mirror at https://x.example/a (fast)'
    );
    const urls = r.observables.filter((o) => o.type === 'url').map((o) => o.value);
    expect(urls).toContain('https://evil.example/payload.exe');
    expect(urls).toContain('https://x.example/a');
  });

  it('dedupes URL hosts by default but not with dedupeUrlHosts: false', () => {
    const base = 'C2 at https://evil.example/dl/p was observed.';
    expect(extractObservables(base).counts.domain).toBe(0);
    const opt = extractObservables(base, { dedupeUrlHosts: false });
    expect(opt.counts.domain).toBe(1);
    expect(opt.counts.url).toBe(1);
  });
});

describe('extractObservables — mutex', () => {
  it('matches Global\\{GUID-ish} and Local\\name forms', () => {
    const r = extractObservables(
      'Objects Global\\{4D51E8C2-9F2A-4B7D-A1C3-E5B60D92F114} and Local\\sess42 seen.'
    );
    const mutexes = r.observables.filter((o) => o.type === 'mutex').map((o) => o.value);
    expect(mutexes).toEqual([
      'Global\\{4D51E8C2-9F2A-4B7D-A1C3-E5B60D92F114}',
      'Local\\sess42',
    ]);
  });
});

describe('extractObservables — registry_key', () => {
  it('handles short and HKEY_ long-form keys', () => {
    const r = extractObservables(
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run plus ' +
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Evil persist.'
    );
    const keys = r.observables.filter((o) => o.type === 'registry_key').map((o) => o.value);
    expect(keys).toContain('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
    expect(keys).toContain('HKEY_LOCAL_MACHINE\\SOFTWARE\\Evil');
    expect(keys).toHaveLength(2);
  });
});

describe('extractObservables — file paths', () => {
  it('captures Windows drive paths and Unix paths under known dirs', () => {
    const r = extractObservables(
      'Dropped at C:\\Users\\dev\\AppData\\payload.exe and staged in /opt/stage2/implant.bin today'
    );
    expect(r.counts.file_path_windows).toBe(1);
    expect(r.counts.file_path_unix).toBe(1);
    expect(r.observables.find((o) => o.type === 'file_path_windows')?.value).toBe(
      'C:\\Users\\dev\\AppData\\payload.exe'
    );
    expect(r.observables.find((o) => o.type === 'file_path_unix')?.value).toBe(
      '/opt/stage2/implant.bin'
    );
  });
});

describe('extractObservables — crypto addresses', () => {
  it('accepts format-valid btc, eth, and xmr samples', () => {
    const xmr = '48' + 'A'.repeat(93);
    const r = extractObservables(
      [
        'P2PKH 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2 paid,',
        'bech32 bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 sent,',
        'ETH 0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe swept,',
        `XMR ${xmr} traced.`,
      ].join(' ')
    );
    expect(r.counts.btc_address).toBe(2);
    expect(r.counts.eth_address).toBe(1);
    expect(r.counts.xmr_address).toBe(1);
  });
});

describe('extractObservables — hashes and CVEs', () => {
  it('normalizes uppercase hashes to lowercase and classifies by length', () => {
    const md5 = 'D41D8CD98F00B204E9800998ECF8427E';
    const sha1 = 'A'.repeat(40);
    const sha256 = 'B'.repeat(64);
    const r = extractObservables(`Digests ${md5}, ${sha1}, ${sha256}.`);
    expect(r.counts.md5).toBe(1);
    expect(r.counts.sha1).toBe(1);
    expect(r.counts.sha256).toBe(1);
    expect(r.observables.every((o) => o.value === o.value.toLowerCase())).toBe(true);
  });

  it('uppercases CVE ids and dedupes repeats', () => {
    const r = extractObservables('CVE-2023-36884 and cve-2024-21762; CVE-2023-36884 again.');
    const cves = r.observables.filter((o) => o.type === 'cve').map((o) => o.value);
    expect(cves.sort()).toEqual(['CVE-2023-36884', 'CVE-2024-21762']);
  });
});

describe('extractObservables — ipv6', () => {
  it('validates compressed and full ipv6 forms structurally', () => {
    const r = extractObservables('Beacon from fe80::1 and 2001:0db8:0000:0000:0000:ff00:0042:8329 seen');
    const ips = r.observables.filter((o) => o.type === 'ipv6').map((o) => o.value);
    expect(ips).toContain('fe80::1');
    expect(ips).toHaveLength(2);
    expect(isValidIpv6('12:34:56')).toBe(false); // timestamp, not ipv6
    expect(isValidIpv6('00:11:22:33:44:55')).toBe(false); // MAC, not ipv6
  });
});

describe('extractObservables — dedupe and ordering', () => {
  it('keeps the FIRST occurrence index for duplicate values', () => {
    const text = 'evil.example first mention. Later evil.example again.';
    const r = extractObservables(text);
    const domains = r.observables.filter((o) => o.type === 'domain');
    expect(domains).toHaveLength(1);
    expect(domains[0]!.index).toBe(text.indexOf('evil.example'));
  });

  it('sorts observables by index ascending', () => {
    const r = extractObservables(REPORT);
    const idx = r.observables.map((o) => o.index);
    for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
  });
});

describe('extractObservables — truncation and empty input', () => {
  it('caps hits at maxHits and flags truncation', () => {
    const r = extractObservables('10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4 10.0.0.5', { maxHits: 3 });
    expect(r.truncated).toBe(true);
    expect(r.observables).toHaveLength(3);
    expect(r.counts.ipv4).toBe(3);
  });

  it('returns zeros for empty or indicator-free input', () => {
    for (const text of ['', 'nothing here at all']) {
      const r = extractObservables(text);
      expect(r.observables).toEqual([]);
      expect(r.refangedCount).toBe(0);
      expect(r.truncated).toBeUndefined();
      for (const key of Object.keys(r.counts)) expect(r.counts[key]).toBe(0);
    }
  });
});

describe('extractObservables — context', () => {
  it('cuts context from the ORIGINAL text (defang markers preserved)', () => {
    const r = extractObservables('Contact hxxp://c2[.]example.net/gate now for tasking');
    const urlHit = r.observables.find((o) => o.type === 'url');
    expect(urlHit?.value).toBe('http://c2.example.net/gate');
    expect(urlHit?.context).toContain('hxxp://c2[.]example.net');
    expect(urlHit?.context).not.toContain('http://c2.example.net');
  });
});

describe('extractObservables — full report fixture', () => {
  it('produces the exact expected counts object', () => {
    const r = extractObservables(REPORT);
    expect(r.counts).toEqual({
      ipv4: 1,
      ipv6: 0,
      domain: 2,
      url: 1,
      email: 2,
      md5: 0,
      sha1: 0,
      sha256: 1,
      cve: 2,
      mutex: 2,
      registry_key: 1,
      file_path_windows: 1,
      file_path_unix: 1,
      btc_address: 1,
      eth_address: 1,
      xmr_address: 0,
    });
    expect(r.refangedCount).toBe(4);
    expect(r.truncated).toBeUndefined();
  });

  it('resolves the defanged URL and its host exactly once', () => {
    const r = extractObservables(REPORT);
    expect(r.observables.find((o) => o.type === 'url')?.value).toBe(
      'https://cdn-update.com/a/gate.php'
    );
    expect(r.observables.filter((o) => o.type === 'domain').map((o) => o.value).sort()).toEqual([
      'mail-verify.net',
      'updates-cdn.com',
    ]);
  });
});
