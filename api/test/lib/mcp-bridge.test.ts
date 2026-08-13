/**
 * Tests for the MCP-to-agent bridge.
 *
 * Verifies that bridgeMcpTools() generates AgentTool[] entries with
 * the correct names, descriptions, params, and that the execute
 * functions call the right library functions (stubbed).
 *
 * Run via: npx vitest run api/test/lib/mcp-bridge.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bridgeMcpTools } from '../../src/lib/agent/mcp-bridge';

type EnvWithAssets = { ASSETS?: Fetcher; TRACEIX_API_KEY?: string; WHOXY_API_KEY?: string };

// Stub the library functions the bridge calls.
vi.mock('../../src/lib/threat-intel-manifest', () => ({
  loadTiIndex: vi.fn(async () => ({
    cveIndex: [],
    iocIndex: [],
    counts: { cves: 0, iocs: 0, sectors: 0, kevTotal: 0, lists: 0 },
  })),
  loadKevSnapshot: vi.fn(async () => []),
  getTiCve: vi.fn(async () => null),
  getTiIoc: vi.fn(async () => null),
  getTiSector: vi.fn(async () => null),
  getTiList: vi.fn(async () => null),
  filterCves: vi.fn(() => []),
  filterIocs: vi.fn(() => []),
  filterLists: vi.fn(() => []),
  searchListEntries: vi.fn(() => []),
  tiCacheStats: vi.fn(() => ({})),
  loadDarknetIndex: vi.fn(async () => ({
    sites: [],
    categories: [],
    counts: { categories: 0, sites: 0, up: 0, down: 0, recommended: 0, onion: 0 },
  })),
  getDarknetSite: vi.fn(async () => null),
  getDarknetCategory: vi.fn(async () => null),
  filterDarknetSites: vi.fn(() => []),
}));

vi.mock('../../src/lib/si-manifest', () => ({
  loadSiIndex: vi.fn(async () => ({ skills: [], queries: [] })),
  getSiSkill: vi.fn(async () => null),
  getSiQuery: vi.fn(async () => null),
  getSiAutomation: vi.fn(async () => null),
  loadDocsIndex: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(async () => null),
  filterSkills: vi.fn(() => []),
  filterQueries: vi.fn(() => []),
}));

vi.mock('../../src/lib/winreg-manifest', () => ({
  loadWinRegIndex: vi.fn(async () => ({ artifacts: [], categories: [] })),
  getWinRegArtifact: vi.fn(async () => null),
  filterArtifacts: vi.fn(() => []),
}));

vi.mock('../../src/lib/traceix', () => ({
  traceixLookup: vi.fn(async () => ({ hash: '', avResults: [], success: false, diagnostics: [] })),
}));

vi.mock('../../src/lib/whoxy', () => ({
  whoxyReverseWhois: vi.fn(async () => ({ domains: [], total_results: 0, success: false, diagnostics: [] })),
}));

const mockEnv: EnvWithAssets = {
  ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
  TRACEIX_API_KEY: 'test-key',
  WHOXY_API_KEY: 'test-key',
};

const mockSelf = { fetch: vi.fn() } as unknown as Fetcher;

describe('bridgeMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates tools for the threat-intel vertical', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('ti_list_cves');
    expect(names).toContain('ti_get_cve');
    expect(names).toContain('ti_list_kev');
    expect(names).toContain('ti_list_iocs');
    expect(names).toContain('ti_get_ioc');
    expect(names).toContain('ti_brief_sector');
    expect(names).toContain('ti_list_detection_lists');
    expect(names).toContain('ti_stats');
  });

  it('generates tools for the darknet directory', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('ti_list_darknet');
    expect(names).toContain('ti_get_darknet_site');
    expect(names).toContain('ti_get_darknet_category');
  });

  it('generates tools for the security investigator', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('si_list_skills');
    expect(names).toContain('si_get_skill');
    expect(names).toContain('si_list_queries');
    expect(names).toContain('si_get_query');
    expect(names).toContain('si_get_automation');
    expect(names).toContain('si_list_docs');
    expect(names).toContain('si_get_doc');
  });

  it('generates tools for winreg, traceix, whoxy', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('winreg_list_artifacts');
    expect(names).toContain('winreg_get_artifact');
    expect(names).toContain('traceix_lookup');
    expect(names).toContain('whoxy_reverse_whois');
  });

  it('generates tools for depx and breach_vip', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('depx_feed');
    expect(names).toContain('depx_check');
    expect(names).toContain('depx_stats');
    expect(names).toContain('breach_vip_search');
  });

  it('generates tools for the NHI scanner', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).toContain('nhi_scan');
    expect(names).toContain('nhi_inventory');
    expect(names).toContain('nhi_owasp_catalog');
  });

  it('nhi_scan executes an end-to-end scan', async () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const tool = tools.find((t) => t.name === 'nhi_scan');
    expect(tool).toBeDefined();
    const result = (await tool!.execute({
      inventory: JSON.stringify([
        { id: 'a', name: 'a', privilege: 'admin', credential: 'static_secret' },
        { id: 'b', name: 'b', credential: 'federated', environment: 'sandbox' },
      ]),
    })) as { summary: { total_identities: number }; identities: Array<{ tier: number }> };
    expect(result.summary.total_identities).toBe(2);
    expect(result.identities[0]!.tier).toBe(1); // admin + static secret → critical
  });

  it('generates all 43 dn_ darknet-intel tools', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const dnTools = tools.filter((t) => t.name.startsWith('dn_'));
    expect(dnTools.length).toBe(43);
    // Spot-check a few providers
    const names = dnTools.map((t) => t.name);
    expect(names).toContain('dn_greynoise_check');
    expect(names).toContain('dn_abuseipdb_check');
    expect(names).toContain('dn_hibp_latest');
    expect(names).toContain('dn_threatfox_search');
    expect(names).toContain('dn_bazaar_hash');
    expect(names).toContain('dn_otx_ip');
    expect(names).toContain('dn_pulsedive_indicator');
    expect(names).toContain('dn_vulners_search');
    expect(names).toContain('dn_intelx_search');
    expect(names).toContain('dn_ransomware_group');
  });

  it('does not duplicate tools already in the existing set', () => {
    const existing = new Set(['ti_list_cves', 'ti_get_cve', 'si_list_skills']);
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, existing, mockSelf, {});
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('ti_list_cves');
    expect(names).not.toContain('ti_get_cve');
    expect(names).not.toContain('si_list_skills');
    // But others are still present
    expect(names).toContain('ti_list_darknet');
    expect(names).toContain('si_get_skill');
  });

  it('every tool has a name, description, params, and execute function', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.params)).toBe(true);
      expect(typeof t.execute).toBe('function');
    }
  });

  it('ti_list_cves has the right params', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const tool = tools.find((t) => t.name === 'ti_list_cves');
    expect(tool).toBeDefined();
    const paramNames = tool!.params.map((p) => p.name);
    expect(paramNames).toContain('severity');
    expect(paramNames).toContain('kevOnly');
    expect(paramNames).toContain('keyword');
    expect(paramNames).toContain('limit');
  });

  it('dn_greynoise_check has an ip param', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    const tool = tools.find((t) => t.name === 'dn_greynoise_check');
    expect(tool).toBeDefined();
    expect(tool!.params[0]!.name).toBe('ip');
    expect(tool!.params[0]!.required).toBe(true);
  });

  it('returns 70+ tools total', () => {
    const tools = bridgeMcpTools(mockEnv.ASSETS, mockEnv, new Set(), mockSelf, {});
    expect(tools.length).toBeGreaterThanOrEqual(70);
  });
});
