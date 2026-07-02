/**
 * MCP server handler — authenticates and dispatches /api/mcp requests
 * to the DfirMcpServer Durable Object.
 */

import { DfirMcpServer } from './mcp-server';
import { withSecurityHeaders } from './csp';
import { validateRawKey } from '../api/src/lib/auth';
import type { Env } from './env';

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mcp')) return null;

  // Require a valid API key to open an MCP session.
  if (request.method !== 'OPTIONS') {
    const authz = request.headers.get('authorization') ?? '';
    const rawKey = /^Bearer\s+(\S+)/i.exec(authz)?.[1] ?? request.headers.get('x-api-key') ?? '';
    const valid = env.BRIEFINGS_DB ? await validateRawKey(env.BRIEFINGS_DB, rawKey) : null;
    if (!valid) {
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'valid api key required for MCP' }), {
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
