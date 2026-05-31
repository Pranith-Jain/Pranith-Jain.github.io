import { describe, it, expect } from 'vitest';
import { parseStixBundle, type StixBundle } from '../../src/lib/stix-import';

describe('STIX 2.1 Import', () => {
  const validBundle: StixBundle = {
    type: 'bundle',
    id: 'bundle--test-123',
    objects: [
      {
        type: 'indicator',
        id: 'indicator--test-001',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
        name: 'Malicious IP',
        pattern: "[ipv4-addr:value = '1.2.3.4']",
        pattern_type: 'stix',
        valid_from: '2026-01-01T00:00:00Z',
      },
      {
        type: 'threat-actor',
        id: 'threat-actor--test-002',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
        name: 'APT28',
        aliases: ['Fancy Bear', 'Sofacy'],
        roles: ['espionage'],
      },
      {
        type: 'malware',
        id: 'malware--test-003',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
        name: 'Cobalt Strike',
        is_family: true,
        malware_types: ['backdoor'],
      },
      {
        type: 'vulnerability',
        id: 'vulnerability--test-004',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
        name: 'CVE-2024-3094',
      },
      {
        type: 'relationship',
        id: 'relationship--test-005',
        created: '2026-01-01T00:00:00Z',
        modified: '2026-01-01T00:00:00Z',
        relationship_type: 'uses',
        source_ref: 'threat-actor--test-002',
        target_ref: 'malware--test-003',
      },
    ],
  };

  describe('parseStixBundle', () => {
    it('parses valid bundle from JSON string', () => {
      const result = parseStixBundle(JSON.stringify(validBundle));
      expect(result.valid).toBe(true);
      expect(result.indicators).toHaveLength(1);
      expect(result.actors).toHaveLength(1);
      expect(result.malware).toHaveLength(1);
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.relationships).toHaveLength(1);
    });

    it('parses valid bundle from object', () => {
      const result = parseStixBundle(validBundle);
      expect(result.valid).toBe(true);
      expect(result.stats.totalObjects).toBe(5);
    });

    it('extracts IPv4 from pattern', () => {
      const result = parseStixBundle(validBundle);
      expect(result.indicators[0]!.type).toBe('ipv4');
      expect(result.indicators[0]!.value).toBe('1.2.3.4');
    });

    it('extracts threat actor with aliases', () => {
      const result = parseStixBundle(validBundle);
      expect(result.actors[0]!.name).toBe('APT28');
      expect(result.actors[0]!.aliases).toContain('Fancy Bear');
    });

    it('extracts malware with family flag', () => {
      const result = parseStixBundle(validBundle);
      expect(result.malware[0]!.name).toBe('Cobalt Strike');
      expect(result.malware[0]!.isFamily).toBe(true);
    });

    it('extracts vulnerability as CVE', () => {
      const result = parseStixBundle(validBundle);
      expect(result.vulnerabilities[0]!.name).toBe('CVE-2024-3094');
    });

    it('extracts relationships', () => {
      const result = parseStixBundle(validBundle);
      expect(result.relationships[0]!.type).toBe('uses');
      expect(result.relationships[0]!.sourceRef).toBe('threat-actor--test-002');
    });

    it('handles invalid JSON gracefully', () => {
      const result = parseStixBundle('not valid json');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('handles missing bundle type', () => {
      const result = parseStixBundle({ type: 'not-bundle', objects: [] } as any);
      expect(result.valid).toBe(false);
    });

    it('handles empty objects array', () => {
      const result = parseStixBundle({ type: 'bundle', objects: [] });
      expect(result.valid).toBe(true);
      expect(result.stats.totalObjects).toBe(0);
    });

    it('counts objects by type', () => {
      const result = parseStixBundle(validBundle);
      expect(result.stats.byType['indicator']).toBe(1);
      expect(result.stats.byType['threat-actor']).toBe(1);
      expect(result.stats.byType['malware']).toBe(1);
    });

    it('extracts domain from pattern', () => {
      const bundle: StixBundle = {
        type: 'bundle',
        id: 'bundle--test',
        objects: [
          {
            type: 'indicator',
            id: 'indicator--test',
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
            pattern: "[domain-name:value = 'evil.com']",
            pattern_type: 'stix',
          },
        ],
      };
      const result = parseStixBundle(bundle);
      expect(result.indicators[0]!.type).toBe('domain');
      expect(result.indicators[0]!.value).toBe('evil.com');
    });

    it('extracts hash from pattern', () => {
      const bundle: StixBundle = {
        type: 'bundle',
        id: 'bundle--test',
        objects: [
          {
            type: 'indicator',
            id: 'indicator--test',
            created: '2026-01-01T00:00:00Z',
            modified: '2026-01-01T00:00:00Z',
            pattern: "[file:hashes.'SHA-256' = 'abc123def456']",
            pattern_type: 'stix',
          },
        ],
      };
      const result = parseStixBundle(bundle);
      expect(result.indicators[0]!.type).toBe('hash');
      expect(result.indicators[0]!.value).toBe('abc123def456');
    });
  });
});
