import type { Context } from 'hono';
import type { Env } from '../env';
import { indexDocument, queryCorpus } from '../lib/rag-embedder';

/**
 * Index fresh content from D1 (telegram leaks) into Vectorize.
 * Called by cron + manually for warm-up.
 */
export async function indexTelegramLeaks(env: Env): Promise<{ indexed: number; errors: number }> {
  const db = env.BRIEFINGS_DB;
  if (!db || !env.VECTORIZE) return { indexed: 0, errors: 0 };

  let indexed = 0;
  let errors = 0;

  try {
    const rows = (await db
      .prepare(
        `SELECT id, channel_handle, message_text, leak_type, severity, discovered_at
       FROM telegram_leak_entries
       WHERE message_text IS NOT NULL AND length(message_text) > 20
       ORDER BY discovered_at DESC LIMIT 500`
      )
      .all()) as {
      results?: Array<{
        id: number;
        channel_handle: string;
        message_text: string;
        leak_type: string;
        severity: string;
        discovered_at: string;
      }>;
    };

    for (const row of rows.results ?? []) {
      try {
        const n = await indexDocument(env, {
          source_id: `telegram-leak-${row.id}`,
          source_type: 'telegram_leak',
          title: `[${row.severity}] ${row.leak_type} by ${row.channel_handle}`,
          url: undefined,
          text: row.message_text,
          timestamp: row.discovered_at,
          tags: [row.leak_type, row.severity, row.channel_handle],
        });
        indexed += n;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  return { indexed, errors };
}

// ── API Handlers ──────────────────────────────────────────────────────────

export async function ragIndexHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const result = await indexTelegramLeaks(c.env);
  return c.json({
    ok: true,
    ...result,
    message: `Indexed ${result.indexed} vectors from telegram leaks (${result.errors} errors)`,
  });
}

export async function ragQueryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ error: 'q query param required' }, 400);

  const typeFilter = c.req.query('type');
  const topK = Math.min(20, parseInt(c.req.query('topK') ?? '8', 10));

  const results = await queryCorpus(c.env, q, topK, typeFilter);
  return c.json(
    {
      query: q,
      type_filter: typeFilter ?? null,
      top_k: topK,
      results_count: results.length,
      results,
      generated_at: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
