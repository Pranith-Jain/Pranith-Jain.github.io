/**
 * MCP server handler — authenticates and dispatches /api/mcp requests
 * to the DfirMcpServer Durable Object.
 */

import { DfirMcpServer } from './mcp-server';
import { withSecurityHeaders } from './csp';
import type { Env } from './env';

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mcp')) return null;

  // Fast gate: reject if no API key is present. Full validation happens inside
  // the Durable Object's onConnect — this is just an early-exit to avoid
  // spinning up a DO instance for unauthenticated requests.
  if (request.method !== 'OPTIONS') {
    const authz = request.headers.get('authorization') ?? '';
    const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
    if (!rawKey) {
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'api key required for MCP — provide via Authorization: Bearer' }), {
          status: 401,
          headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
        })
      );
    }
  }

  const isSse = url.pathname.startsWith('/api/mcp/sse');
  const mcpRes = isSse
    ? await DfirMcpServer.serveSSE('/api/mcp/sse', { binding: 'DFIR_MCP' }).fetch(request, env, ctx)
    : await DfirMcpServer.serve('/api/mcp', { binding: 'DFIR_MCP' }).fetch(request, env, ctx);
  return withSecurityHeaders(mcpRes);
}
