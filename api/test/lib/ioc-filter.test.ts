import { describe, it, expect } from 'vitest';
import { filterIocs, filterIocEntries, extractInfrastructure, SOURCE_DOMAINS } from '../../src/lib/agent/ioc-filter';

describe('filterIocs', () => {
  it('drops source/citation domains (ransomlook.io, virustotal.com, etc.)', () => {
    const result = filterIocs(['ransomlook.io', 'virustotal.com', 'c2.attacker-net.com', '1.2.3.4']);
    expect(result).toContain('c2.attacker-net.com');
    expect(result).toContain('1.2.3.4');
    expect(result).not.toContain('ransomlook.io');
    expect(result).not.toContain('virustotal.com');
  });

  it('drops email addresses (foo@duck.com)', () => {
    const result = filterIocs(['xenoz84@duck.com', 'evil.tld', 'attacker@protonmail.com']);
    expect(result).not.toContain('xenoz84@duck.com');
    expect(result).not.toContain('attacker@protonmail.com');
    expect(result).toContain('evil.tld');
  });

  it('drops private/reserved IP ranges', () => {
    const result = filterIocs(['10.0.0.1', '192.168.1.1', '172.16.0.1', '127.0.0.1', '8.8.8.8', '89.245.139.187']);
    expect(result).not.toContain('10.0.0.1');
    expect(result).not.toContain('192.168.1.1');
    expect(result).not.toContain('172.16.0.1');
    expect(result).not.toContain('127.0.0.1');
    expect(result).toContain('8.8.8.8');
    expect(result).toContain('89.245.139.187');
  });

  it('drops webmail domains (duck.com, gmail.com)', () => {
    const result = filterIocs(['duck.com', 'gmail.com', 'c2.attacker.com']);
    expect(result).not.toContain('duck.com');
    expect(result).not.toContain('gmail.com');
    expect(result).toContain('c2.attacker.com');
  });

  it('deduplicates', () => {
    const result = filterIocs(['evil.com', 'evil.com', '1.2.3.4', '1.2.3.4']);
    expect(result).toEqual(['evil.com', '1.2.3.4']);
  });

  it('preserves case for hashes (SHA-256)', () => {
    const hash = '6F6EE01E9DC2D8C4C260EF4131FE88DC152E53EE8AFD3E66E92D4E1BF5FD2E92';
    const result = filterIocs([hash]);
    expect(result).toContain(hash);
  });

  it('drops the Qilin false IOCs from the real report', () => {
    // These are the exact false IOCs the Qilin report surfaced
    const falseIocs = [
      'duck.com', // from xenoz84@duck.com email
      'www.ransomlook.io', // citation URL
      'ransomlook.io', // citation URL
      'elumax.com', // victim domain
      'www.elumax.com', // victim domain
      'lasevillanita.com', // victim domain
      'www.integer.net', // victim domain
    ];
    const result = filterIocs(falseIocs);
    // duck.com and ransomlook.io are dropped; victim domains are NOT in SOURCE_DOMAINS
    // (we can't know all victim domains) — but they shouldn't appear if the LLM
    // only puts real attacker IOCs in the action-card.
    expect(result).not.toContain('duck.com');
    expect(result).not.toContain('ransomlook.io');
    expect(result).not.toContain('www.ransomlook.io');
  });
});

describe('filterIocEntries', () => {
  it('filters typed IOC entries by the same rules', () => {
    const entries = [
      { type: 'domain' as const, value: 'ransomlook.io', confidence: 'Probable' as const },
      { type: 'domain' as const, value: 'c2.attacker.com', confidence: 'Confirmed' as const },
      { type: 'ipv4' as const, value: '192.168.1.1', confidence: 'Probable' as const },
      { type: 'ipv4' as const, value: '89.245.139.187', confidence: 'Confirmed' as const },
    ];
    const result = filterIocEntries(entries);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.value)).toContain('c2.attacker.com');
    expect(result.map((r) => r.value)).toContain('89.245.139.187');
    expect(result.map((r) => r.value)).not.toContain('ransomlook.io');
    expect(result.map((r) => r.value)).not.toContain('192.168.1.1');
  });
});

