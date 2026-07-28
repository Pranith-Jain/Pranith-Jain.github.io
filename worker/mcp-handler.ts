/**
 * MCP server handler — authenticates and dispatches /api/mcp requests
 * to the DfirMcpServer Durable Object.
 */

import { DfirMcpServer } from './mcp-server';
import { withSecurityHeaders } from './csp';
import { workerRateLimit, rateLimitResponse, callerIp } from './lib/worker-rate-limit';
import type { Env } from './env';

const MCP_LIMIT_KEYED = 60;
const MCP_LIMIT_ANON = 10;

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mcp')) return null;

  if (request.method !== 'OPTIONS') {
    const authz = request.headers.get('authorization') ?? '';
    const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
    if (!rawKey) {
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'api key required for MCP — provide via Authorization: Bearer' }), {
          status: 401,
          headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
        }),
        undefined,
        url.origin
      );
    }

    const rlId = rawKey.slice(0, 16);
    const rl = await workerRateLimit('mcp', rlId, MCP_LIMIT_KEYED);
    if (!rl.allowed) {
      return withSecurityHeaders(rateLimitResponse(rl), undefined, url.origin);
    }
  }

  const isSse = url.pathname.startsWith('/api/mcp/sse');
  const mcpRes = isSse
    ? await DfirMcpServer.serveSSE('/api/mcp/sse', { binding: 'DFIR_MCP' }).fetch(request, env, ctx)
    : await DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
  return withSecurityHeaders(mcpRes, undefined, url.origin);
}
