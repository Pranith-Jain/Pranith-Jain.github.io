/**
 * Tests for context-aware tool filtering (filterToolsForQueryType).
 *
 * Verifies that the planner receives only the tools relevant to the
 * query type, not all ~278 tools.
 *
 * Run via: npx vitest run api/test/lib/filter-tools.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  filterToolsForQueryType,
  SPECIALIST_TOOLS,
  getSpecialistsForQueryType,
} from '../../src/lib/agent/specialist-types';
import type { AgentTool } from '../../src/lib/agent/types';

function makeTool(name: string): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    params: [],
    execute: async () => ({}),
  };
}

// Build a mock tool registry with all tool names from SPECIALIST_TOOLS
const allToolNames = new Set<string>();
for (const tools of Object.values(SPECIALIST_TOOLS)) {
  for (const t of tools) allToolNames.add(t);
}
// Add some always-available tools
['unified_search', 'cross_correlate', 'get_relationships', 'build_stix_bundle', 'lookup_mitre'].forEach((n) =>
  allToolNames.add(n)
);
const allTools: AgentTool[] = [...allToolNames].map(makeTool);

describe('filterToolsForQueryType', () => {
  it('returns at least 5 tools for any query type', () => {
    for (const qt of ['ip', 'domain', 'hash', 'url', 'cve', 'actor', 'ransomware', 'campaign', 'generic']) {
      const filtered = filterToolsForQueryType(qt, undefined, allTools);
      expect(filtered.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns vulnerability tools for cve query type', () => {
    const filtered = filterToolsForQueryType('cve', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('lookup_cve');
    expect(names).toContain('lookup_cisa_kev');
  });

  it('returns ioc-reputation tools for ip query type', () => {
    const filtered = filterToolsForQueryType('ip', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('check_ioc');
    expect(names).toContain('enrich_ioc_deep');
  });

  it('returns domain-host tools for domain query type', () => {
    const filtered = filterToolsForQueryType('domain', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('lookup_domain');
    expect(names).toContain('lookup_dns');
  });

  it('returns phishing tools for url query type', () => {
    const filtered = filterToolsForQueryType('url', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('analyze_phishing_url');
  });

  it('returns threat-actor tools for actor query type', () => {
    const filtered = filterToolsForQueryType('actor', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('enrich_actor');
    expect(names).toContain('actor_timeline');
  });

  it('does NOT return phishing tools for cve query type', () => {
    const filtered = filterToolsForQueryType('cve', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).not.toContain('analyze_phishing_email');
  });

  it('does NOT return vulnerability tools for phishing query type', () => {
    const filtered = filterToolsForQueryType('phishing', undefined, allTools);
    const names = filtered.map((t) => t.name);
    expect(names).not.toContain('scan_dependencies');
  });

  it('always includes unified_search', () => {
    for (const qt of ['ip', 'domain', 'cve', 'actor']) {
      const filtered = filterToolsForQueryType(qt, undefined, allTools);
      const names = filtered.map((t) => t.name);
      expect(names).toContain('unified_search');
    }
  });

  it('returns fewer tools than the full set', () => {
    const filtered = filterToolsForQueryType('ip', undefined, allTools);
    expect(filtered.length).toBeLessThan(allTools.length);
  });

  it('resolves generic query type with query text', () => {
    // A generic query mentioning CVE should route to vulnerability specialist
    const filtered = filterToolsForQueryType('generic', 'CVE-2024-3094', allTools);
    const names = filtered.map((t) => t.name);
    expect(names).toContain('lookup_cve');
  });

  it('falls back to default routing for unknown query types', () => {
    // Unknown query type should fall back to strategic-intel + ioc-reputation
    const filtered = filterToolsForQueryType('nonexistent', undefined, allTools);
    // Should still return tools (from the default routing)
    expect(filtered.length).toBeGreaterThan(0);
    // Should include tools from the default specialists
    const names = filtered.map((t) => t.name);
    expect(names).toContain('get_threat_pulse'); // strategic-intel
  });
});

describe('getSpecialistsForQueryType', () => {
  it('routes cve to vulnerability + detection-rules', () => {
    const specialists = getSpecialistsForQueryType('cve');
    expect(specialists).toContain('vulnerability');
    expect(specialists).toContain('detection-rules');
  });

  it('routes ip to ioc-reputation', () => {
    const specialists = getSpecialistsForQueryType('ip');
    expect(specialists).toContain('ioc-reputation');
  });

  it('routes supply-chain to supply-chain specialist', () => {
    const specialists = getSpecialistsForQueryType('supply-chain');
    expect(specialists).toContain('supply-chain');
  });

  it('routes generic to strategic-intel + dark-web + ioc-reputation', () => {
    const specialists = getSpecialistsForQueryType('generic');
    expect(specialists).toContain('strategic-intel');
  });
});
