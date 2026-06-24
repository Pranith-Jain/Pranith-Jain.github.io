import { useEffect, useRef, useState } from 'react';
import { adminAuthHeaders, readAdminToken } from '../../lib/admin-token';

/**
 * usePostSummaries — fetch per-post AI summaries for a feed.
 *
 * Companion to <AiSummaryCard> (the page-level summary). Given the visible
 * feed items, POSTs the top `max` to /api/v1/ai-item-summary and returns a
 * Map<id, summary>. The backend caches each item in KV by content hash, so
 * repeated loads are free; this hook additionally remembers which ids it has
 * already requested so a re-render (or a live feed reshuffle) never re-asks
 * for a summary it already has.
 *
 * Gated on the admin token by default (requireAdmin), mirroring the page-level
 * card: per-post summarisation is LLM-heavy, so only signed-in admins trigger
 * it. Public visitors get an empty map and the posts render without a line.
 */

export interface SummarisableItem {
  id: string;
  title: string;
  body?: string;
  source?: string;
}

export interface UsePostSummariesOpts {
  /** Surface name (telemetry only). */
  surface: string;
  /** Visible feed items, in display order. */
  items: SummarisableItem[];
  /** Max items to summarise (matches the server cap of 10). */
  max?: number;
  /** Require an admin token to fetch. Default true. */
  requireAdmin?: boolean;
  /** Master switch (e.g. a per-page toggle). Default true. */
  enabled?: boolean;
}

interface ItemSummaryResponse {
  summaries?: Record<string, string>;
}

const ENDPOINT = '/api/v1/ai-item-summary';
const DEFAULT_MAX = 10;

export function usePostSummaries(opts: UsePostSummariesOpts): Map<string, string> {
  const { surface, items, max = DEFAULT_MAX, requireAdmin = true, enabled = true } = opts;
  const [summaries, setSummaries] = useState<Map<string, string>>(new Map());

  // Ids we've already requested (resolved or not) — never re-ask.
  const requestedRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<AbortController | null>(null);

  const allowed = enabled && (requireAdmin ? readAdminToken() !== null : true);

  // The top-N candidate ids drive the effect; join to a stable dep string.
  const candidates = allowed ? items.filter((it) => it && it.id && it.title).slice(0, max) : [];
  const pending = candidates.filter((it) => !requestedRef.current.has(it.id));
  const pendingKey = pending.map((it) => it.id).join('|');

  useEffect(() => {
    if (!allowed || pending.length === 0) return;
    // Mark requested up-front so a re-render mid-flight doesn't double-post.
    pending.forEach((it) => requestedRef.current.add(it.id));

    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 25_000);

    (async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { ...(requireAdmin ? adminAuthHeaders() : {}), 'content-type': 'application/json' },
          body: JSON.stringify({
            surface,
            items: pending.map((it) => ({
              id: it.id,
              title: it.title,
              body: it.body ?? '',
              source: it.source,
            })),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || ctrl.signal.aborted) return;
        const json = (await res.json()) as ItemSummaryResponse;
        if (ctrl.signal.aborted || !json.summaries) return;
        const entries = Object.entries(json.summaries);
        if (entries.length === 0) return;
        setSummaries((prev) => {
          const next = new Map(prev);
          for (const [id, summary] of entries) next.set(id, summary);
          return next;
        });
      } catch {
        /* network/abort — leave those ids un-summarised (posts render plain) */
      } finally {
        clearTimeout(timer);
        if (inflightRef.current === ctrl) inflightRef.current = null;
      }
    })();

    return () => {
      ctrl.abort();
    };
    // pendingKey captures the exact set of new ids to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, allowed, requireAdmin, surface]);

  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      inflightRef.current = null;
    };
  }, []);

  return summaries;
}
