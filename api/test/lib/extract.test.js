import { describe, it, expect } from 'vitest';
import { extract, extractActors, extractCves, extractIocs, extractMalware, extractTags, makeSummary, } from '../../src/lib/extract';
// The screenshot's APT28 brief — single source of truth for end-to-end tests.
const APT28_BRIEF = `APT28 Targets European Government Entities

Microsoft Threat Intelligence Center (MSTIC) has observed APT28 (Fancy Bear/STRONTIUM) conducting spear-phishing campaigns targeting European government entities throughout Q4 2024. The campaigns leverage spoofed diplomatic communications and exploit CVE-2023-36884 to deliver a new variant of the CremShell malware. Second-wave attacks utilized compromised legitimate accounts, with escalation in December involving direct exploitation attempts against government networks.

Indicators:
  diplo-service.com
  update-service.info
  https://cremshell-c2.xyz/api/report
  https://foreign-affairs.eu/dl/docs.php
  8.8.8.8
  5d41402abc4b2a76b9719d911017c592
  CVE-2024-21762`;
describe('extractIocs — regression for bugs found in prod audit', () => {
    it('extracts IPv6 addresses (combolist filter no longer over-matches)', () => {
        const iocs = extractIocs('Beacon observed at 2001:db8::1 and another at fe80::1.');
        const v6 = iocs.filter((i) => i.type === 'ipv6');
        expect(v6.map((i) => i.value)).toContain('2001:db8::1');
        expect(v6.map((i) => i.value)).toContain('fe80::1');
    });
    it('does NOT emit a domain IoC for the host portion of an email', () => {
        const iocs = extractIocs('Phishing sender: attacker@evil.example reported.');
        const emails = iocs.filter((i) => i.type === 'email').map((i) => i.value);
        const domains = iocs.filter((i) => i.type === 'domain').map((i) => i.value);
        expect(emails).toContain('attacker@evil.example');
        expect(domains).not.toContain('evil.example');
    });
    it('does NOT emit a domain IoC for the host portion of a URL', () => {
        const iocs = extractIocs('C2 at https://evil.example/dl/payload was observed.');
        const urls = iocs.filter((i) => i.type === 'url');
        const domains = iocs.filter((i) => i.type === 'domain').map((i) => i.value);
        expect(urls).toHaveLength(1);
        expect(domains).not.toContain('evil.example');
    });
    it('still emits a domain when it stands alone in the text', () => {
        const iocs = extractIocs('Reported domain bad.example was flagged.');
        const domains = iocs.filter((i) => i.type === 'domain').map((i) => i.value);
        expect(domains).toContain('bad.example');
    });
    it('detects SHA-512 (128 hex chars) hashes', () => {
        const sha512 = 'a'.repeat(128);
        const iocs = extractIocs(`SHA-512 ${sha512} flagged.`);
        expect(iocs.find((i) => i.type === 'hash' && i.value === sha512)).toBeTruthy();
    });
    it('drops literal user:password tokens (combolist guard still works)', () => {
        const iocs = extractIocs('Leaked combo: admin:hunter2 and root:toor in dump.');
        // Neither side should sneak through as a "domain" or anything else.
        expect(iocs.find((i) => i.value === 'admin:hunter2')).toBeUndefined();
        expect(iocs.find((i) => i.value === 'root:toor')).toBeUndefined();
    });
});
describe('extractIocs', () => {
    it('extracts domains, URLs, IPs, and hashes', () => {
        const iocs = extractIocs(APT28_BRIEF);
        const values = iocs.map((i) => i.value);
        expect(values).toContain('diplo-service.com');
        expect(values).toContain('update-service.info');
        expect(values).toContain('https://cremshell-c2.xyz/api/report');
        expect(values).toContain('https://foreign-affairs.eu/dl/docs.php');
        expect(values).toContain('8.8.8.8');
        expect(values).toContain('5d41402abc4b2a76b9719d911017c592');
    });
    it('refangs defanged forms', () => {
        const iocs = extractIocs('Reported domain: evil[.]com and hxxps://bad[.]example/login');
        const values = iocs.map((i) => i.value);
        expect(values).toContain('evil.com');
        expect(values.some((v) => v.startsWith('https://bad.example'))).toBe(true);
    });
    it('classifies indicator types correctly', () => {
        const iocs = extractIocs(APT28_BRIEF);
        const byType = {};
        for (const i of iocs)
            (byType[i.type] ??= []).push(i.value);
        expect(byType.url?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(byType.domain?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(byType.ipv4).toContain('8.8.8.8');
        expect(byType.hash).toContain('5d41402abc4b2a76b9719d911017c592');
    });
    it('dedupes case-insensitively', () => {
        const iocs = extractIocs('Evil.com referenced twice: evil.com / EVIL.COM');
        const domains = iocs.filter((i) => i.type === 'domain');
        expect(domains).toHaveLength(1);
    });
    it('drops combolist-style user:pass tokens', () => {
        const iocs = extractIocs('Leaked: john@example.com:hunter2 password dump.');
        // Email itself is fine; the combolist form `email:password` must not
        // sneak through as a fake "domain" or "url".
        const values = iocs.map((i) => i.value);
        expect(values.every((v) => !v.includes('hunter2'))).toBe(true);
    });
    it('ignores schema/example domains', () => {
        const iocs = extractIocs('See example.com / example.org / attack.mitre.org for references.');
        expect(iocs.filter((i) => i.type === 'domain')).toHaveLength(0);
    });
    it('returns [] for empty or garbage input', () => {
        expect(extractIocs('')).toEqual([]);
        expect(extractIocs('lorem ipsum dolor sit amet')).toEqual([]);
    });
});
describe('extractActors', () => {
    it('matches APT28 across all known aliases', () => {
        expect(extractActors('Reported by APT28 last week.')).toHaveLength(1);
        expect(extractActors('Fancy Bear infrastructure flagged.')[0]?.slug).toBe('apt28');
        expect(extractActors('STRONTIUM activity observed.')[0]?.slug).toBe('apt28');
        expect(extractActors('Forest Blizzard campaign.')[0]?.slug).toBe('apt28');
    });
    it('dedupes by slug — APT28 + Fancy Bear in the same text emits one actor', () => {
        const got = extractActors(APT28_BRIEF);
        const apt28s = got.filter((a) => a.slug === 'apt28');
        expect(apt28s).toHaveLength(1);
        expect(apt28s[0]?.mitreId).toBe('G0007');
    });
    it('returns empty when no known actor is mentioned', () => {
        expect(extractActors('A generic security advisory with no group named.')).toEqual([]);
    });
    it('does not match substrings inside larger words', () => {
        // 'akira' is in the dict; 'akirah' should not match.
        expect(extractActors('Mr Akirah filed a report.')).toEqual([]);
    });
});
describe('extractMalware', () => {
    it('matches CremShell from the APT28 brief', () => {
        const got = extractMalware(APT28_BRIEF);
        expect(got.map((m) => m.canonical)).toContain('CremShell');
    });
    it('matches Cobalt Strike with its aliases', () => {
        expect(extractMalware('Beacon configuration extracted.')[0]?.slug).toBe('cobaltstrike');
        expect(extractMalware('CobaltStrike beacons observed.')[0]?.slug).toBe('cobaltstrike');
    });
    it('dedupes — multiple aliases of one family emit one entry', () => {
        const got = extractMalware('Qbot / QakBot / Pinkslipbot all surface in the same campaign.');
        expect(got).toHaveLength(1);
        expect(got[0]?.slug).toBe('qakbot');
    });
});
describe('extractCves', () => {
    it('extracts and de-duplicates CVE IDs', () => {
        const got = extractCves('Exploits CVE-2023-36884 and CVE-2024-21762. CVE-2023-36884 was patched.');
        expect(got.map((c) => c.id).sort()).toEqual(['CVE-2023-36884', 'CVE-2024-21762']);
    });
    it('returns [] when no CVE in text', () => {
        expect(extractCves('No vulnerability mentioned here.')).toEqual([]);
    });
});
describe('extractTags', () => {
    it('matches multi-word and aliased keywords from the APT28 brief', () => {
        const tags = extractTags(APT28_BRIEF);
        expect(tags).toContain('spear-phishing');
        expect(tags).toContain('government');
        expect(tags).toContain('diplomatic lure');
    });
    it('respects alias collapsing — "BEC" → "business email compromise"', () => {
        expect(extractTags('BEC scams up 30%')).toContain('business email compromise');
    });
    it('returns [] for an empty/garbage input', () => {
        expect(extractTags('')).toEqual([]);
    });
});
describe('makeSummary', () => {
    it('returns the full body if short enough', () => {
        const s = 'Short body.';
        expect(makeSummary(s, 280)).toBe(s);
    });
    it('trims to a sentence boundary near the cap when possible', () => {
        const body = 'First sentence. Second sentence. Third one. Fourth. Fifth.';
        const s = makeSummary(body, 30);
        expect(s.endsWith('.')).toBe(true);
        expect(s.length).toBeLessThanOrEqual(30);
    });
    it('hard-cuts with ellipsis when no sentence boundary fits', () => {
        const body = 'A '.repeat(500);
        const s = makeSummary(body, 280);
        expect(s.length).toBeLessThanOrEqual(281); // 280 + ellipsis
        expect(s.endsWith('…')).toBe(true);
    });
});
describe('extract (top-level)', () => {
    it('returns the full APT28 entity set from the brief', () => {
        const e = extract('APT28 Targets European Government Entities', APT28_BRIEF);
        expect(e.actors.map((a) => a.slug)).toContain('apt28');
        expect(e.malware.map((m) => m.slug)).toContain('cremshell');
        expect(e.cves.map((c) => c.id)).toContain('CVE-2023-36884');
        expect(e.cves.map((c) => c.id)).toContain('CVE-2024-21762');
        expect(e.tags).toContain('spear-phishing');
        expect(e.iocs.length).toBeGreaterThanOrEqual(5);
        expect(e.summary.length).toBeGreaterThan(20);
    });
    it('survives empty input without throwing', () => {
        const e = extract('', '');
        expect(e.iocs).toEqual([]);
        expect(e.actors).toEqual([]);
        expect(e.malware).toEqual([]);
        expect(e.cves).toEqual([]);
        expect(e.tags).toEqual([]);
        expect(e.summary).toBe('');
    });
});