describe('extractInfrastructure', () => {
  it('extracts .onion leak-site URLs', () => {
    const steps = [
      {
        tool: 'get_ransomware_group_profile',
        data: { leak_url: 'http://qilinblogxyz4aiyfxes5njqm7t6i5ib6t4bxg4uqisi6f3nks2e3fjid.onion/' },
      },
    ];
    const result = extractInfrastructure(steps);
    expect(result.some((a) => a.type === 'onion' && a.value.includes('.onion'))).toBe(true);
    expect(result.some((a) => a.type === 'leak_site')).toBe(true);
  });

  it('extracts bitcoin payment addresses', () => {
    const steps = [
      {
        tool: 'get_ransomware_group_profile',
        data: { payment: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
      },
    ];
    const result = extractInfrastructure(steps);
    expect(result.some((a) => a.type === 'payment_address' && a.value.startsWith('bc1'))).toBe(true);
  });

  it('extracts name servers from DNS results', () => {
    const steps = [
      {
        tool: 'lookup_domain',
        data: { name_servers: ['NS.INWX.DE', 'NS2.INWX.DE'] },
      },
    ];
    const result = extractInfrastructure(steps);
    expect(result.some((a) => a.type === 'nameserver' && a.value === 'ns.inwx.de')).toBe(true);
  });

  it('extracts resolved IPs (public only, drops private)', () => {
    const steps = [
      {
        tool: 'passive_dns_lookup',
        data: { records: [{ ip: '89.245.139.187' }, { ip: '192.168.1.1' }, { ip: '8.8.8.8' }] },
      },
    ];
    const result = extractInfrastructure(steps);
    const ips = result.filter((a) => a.type === 'resolved_ip').map((a) => a.value);
    expect(ips).toContain('89.245.139.187');
    expect(ips).toContain('8.8.8.8');
    expect(ips).not.toContain('192.168.1.1');
  });

  it('extracts subdomains from passive DNS (drops source domains)', () => {
    const steps = [
      {
        tool: 'passive_dns_lookup',
        data: { subdomains: ['media4football.evil.tld', 'www.ransomlook.io'] },
      },
    ];
    const result = extractInfrastructure(steps);
    const subs = result.filter((a) => a.type === 'subdomain').map((a) => a.value);
    expect(subs).toContain('media4football.evil.tld');
    expect(subs).not.toContain('www.ransomlook.io');
  });

  it('deduplicates artifacts', () => {
    const steps = [
      { tool: 'lookup_domain', data: { ip: '89.245.139.187' } },
      { tool: 'passive_dns_lookup', data: { records: [{ ip: '89.245.139.187' }] } },
    ];
    const result = extractInfrastructure(steps);
    const ipCount = result.filter((a) => a.value === '89.245.139.187').length;
    expect(ipCount).toBe(1);
  });

  it('returns empty for steps with no data', () => {
    const steps = [{ tool: 'check_ioc', data: undefined }];
    expect(extractInfrastructure(steps)).toHaveLength(0);
  });

  it('caps at 50 artifacts', () => {
    const ips = Array.from({ length: 60 }, (_, i) => ({ ip: `203.0.113.${i}` }));
    const steps = [{ tool: 'passive_dns_lookup', data: { records: ips } }];
    expect(extractInfrastructure(steps).length).toBeLessThanOrEqual(50);
  });
});

describe('SOURCE_DOMAINS', () => {
  it('includes the key reputation/feed/tracker domains', () => {
    expect(SOURCE_DOMAINS.has('ransomlook.io')).toBe(true);
    expect(SOURCE_DOMAINS.has('ransomware.live')).toBe(true);
    expect(SOURCE_DOMAINS.has('virustotal.com')).toBe(true);
    expect(SOURCE_DOMAINS.has('duck.com')).toBe(true);
    expect(SOURCE_DOMAINS.has('gmail.com')).toBe(true);
  });
});

describe('extractVictimDomains', () => {
  it('extracts victim domains from ransomware activity tool results', async () => {
    const { extractVictimDomains } = await import('../../src/lib/agent/ioc-filter');
    const steps = [
      {
        tool: 'get_ransomware_activity',
        data: {
          posts: [
            { victim: 'elumax.com', group: 'qilin', source_url: 'https://www.ransomlook.io/blog/elumax' },
            {
              victim: 'Kewaunee Scientific',
              group: 'qilin',
              source_url: 'https://www.ransomlook.io/companies/kewaunee',
            },
            { victim: 'lasevillanita.com', group: 'qilin' },
          ],
        },
      },
    ];
    const victims = extractVictimDomains(steps);
    expect(victims.has('elumax.com')).toBe(true);
    expect(victims.has('lasevillanita.com')).toBe(true);
    // ransomlook.io is a source domain — should NOT be in victims
    expect(victims.has('ransomlook.io')).toBe(false);
  });

  it('does not extract from non-ransomware tools (IOC enrichment)', async () => {
    const { extractVictimDomains } = await import('../../src/lib/agent/ioc-filter');
    const steps = [{ tool: 'check_ioc', data: { ioc: 'evil-c2.attacker.com', reputation: 'malicious' } }];
    const victims = extractVictimDomains(steps);
    expect(victims.size).toBe(0);
  });
});

describe('filterIocEntriesWithVictims', () => {
  it('drops victim domains from the action-card IOC list', async () => {
    const { filterIocEntriesWithVictims } = await import('../../src/lib/agent/ioc-filter');
    const entries = [
      { type: 'domain' as const, value: 'elumax.com', confidence: 'Probable' as const },
      { type: 'domain' as const, value: 'lasevillanita.com', confidence: 'Probable' as const },
      { type: 'domain' as const, value: 'c2.attacker.com', confidence: 'Confirmed' as const },
      { type: 'domain' as const, value: 'duck.com', confidence: 'Probable' as const },
      { type: 'ipv4' as const, value: '89.245.139.187', confidence: 'Confirmed' as const },
    ];
    const steps = [
      {
        tool: 'get_ransomware_activity',
        data: { posts: [{ victim: 'elumax.com' }, { victim: 'lasevillanita.com' }] },
      },
    ];
    const filtered = filterIocEntriesWithVictims(entries, steps);
    const values = filtered.map((e) => e.value);
    expect(values).not.toContain('elumax.com');
    expect(values).not.toContain('lasevillanita.com');
    expect(values).not.toContain('duck.com');
    expect(values).toContain('c2.attacker.com');
    expect(values).toContain('89.245.139.187');
  });

  it('drops subdomains of victim domains', async () => {
    const { filterIocEntriesWithVictims } = await import('../../src/lib/agent/ioc-filter');
    const entries = [
      { type: 'domain' as const, value: 'www.elumax.com', confidence: 'Probable' as const },
      { type: 'domain' as const, value: 'mail.elumax.com', confidence: 'Probable' as const },
      { type: 'domain' as const, value: 'c2.attacker.com', confidence: 'Confirmed' as const },
    ];
    const steps = [{ tool: 'get_ransomware_activity', data: { posts: [{ victim: 'elumax.com' }] } }];
    const filtered = filterIocEntriesWithVictims(entries, steps);
    const values = filtered.map((e) => e.value);
    expect(values).not.toContain('www.elumax.com');
    expect(values).not.toContain('mail.elumax.com');
    expect(values).toContain('c2.attacker.com');
  });
});
