import { describe, it, expect } from 'vitest';
import { nextActionsFor, suggestAlternative, getAlternatives, sameDomain } from '../../src/lib/agent/tool-retry';

// ─────────────────────────────────────────────────────────────────────────────
// nextActionsFor — observation contract (fix #4).
//
// Every tool result should carry next_actions so the observer/planner gets a
// stable recovery handle without parsing raw JSON. On success these are the
// natural enrichment-chain follow-ups; on error they are the documented
// alternatives (mirrors TOOL_ALTERNATIVES so the observer can suggest a retry
// with a different tool).
// ─────────────────────────────────────────────────────────────────────────────

describe('nextActionsFor — per-tool follow-up hints', () => {
  it('returns success-path hints for a known IOC tool', () => {
    const hints = nextActionsFor('check_ioc', 'ok');
    expect(hints).toContain('correlate_iocs');
    expect(hints).toContain('enrich_actor');
    expect(hints.length).toBeGreaterThan(0);
  });

  it('returns success-path hints for an actor tool', () => {
    const hints = nextActionsFor('enrich_actor', 'ok');
    expect(hints).toContain('actor_timeline');
    expect(hints).toContain('search_malpedia');
  });

  it('returns success-path hints for a CVE tool', () => {
    const hints = nextActionsFor('lookup_cve', 'ok');
    expect(hints).toContain('lookup_cisa_kev');
    expect(hints).toContain('generate_hunting_queries');
  });

  it('returns error-path hints that mirror TOOL_ALTERNATIVES', () => {
    const hints = nextActionsFor('check_ioc', 'error');
    const alts = getAlternatives('check_ioc');
    expect(hints).toEqual(alts);
    expect(hints).toContain('enrich_ioc_deep');
  });

  it('returns error-path hints for a domain tool', () => {
    const hints = nextActionsFor('lookup_domain', 'error');
    expect(hints).toContain('lookup_dns');
    expect(hints).toContain('lookup_builtwith');
  });

  it('returns empty array for unknown tools (no hints, no crash)', () => {
    expect(nextActionsFor('nonexistent_tool', 'ok')).toEqual([]);
    expect(nextActionsFor('nonexistent_tool', 'error')).toEqual([]);
  });

  it('returns a fresh array (callers can mutate safely)', () => {
    const a = nextActionsFor('check_ioc', 'ok');
    const b = nextActionsFor('check_ioc', 'ok');
    expect(a).toEqual(b);
    a.push('mutated');
    expect(b).not.toContain('mutated'); // internal map not leaked
  });

  it('terminal enrichment tools have empty or short success hints', () => {
    // get_relationships is a terminal enrichment — no further follow-up needed.
    const hints = nextActionsFor('get_relationships', 'ok');
    expect(hints).toEqual([]);
  });

  it('error hints for a tool with no alternatives return empty', () => {
    // A tool not in TOOL_ALTERNATIVES returns [] on error.
    expect(nextActionsFor('get_relationships', 'error')).toEqual([]);
  });
});

describe('nextActionsFor — consistency with tool-retry alternatives', () => {
  it('error hints always equal getAlternatives(tool)', () => {
    // For every tool that has alternatives, the error-path hints must match.
    const toolsWithAlts = ['check_ioc', 'enrich_actor', 'lookup_cve', 'lookup_domain', 'sample_scan'];
    for (const tool of toolsWithAlts) {
      expect(nextActionsFor(tool, 'error')).toEqual(getAlternatives(tool));
    }
  });

  it('success hints never overlap with error alternatives (no redundant self-loop)', () => {
    // A success hint should point forward to the next enrichment step, not
    // back to the alternatives used when THIS tool fails.
    const tool = 'check_ioc';
    const successHints = new Set(nextActionsFor(tool, 'ok'));
    const errorHints = nextActionsFor(tool, 'error');
    for (const e of errorHints) {
      expect(successHints.has(e)).toBe(false);
    }
  });
});

describe('tool-retry — suggestAlternative still works (regression)', () => {
  it('suggests an alternative for a failed tool', () => {
    const failed = { tool: 'check_ioc', args: { indicator: '1.1.1.1' }, reasoning: 'failed' };
    const allTools = new Set(['enrich_ioc_deep', 'maltiverse_verify', 'check_ioc']);
    const called = new Set<string>();
    const alt = suggestAlternative(failed, allTools, called);
    expect(alt).not.toBeNull();
    expect(alt!.tool).toBe('enrich_ioc_deep');
    expect(alt!.args).toEqual({ indicator: '1.1.1.1' });
  });

  it('returns null when all alternatives already tried', () => {
    const failed = { tool: 'check_ioc', args: { indicator: '1.1.1.1' }, reasoning: 'failed' };
    const allTools = new Set(['enrich_ioc_deep', 'maltiverse_verify', 'check_ioc']);
    const called = new Set([
      'check_ioc:{"indicator":"1.1.1.1"}',
      'enrich_ioc_deep:{"indicator":"1.1.1.1"}',
      'maltiverse_verify:{"indicator":"1.1.1.1"}',
    ]);
    expect(suggestAlternative(failed, allTools, called)).toBeNull();
  });

  it('sameDomain detects tools covering the same intelligence domain', () => {
    expect(sameDomain('check_ioc', 'enrich_ioc_deep')).toBe(true);
    expect(sameDomain('check_ioc', 'lookup_cve')).toBe(false);
  });
});
