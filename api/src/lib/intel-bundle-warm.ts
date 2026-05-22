/**
 * Cron-warmed intel-bundle pre-builder.
 *
 * The on-demand path (`routes/intel-bundle.ts`) builds bundles lazily on
 * first card render: extract → enrichBulk → enrichCves → buildStixBundle →
 * D1 write. That first hit pays ~35 fresh provider lookups + KEV + EPSS,
 * which adds 2–5s to a page that otherwise renders instantly.
 *
 * This warmer takes that cost off the user's render. Run as its own
 * dedicated cron (`7 * * * *`) so it owns the per-invocation 50-subrequest
 * budget and doesn't contend with the hourly publisher/telegram-archive.
 *
 * Strategy:
 *   - Pick the oldest briefings rows (last `lookbackDays`) that have no
 *     corresponding `intel_bundles` row → FIFO backfill.
 *   - Cap items per invocation. Each pipeline run burns up to ~37
 *     subrequests (`MAX_FRESH_SUBREQUESTS=35` + KEV + EPSS), so default
 *     is 1 per cron firing. 24 firings/day comfortably outpaces the 1–2
 *     briefings/day this site emits.
 *   - Idempotent: `writeBundle`'s UPSERT only rewrites when the
 *     `extracted_hash` changes, and STIX IDs are deterministic
 *     UUIDv5s — running the warmer twice on the same row is safe.
 *   - Best-effort: any per-row failure is logged and the loop continues.
 *     A failing row stays "uncached" and gets retried on the next firing.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { extract } from './extract';
import { enrichBulk } from './enrich-bulk';
import { enrichCves } from './cve-enrich';
import { buildStixBundle, type ReportInput } from './stix-build';
import type { Briefing, BriefingFinding, BriefingSection } from './briefing-builder';
import { extractLlm as defaultExtractLlm } from './extract-llm';

export interface WarmOptions {
  /** Max briefings to process per invocation. Default 1 (subrequest-budget safe). */
  maxItems?: number;
  /** How far back to look for un-warmed briefings. Default 7 days. */
  lookbackDays?: number;
  /** DI seam for the LLM extractor. Tests pass a stub here. */
  extractLlm?: typeof defaultExtractLlm;
}

export interface WarmResult {
  /** Slugs whose bundles were built in this invocation. */
  built: string[];
  /** Slugs we tried but failed (logged for ops; loop continued). */
  failed: { slug: string; error: string }[];
  /** True when more candidates exist beyond the cap — next firing will catch up. */
  hasMore: boolean;
}

interface BriefingRow {
  slug: string;
  body: string;
  title: string;
  generated_at: string | null;
}

/**
 * Build the same `intelBody` string as `BriefingDetail.tsx` constructs
 * client-side, so the warm path produces a byte-identical extraction input
 * to the on-demand path. If the two ever diverge, the warmer would build a
 * different `extracted_hash` and the on-demand re-render would NOT use the
 * D1 row — defeating the warmer's purpose. Keep this in sync with the
 * frontend useMemo in `src/pages/dfir/BriefingDetail.tsx`.
 */
export function buildIntelBody(briefing: Briefing): string {
  const parts: string[] = [briefing.executive_summary];
  for (const s of briefing.sections as BriefingSection[]) {
    parts.push(`\n\n## ${s.title}\n${s.blurb}`);
    for (const f of (s.findings ?? []) as BriefingFinding[]) {
      parts.push(`\n### ${f.title}\n${f.description}`);
    }
  }
  return parts.join('\n');
}

async function selectCandidates(db: D1Database, lookbackDays: number, limit: number): Promise<BriefingRow[]> {
  // Subquery is cheap — intel_bundles has a unique index on
  // (source_id, item_ref) and the lookback window keeps the briefings
  // scan bounded. The ORDER BY range_end ASC means we backfill oldest-
  // first, so a transient outage that misses today still gets paid back
  // tomorrow without dropping work on the floor.
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const stmt = db
    .prepare(
      `SELECT b.slug, b.body, b.title, b.created_at as generated_at
         FROM briefings b
         WHERE b.range_end >= ?
           AND NOT EXISTS (
             SELECT 1 FROM intel_bundles ib
               WHERE ib.source_id = 'briefings'
                 AND ib.item_ref = b.slug
           )
         ORDER BY b.range_end ASC
         LIMIT ?`
    )
    .bind(cutoff, limit + 1);
  const res = await stmt.all<BriefingRow>();
  return res.results ?? [];
}

/**
 * One-shot warm pass. Caller is responsible for invocation cadence
 * (the cron handler in `worker/index.ts`).
 */
export async function warmIntelBundles(env: Env, options: WarmOptions = {}): Promise<WarmResult> {
  const maxItems = options.maxItems ?? 1;
  const lookbackDays = options.lookbackDays ?? 7;
  const out: WarmResult = { built: [], failed: [], hasMore: false };

  const db = env.BRIEFINGS_DB;
  if (!db) return out;

  // Fetch one extra row so we can report whether more work is queued
  // without a second COUNT(*) query.
  const candidates = await selectCandidates(db, lookbackDays, maxItems);
  if (candidates.length > maxItems) {
    out.hasMore = true;
    candidates.length = maxItems;
  }

  for (const row of candidates) {
    try {
      const briefing = JSON.parse(row.body) as Briefing;
      const report: ReportInput = {
        sourceId: 'briefings',
        sourceName: 'Briefings',
        itemRef: row.slug,
        title: briefing.title ?? row.title,
        body: buildIntelBody(briefing),
        publishedAt: briefing.generated_at ?? row.generated_at,
        tlp: 'WHITE',
      };
      const entities = extract(report.title, report.body);
      const findingsCount = briefing.sections.reduce((n, s) => n + (s.findings?.length ?? 0), 0);
      const extractLlmFn = options.extractLlm ?? defaultExtractLlm;
      const [bulk, cveEnrichments, llmEntities] = await Promise.all([
        enrichBulk(
          entities.iocs.map((i) => ({ type: i.type, value: i.value })),
          env
        ),
        enrichCves(entities.cves),
        extractLlmFn(report.title, report.body, entities, env, { findingsCount }),
      ]);
      const built = await buildStixBundle(report, entities, bulk, cveEnrichments, llmEntities);

      await db
        .prepare(
          `INSERT INTO intel_bundles
             (id, source_id, item_ref, report_id, title, published_at,
              extracted_hash, bundle_json, view_json, ioc_count, actor_count, malware_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             updated_at = datetime('now'),
             extracted_hash = excluded.extracted_hash,
             bundle_json = excluded.bundle_json,
             view_json = excluded.view_json,
             ioc_count = excluded.ioc_count,
             actor_count = excluded.actor_count,
             malware_count = excluded.malware_count
           WHERE intel_bundles.extracted_hash != excluded.extracted_hash`
        )
        .bind(
          built.bundle.id,
          report.sourceId,
          report.itemRef,
          built.view.reportId,
          built.view.title,
          report.publishedAt ?? null,
          built.view.extractedHash,
          JSON.stringify(built.bundle),
          JSON.stringify(built.view),
          built.view.iocs.length,
          built.view.threatActors.length,
          built.view.malware.length
        )
        .run();
      out.built.push(row.slug);
    } catch (err) {
      out.failed.push({ slug: row.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return out;
}
