/**
 * GET /api/v1/briefings/:slug/render — render a briefing as
 * TI Mindmap HUB-style rich markdown.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { readBriefing } from '../lib/briefing-builder/build';
import { renderBriefingMarkdown } from '../lib/briefing-markdown-renderer';

export async function briefingRenderHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) return c.json({ error: 'bad_request', message: 'missing slug' }, 400);
  try {
    const db = c.env.BRIEFINGS_DB;
    if (!db) return c.json({ error: 'unavailable', message: 'BRIEFINGS_DB not bound' }, 503);
    const briefing = await readBriefing(db, slug);
    if (!briefing) return c.json({ error: 'not_found', message: `briefing ${slug} not found` }, 404);
    const md = renderBriefingMarkdown(briefing);
    // Return JSON so MCP's apiFetch (which always calls res.json()) can
    // consume it.
    return c.json({ markdown: md }, 200);
  } catch (e) {
    console.error('briefingRenderHandler failed:', e instanceof Error ? e.message : String(e));
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: 'render_failed', message: msg }, 500);
  }
}
