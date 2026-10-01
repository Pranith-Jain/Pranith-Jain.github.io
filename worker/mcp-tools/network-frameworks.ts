/**
 * network-frameworks MCP tool registrations.
 *
 * Moved verbatim out of `DfirMcpServer.init()` in worker/mcp-server.ts.
 * `h` is the McpAgent instance typed as McpToolHost, so the bodies below
 * are unchanged: `h.tools(...)`, `h.env.*` and `h.apiKey` resolve
 * against that host at call time.
 */

import { apiFetch, untrustedToolResult } from './core';
import { z } from 'zod';

import type { McpToolHost } from './host';

export function registerNetworkFrameworksTools(h: McpToolHost): void {
  // ── Network signal analytics ──────────────────────────────────────
  h.tools(
    'detect_c2_beaconing',
    'Score connection timestamps to one destination for C2 beacon periodicity: mean/stddev inter-arrival, jitter ratio, payload-size consistency. Returns 0-100 beacon score with verdict.',
    {
      timestamps: z.array(z.union([z.number(), z.string()])).describe('Connection timestamps (epoch ms or ISO)'),
      destination: z.string().optional().describe('Destination ip or host:port'),
      bytes: z.array(z.number()).optional().describe('Per-connection byte counts'),
    },
    async ({ timestamps, destination, bytes }) => {
      const body: Record<string, unknown> = { timestamps };
      if (destination) body.destination = destination;
      if (bytes && bytes.length) body.bytes = bytes;
      const data = await apiFetch<Record<string, unknown>>(h.env.SELF, '/api/v1/net-analytics/beacon', h.apiKey, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return untrustedToolResult(data);
    }
  );
  h.tools(
    'detect_dns_tunneling',
    'Heuristic DNS-tunneling detection over query names targeting one zone: label length distribution, Shannon entropy, uniqueness ratio → 0-100 tunnel score with verdict and indicators.',
    {
      queries: z.array(z.string()).describe('DNS query names'),
      zone: z.string().optional().describe('Authoritative zone; inferred from queries when omitted'),
    },
    async ({ queries, zone }) => {
      const body: Record<string, unknown> = { queries };
      if (zone) body.zone = zone;
      const data = await apiFetch<Record<string, unknown>>(h.env.SELF, '/api/v1/net-analytics/dns-tunnel', h.apiKey, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return untrustedToolResult(data);
    }
  );

  // ── TID-CMM / UTIOM framework tools ──────────────────────────────
  h.tools(
    'frameworks_list',
    'List integrated security frameworks (TID-CMM and UTIOM): ids, versions, homepage, licence, and domain/phase counts. Data replicated from tid-cmm.com (CC BY 4.0) and utiom.de (CC BY-SA 4.0).',
    {},
    async () => {
      const data = await apiFetch<Record<string, unknown>>(h.env.SELF, '/api/v1/frameworks', h.apiKey);
      return untrustedToolResult(data);
    }
  );
  h.tools(
    'tid_cmm_get_domain',
    'Get a TID-CMM domain by id (TI, TM, DC, DE, AV, AA, IR, GV) with its sub-capabilities, weights, and level descriptors. TID-CMM v1.5 · ATT&CK Enterprise v19.2 (697 techniques). Source: tid-cmm.com (CC BY 4.0).',
    { domain_id: z.string().describe('Domain id: TI, TM, DC, DE, AV, AA, IR, or GV (case-insensitive)') },
    async ({ domain_id }) => {
      const data = await apiFetch<Record<string, unknown>>(
        h.env.SELF,
        `/api/v1/frameworks/tid-cmm/domains/${encodeURIComponent(domain_id)}`,
        h.apiKey
      );
      return untrustedToolResult(data);
    }
  );
  h.tools(
    'tid_cmm_search',
    'Search / filter TID-CMM domains and sub-capabilities by keyword. Returns the model plus matched domains (keyword matches id/name/intent). TID-CMM v1.5 · 8 domains · 58 sub-capabilities.',
    { q: z.string().optional().describe('Keyword, e.g. "telemetry", "hunting", "ATT&CK", or domain id "DE"') },
    async ({ q }) => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await apiFetch<Record<string, unknown>>(h.env.SELF, `/api/v1/frameworks/tid-cmm${qs}`, h.apiKey);
      return untrustedToolResult(data);
    }
  );
  h.tools(
    'utiom_get',
    'Get the full UTIOM (Unified Threat-Informed Operations Model) manifest: 7 phases across 3 pillars, doctrine (7 laws), assessment tools, framework family (TID-CMM / TIR-CMM / RSMM / KEVMAP), and standards alignment (NIST CSF 2.0, ISO 27001, NIS2, DORA). Source: utiom.de v1.3 (CC BY-SA 4.0).',
    {},
    async () => {
      const data = await apiFetch<Record<string, unknown>>(h.env.SELF, '/api/v1/frameworks/utiom', h.apiKey);
      return untrustedToolResult(data);
    }
  );
}
