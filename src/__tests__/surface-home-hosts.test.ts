/**
 * Each tools host root must serve THAT tool's landing, not an all-tools page.
 * The lookup inverts TOOL_HOSTS_BY_PATH, so a missing entry or a prefix
 * mismatch silently renders the wrong product — which is exactly what made
 * all four hosts look identical before.
 */
import { describe, it, expect } from 'vitest';
import { TOOL_HOSTS_BY_PATH } from '../lib/surface';

const HOST_FOR: Record<string, string> = {
  crucible: 'crucible.pranithjain.qzz.io',
  panopticon: 'panopticon.pranithjain.qzz.io',
  scout: 'scout.pranithjain.qzz.io',
  argus: 'argus.pranithjain.qzz.io',
  agent: 'agent.pranithjain.qzz.io',
  copilot: 'copilot.pranithjain.qzz.io',
  brief: 'brief.pranithjain.qzz.io',
};

describe('tools host -> owned path prefix', () => {
  it('maps every expected host to exactly one prefix', () => {
    const byHost: Record<string, string[]> = {};
    for (const [prefix, host] of Object.entries(TOOL_HOSTS_BY_PATH)) {
      (byHost[host] ??= []).push(prefix);
    }
    for (const [name, host] of Object.entries(HOST_FOR)) {
      expect(byHost[host], `${name} has no owning prefix`).toBeDefined();
      // Two prefixes resolving to one host would make `/` ambiguous.
      expect(byHost[host], `${name} owned by multiple prefixes`).toHaveLength(1);
    }
  });

  it('gives each of the 7 hosts its own distinct hostname', () => {
    const hosts = Object.values(TOOL_HOSTS_BY_PATH);
    expect(hosts).toHaveLength(7);
    expect(new Set(hosts).size).toBe(7);
  });

  it('uses longest-prefix-first so a sub-path beats its parent area', () => {
    const entries = Object.entries(TOOL_HOSTS_BY_PATH);
    const ordered = [...entries].sort((a, b) => b[0].length - a[0].length);
    const resolve = (p: string) => ordered.find(([pre]) => p === pre || p.startsWith(`${pre}/`))?.[1];

    expect(resolve('/dfir/agent-suite')).toBe(HOST_FOR.agent);
    expect(resolve('/dfir/agent-suite/run/1')).toBe(HOST_FOR.agent);
    expect(resolve('/dfir/ioc-check')).toBe(HOST_FOR.crucible);
    expect(resolve('/threatintel/tools/copilot')).toBe(HOST_FOR.copilot);
    expect(resolve('/threatintel/catalog')).toBe(HOST_FOR.panopticon);
    // /daily-briefs is outside every surface area and still resolves.
    expect(resolve('/daily-briefs')).toBe(HOST_FOR.brief);
    expect(resolve('/about')).toBeUndefined();
  });
});
