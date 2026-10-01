/**
 * si-skills MCP tool registrations.
 *
 * Moved verbatim out of `DfirMcpServer.init()` in worker/mcp-server.ts.
 * `h` is the McpAgent instance typed as McpToolHost, so the bodies below
 * are unchanged: `h.tools(...)`, `h.env.*` and `h.apiKey` resolve
 * against that host at call time.
 *
 * Security Investigator: 25 Agent Skills + 45 KQL queries.
 * The manifest ships in /public/data/si/ as static JSON and is read back
 * through env.ASSETS at runtime. The index is small (~37 KB) and cached
 * in-memory per isolate; per-skill / per-query bodies are cached on demand
 * with an LRU of 200 entries.
 *
 * All skill + query bodies are upstream markdown sourced from
 * github.com/SCStelz/security-investigator (MIT). Clients should render the
 * markdown themselves - we return it raw so the worker doesn't need a
 * markdown parser at the edge.
 *
 * All tools here read static JSON manifests through the ASSETS binding,
 * so the whole group stays unregistered when ASSETS is unbound — matching
 * the `if (h.env.ASSETS)` block this was extracted from.
 */

import { untrustedToolResult } from './core';
import { z } from 'zod';

import type { McpToolHost } from './host';

export function registerSiSkillsTools(h: McpToolHost): void {
  // Was: `if (h.env.ASSETS) { const ASSETS = h.env.ASSETS; ... }`
  const ASSETS = h.env.ASSETS;
  if (!ASSETS) return;

  h.tools(
    'si_list_skills',
    'List the security investigation skills shipped in this Worker (replicated from SCStelz/security-investigator, MIT). Each skill is a guided KQL+playbook workflow. Filter by category or free-text keyword.',
    {
      category: z
        .enum([
          'Quick Scan',
          'Core Investigation',
          'Auth & Access',
          'Behavioral Drift',
          'Posture & Exposure',
          'Data Security',
          'Visualization',
          'Tooling',
        ])
        .optional()
        .describe('Restrict to a single skill category'),
      keyword: z
        .string()
        .optional()
        .describe('Case-insensitive substring match against slug / name / description / trigger keywords'),
      limit: z.number().int().min(1).max(100).optional().describe('Max skills to return (default 50)'),
    },
    async ({ category, keyword, limit }) => {
      const idx = await loadSiIndex(ASSETS);
      const skills = filterSkills(idx, {
        category: category as SiSkillCategory | undefined,
        keyword,
        limit: limit ?? 50,
      });
      return untrustedToolResult({
        total: idx.skills.length,
        returned: skills.length,
        source: idx.source,
        license: idx.license,
        replicatedAt: idx.replicatedAt,
        skills,
      });
    }
  );

  h.tools(
    'si_get_skill',
    'Return the full SKILL.md body (markdown) for a single security investigation skill. Use si_list_skills first to discover slugs.',
    {
      slug: z
        .string()
        .describe(
          'Skill slug, e.g. "threat-pulse", "user-investigation", "scope-drift-detection/user". Get these from si_list_skills.'
        ),
    },
    async ({ slug }) => {
      const body = await getSiSkill(ASSETS, slug);
      if (!body) {
        return untrustedToolResult({
          error: 'skill_not_found',
          slug,
          hint: 'Call si_list_skills to see available slugs.',
        });
      }
      return untrustedToolResult(body);
    }
  );

  h.tools(
    'si_list_queries',
    'List the KQL queries shipped in this Worker (Defender XDR / Sentinel hunt library replicated from SCStelz/security-investigator, MIT). Filter by domain (cloud / email / endpoint / identity / incidents / network / threat-intelligence) or free-text keyword.',
    {
      domain: z
        .enum(['cloud', 'email', 'endpoint', 'identity', 'incidents', 'network', 'threat-intelligence'])
        .optional()
        .describe('Restrict to a single query domain'),
      keyword: z
        .string()
        .optional()
        .describe('Case-insensitive substring match against slug / title / filename / domain / subdomain'),
      limit: z.number().int().min(1).max(200).optional().describe('Max queries to return (default 100)'),
    },
    async ({ domain, keyword, limit }) => {
      const idx = await loadSiIndex(ASSETS);
      const queries = filterQueries(idx, { domain, keyword, limit: limit ?? 100 });
      return untrustedToolResult({
        total: idx.queries.length,
        returned: queries.length,
        source: idx.source,
        license: idx.license,
        replicatedAt: idx.replicatedAt,
        queries,
      });
    }
  );

  h.tools(
    'si_get_query',
    'Return the full markdown body of a single KQL query (Defender XDR / Sentinel hunting query, IoC correlation, or campaign playbook). Use si_list_queries first to discover slugs.',
    {
      slug: z
        .string()
        .describe(
          'Query slug, e.g. "cloud/agent365_observability" or "identity/aitm_threat_detection". Get these from si_list_queries.'
        ),
    },
    async ({ slug }) => {
      const body = await getSiQuery(ASSETS, slug);
      if (!body) {
        return untrustedToolResult({
          error: 'query_not_found',
          slug,
          hint: 'Call si_list_queries to see available slugs.',
        });
      }
      return untrustedToolResult(body);
    }
  );

  h.tools(
    'si_get_automation',
    'Return a scheduled-workflow definition (Copilot App / GitHub Actions) for running the skills unattended. Three automations ship: daily-threat-pulse, daily-mcp-auth-health-check, weekly-threat-intel-campaign.',
    {
      slug: z
        .enum(['daily-threat-pulse', 'daily-mcp-auth-health-check', 'weekly-threat-intel-campaign'])
        .describe('Automation slug'),
    },
    async ({ slug }) => {
      const body = await getSiAutomation(ASSETS, slug);
      if (!body) {
        return untrustedToolResult({ error: 'automation_not_found', slug });
      }
      return untrustedToolResult(body);
    }
  );

  h.tools(
    'si_stats',
    'Return cache + manifest stats for the Security Investigator data: index loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.',
    {},
    async () => {
      const idx = await loadSiIndex(ASSETS);
      return untrustedToolResult({
        counts: idx.counts,
        source: idx.source,
        license: idx.license,
        replicatedAt: idx.replicatedAt,
        cache: siCacheStats(),
      });
    }
  );
}
