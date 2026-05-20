import { describe, it, expect } from 'vitest';
import { PRIVATE_IPV4, isPrivateIpv6 } from '../../src/lib/ssrf-guard';

describe('PRIVATE_IPV4', () => {
  const blocked = [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1', // CGNAT
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.255',
    '168.63.129.16', // Azure metadata — added in this fix
    '169.254.169.254', // AWS / GCP / DO / Oracle metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1', // multicast
    '255.255.255.255', // broadcast
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => {
      expect(PRIVATE_IPV4.test(ip)).toBe(true);
    });
  }

  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '168.63.129.15', // adjacent to Azure metadata — must NOT match
    '168.63.129.17',
    '169.255.0.1', // adjacent to 169.254/16
    '100.63.255.255', // adjacent to CGNAT
    '100.128.0.1',
    '11.0.0.1',
    '99.99.99.99',
  ];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => {
      expect(PRIVATE_IPV4.test(ip)).toBe(false);
    });
  }
});

describe('isPrivateIpv6', () => {
  const blocked = [
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:168.63.129.16', // Azure metadata via mapped v4 — should re-apply v4 rule
    'fe80::1', // link-local
    'fec0::1', // legacy site-local — fe[89ab] (catches feb but not fec)
    'fc00::1', // unique-local
    'fd12:3456::1',
    'ff02::1', // multicast
    '2001:db8::1', // documentation
    '2002::1', // 6to4
    '64:ff9b::1', // NAT64
  ];
  for (const addr of blocked) {
    it(`blocks ${addr}`, () => {
      expect(isPrivateIpv6(addr)).toBe(true);
    });
  }

  const allowed = [
    '2606:4700:4700::1111', // Cloudflare DNS
    '2001:4860:4860::8888', // Google DNS
    '2620:fe::fe', // Quad9
  ];
  for (const addr of allowed) {
    it(`allows ${addr}`, () => {
      expect(isPrivateIpv6(addr)).toBe(false);
    });
  }
});
