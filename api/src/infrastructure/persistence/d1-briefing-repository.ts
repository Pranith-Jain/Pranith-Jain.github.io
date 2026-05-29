import type { D1Database } from '@cloudflare/workers-types';
import type { Briefing, BriefingType } from '../../core/entities';
import type { IBriefingRepository } from '../../core/ports';

function rowToBriefing(row: Record<string, unknown>): Briefing {
  return {
    slug: row.slug as string,
    type: row.type as BriefingType,
    title: row.title as string,
    date: row.date as string,
    summary: row.summary as string,
    sections: JSON.parse(row.sections as string),
    tags: row.tags ? JSON.parse(row.tags as string) : undefined,
    published: Boolean(row.published),
    created_at: row.created_at as string,
  };
}

export function createD1BriefingRepository(db: D1Database): IBriefingRepository {
  return {
    async list(type?: BriefingType, limit?: number) {
      const records = type
        ? await db
            .prepare('SELECT * FROM briefings WHERE type = ? ORDER BY date DESC LIMIT ?')
            .bind(type, limit ?? 10)
            .all<Record<string, unknown>>()
        : await db
            .prepare('SELECT * FROM briefings ORDER BY date DESC LIMIT ?')
            .bind(limit ?? 10)
            .all<Record<string, unknown>>();
      return (records.results as Record<string, unknown>[]).map(rowToBriefing);
    },

    async get(slug: string) {
      const { results } = await db
        .prepare('SELECT * FROM briefings WHERE slug = ?')
        .bind(slug)
        .all<Record<string, unknown>>();
      const rows = results as Record<string, unknown>[];
      return rows.length > 0 ? rowToBriefing(rows[0]!) : null;
    },

    async today(type: BriefingType) {
      const today = new Date().toISOString().slice(0, 10);
      const { results } = await db
        .prepare('SELECT * FROM briefings WHERE type = ? AND date = ? LIMIT 1')
        .bind(type, today)
        .all<Record<string, unknown>>();
      const rows = results as Record<string, unknown>[];
      return rows.length > 0 ? rowToBriefing(rows[0]!) : null;
    },

    async save(briefing: Briefing) {
      await db
        .prepare(
          'INSERT OR REPLACE INTO briefings (slug, type, title, date, summary, sections, tags, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          briefing.slug,
          briefing.type,
          briefing.title,
          briefing.date,
          briefing.summary,
          JSON.stringify(briefing.sections),
          briefing.tags ? JSON.stringify(briefing.tags) : null,
          briefing.published ? 1 : 0
        )
        .run();
    },

    async sweep(maxAgeDays: number) {
      const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
      const { meta } = await db.prepare('DELETE FROM briefings WHERE date < ?').bind(cutoff).run();
      return meta.changes ?? 0;
    },
  };
}
