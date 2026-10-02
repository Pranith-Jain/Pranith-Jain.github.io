import { describe, it, expect } from 'vitest';
import {
  SOURCE_RELIABILITY_REGISTRY,
  resolveSourceReliability,
  reliabilityWeight,
  reliabilityScore,
  ADMIRALTY_WEIGHT,
} from '../../src/lib/confidence';
import { SOURCE_RELIABILITY as CLIENT_MIRROR, gradeForLiveIoc } from '../../../src/lib/dfir/admiralty-quick';
import { admiraltyGrade } from '../../src/lib/admiralty';

/**
 * Source reliability is graded in three places that must not drift:
 *
 *   1. `api/src/lib/confidence.ts`       — canonical registry (the authority)
 *   2. `api/src/lib/admiralty.ts`        — IOC-enrichment path
 *   3. `src/lib/dfir/admiralty-quick.ts`  — client mirror for live-IOC rows
 *
 * (2) resolves through the registry, so it cannot drift. (3) is a hand-kept
 * mirror because the client cannot import the 32KB registry — its eager
 * bundle budget has ~4KB of gzip headroom and `src/` shares no runtime
 * imports with `api/` anywhere in this repo. That mirror is what this test
 * protects.
 *
 * Before this test existed the three disagreed: `abuseipdb` graded B on the
 * IOC and live-IOC paths and C on the PIR/copilot path, and `yaraify` was B
 * in one table and C in another — so an indicator's displayed confidence
 * depended on which endpoint produced it.
 */

describe('source reliability registry — internal consistency', () => {
  it('gives every entry a valid A–F grade', () => {
    for (const [id, entry] of Object.entries(SOURCE_RELIABILITY_REGISTRY)) {
      expect('ABCDEF', `${id} = ${entry.reliability}`).toContain(entry.reliability);
      expect(entry.id, `${id}.id does not match its key`).toBe(id);
    }
  });

  it('exposes a weight and a rank for every grade', () => {
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      expect(ADMIRALTY_WEIGHT[g]).toBeGreaterThan(0);
      expect(ADMIRALTY_WEIGHT[g]).toBeLessThanOrEqual(1);
      expect(reliabilityScore(g)).toBeGreaterThanOrEqual(0);
    }
    // Weights must decrease monotonically as reliability drops.
    const order = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(ADMIRALTY_WEIGHT[order[i]!]).toBeLessThan(ADMIRALTY_WEIGHT[order[i - 1]!]);
      expect(reliabilityScore(order[i]!)).toBeLessThan(reliabilityScore(order[i - 1]!));
    }
  });

  it('resolves abuse.ch sources through their namespaced registry ids', () => {
    // The registry namespaces these; the aliases stop them silently
    // degrading to the unregistered default.
    for (const bare of ['threatfox', 'urlhaus', 'malwarebazaar']) {
      expect(resolveSourceReliability(bare), bare).not.toBe('C');
      expect(reliabilityWeight(resolveSourceReliability(bare))).toBeGreaterThan(ADMIRALTY_WEIGHT.C);
    }
  });

  it('honours an explicit tier over the registry', () => {
    expect(resolveSourceReliability('virustotal', 'F')).toBe('F');
    expect(resolveSourceReliability('virustotal', 'A')).toBe('A');
  });

  it('falls back to C for an unknown source', () => {
    expect(resolveSourceReliability('definitely-not-a-source')).toBe('C');
  });
});

describe('client mirror cannot drift from the canonical registry', () => {
  it('has no source the registry does not know about', () => {
    const orphans = Object.keys(CLIENT_MIRROR).filter((k) => !(k in SOURCE_RELIABILITY_REGISTRY));
    expect(orphans, `client mirror has entries absent from the registry: ${orphans.join(', ')}`).toEqual([]);
  });

  it('assigns every mirrored source the registry grade', () => {
    const mismatched: string[] = [];
    for (const [source, grade] of Object.entries(CLIENT_MIRROR)) {
      const canonical = SOURCE_RELIABILITY_REGISTRY[source]?.reliability;
      if (canonical !== grade) mismatched.push(`${source}: mirror=${grade} registry=${canonical}`);
    }
    expect(mismatched, `grade drift:\n  ${mismatched.join('\n  ')}`).toEqual([]);
  });

  it('is actually applied by gradeForLiveIoc', () => {
    for (const [source, grade] of Object.entries(CLIENT_MIRROR)) {
      expect(gradeForLiveIoc(source, 'hash').reliability, source).toBe(grade);
    }
  });

  it('grades CISA KEV as A (authoritative primary source)', () => {
    expect(gradeForLiveIoc('cisa-kev', 'hash').reliability).toBe('A');
    expect(gradeForLiveIoc('cisa-kev', 'hash').label).toBe('A2');
  });

  it('grades social/unknown-derived rows no better than D', () => {
    // These rows arrive without per-source provenance, so the mirror is
    // deliberately stricter than the registry's C default.
    expect(gradeForLiveIoc('tweetfeed', 'hash').reliability).toBe('D');
    expect(gradeForLiveIoc('some-unmapped-feed', 'hash').reliability).toBe('D');
  });

  it('applies the type-credibility baseline consistently', () => {
    // Hashes persist (2), domains/urls middle (3), IPs rotate (4).
    expect(gradeForLiveIoc('virustotal', 'hash').credibility).toBe(2);
    expect(gradeForLiveIoc('virustotal', 'domain').credibility).toBe(3);
    expect(gradeForLiveIoc('virustotal', 'url').credibility).toBe(3);
    expect(gradeForLiveIoc('virustotal', 'ipv4').credibility).toBe(4);
    expect(gradeForLiveIoc('virustotal', 'ip').credibility).toBe(4);
    // Unknown type falls back to 4.
    expect(gradeForLiveIoc('virustotal', 'something-else').credibility).toBe(4);
  });
});

describe('IOC-enrichment path agrees with the registry', () => {
  it('returns F6 when no provider reported', () => {
    expect(admiraltyGrade('ipv4', []).label).toBe('F6');
  });

  it('grades a registry-known provider the same as the registry', () => {
    for (const source of ['virustotal', 'shodan', 'greynoise', 'abuseipdb'] as const) {
      const grade = admiraltyGrade('hash', [source]);
      expect(grade.reliability, `${source}: enrichment path`).toBe(SOURCE_RELIABILITY_REGISTRY[source]!.reliability);
    }
  });

  it('takes the best reliability across corroborating providers', () => {
    // virustotal (B) + shodan (C) -> best is B
    expect(admiraltyGrade('hash', ['shodan', 'virustotal']).reliability).toBe('B');
    expect(admiraltyGrade('hash', ['shodan', 'virustotal']).label).toBe('B2');
  });

  it('caps credibility by indicator type, not by source', () => {
    // A fast-rotating IP cannot reach top credibility no matter the source.
    expect(admiraltyGrade('ipv4', ['virustotal']).credibility).toBe(4);
    expect(admiraltyGrade('hash', ['virustotal']).credibility).toBe(2);
    expect(admiraltyGrade('domain', ['virustotal']).credibility).toBe(3);
  });

  it('has no A-grade provider adapter, so enrichment tops out at B', () => {
    // Guards an assumption the "best reliability" test relies on: if an A
    // provider is ever added, this fails and the corroboration test needs
    // updating to match.
    const grades = ['virustotal', 'abuseipdb', 'shodan', 'censys', 'netlas'] as const;
    for (const p of grades) {
      expect(SOURCE_RELIABILITY_REGISTRY[p]!.reliability, p).not.toBe('A');
    }
  });
});
