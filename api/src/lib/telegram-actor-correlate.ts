/**
 * Telegram → Actor correlation helper.
 *
 * Three independent data sources are joined to attribute a Telegram handle
 * to a known threat actor:
 *
 *   1. deepdarkCTI `telegram_threat_actors.md` (already parsed and cached
 *      at `https://deepdarkcti-cache.internal/v1` by `routes/deepdarkcti.ts`).
 *      The parser already maps URL → `actor` + `attack_type`, so the join
 *      is URL-keyed. This is the highest-confidence signal: a researcher
 *      explicitly named the handle.
 *
 *   2. The in-repo `THREAT_ACTORS` catalog in
 *      `src/data/threatintel/threat-actor-catalog.ts` — operator-curated
 *      `telegram_handles: string[]` per actor, back-filled from public
 *      vendor reports (Group-IB, Flashpoint, CrowdStrike, MITRE). Sourced
 *      from a generated bundle (`_telegram-actor-catalog.generated.ts`,
 *      built by `scripts/build-telegram-actor-catalog.mjs`) so the import
 *      resolves inside the Worker bundle at compile time.
 *
 *   3. MISP Galaxy threat actors (loaded on-demand from the MISP cache at
 *      `https://misp-galaxy-actors.internal/v1`). MISP ships an
 *      `associated-telegram-handle` custom field on a small fraction of
 *      actors; lower confidence but global coverage. MISP is loaded
 *      lazily — only the per-handle subset is read for any given request,
 *      not the whole 600 KB actor blob.
 *
 * Output: a list of `ActorHit` objects tagged with the source(s) that
 * surfaced the attribution. Sources are scored 0-1 so the UI can pick a
 * single "best" hit and show the others as supporting evidence.
 */

import type { DDCEntry } from './deepdarkcti-parser';
import { safeNullLog } from './safe-catch';
import { TELEGRAM_ACTOR_CATALOG, type TelegramActorCatalogEntry } from './_telegram-actor-catalog.generated';

export type CorrelationSource = 'deepdarkcti' | 'catalog' | 'misp';

export interface ActorHit {
  /** Stable actor ID — `actor.id` from the in-repo catalog, MISP value, or
   *  the deepdarkCTI `actor` string when no other ID is available. */
  actor_id: string;
  /** Display name. */
  name: string;
  /** Country (flag + name) when known; empty string when not. */
  country: string;
  /** Actor type: apt / cybercrime / ransomware / hacktivist / etc. */
  type: string;
  /** Confidence in the attribution from this source (0-1). */
  confidence: number;
  /** Which source(s) surfaced this hit. Multiple = stronger signal. */
  sources: CorrelationSource[];
  /** Human-readable citation per source. */
  citations: string[];
  /** Free-form note (e.g. MISP "associated-telegram-handle" custom field). */
  note?: string;
}

// ─── In-repo catalog (operator-curated) ──────────────────────────────────────

let catalogByHandle: Map<string, TelegramActorCatalogEntry[]> | null = null;

/** Build a handle→actor index once at module load. Cheap (35 entries). */
function getCatalogByHandle(): Map<string, TelegramActorCatalogEntry[]> {
  if (catalogByHandle) return catalogByHandle;
  const byHandle = new Map<string, TelegramActorCatalogEntry[]>();
  for (const a of TELEGRAM_ACTOR_CATALOG) {
    for (const handle of a.telegram_handles) {
      const k = handle.toLowerCase();
      const arr = byHandle.get(k) ?? [];
      arr.push(a);
      byHandle.set(k, arr);
    }
  }
  catalogByHandle = byHandle;
  return byHandle;
}

// ─── deepdarkCTI ────────────────────────────────────────────────────────────

const DDC_CACHE_KEY = 'https://deepdarkcti-cache.internal/v1';

// Per-Cache DDC payload memo. Keyed by the cache instance (or sentinel
// `null`) so test fakes and production caches never collide. Production
// callers pass `caches.default` — the same instance across the worker
// lifetime, so the memo is effectively a process-wide cache with the
// 6h TTL below.
const ddcCacheByInput = new WeakMap<Cache, { entries: DDCEntry[]; loadedAt: number }>();
let ddcCacheNull: { entries: DDCEntry[]; loadedAt: number } | null = null;
const DDC_TTL_MS = 6 * 60 * 60 * 1000;

async function loadDDC(cache: Cache | null): Promise<DDCEntry[]> {
  const existing = cache ? ddcCacheByInput.get(cache) : ddcCacheNull;
  if (existing && Date.now() - existing.loadedAt < DDC_TTL_MS) return existing.entries;
  let entries: DDCEntry[] = [];
  if (cache) {
    const cached = await safeNullLog('tac-ddc-cache', cache.match(new Request(DDC_CACHE_KEY)));
    if (cached) {
      try {
        const body = (await cached.json()) as { entries: DDCEntry[] };
        entries = body.entries ?? [];
      } catch {
        entries = [];
      }
    }
  }
  const fresh = { entries, loadedAt: Date.now() };
  if (cache) ddcCacheByInput.set(cache, fresh);
  else ddcCacheNull = fresh;
  return entries;
}

/** Pull the handle out of a deepdarkCTI entry's URL field. */
function handleFromUrl(url: string): string | null {
  // deepdarkCTI stores `https://t.me/<handle>` (with or without trailing
  // path components) for Telegram entries. Other URLs (Discord, Twitter,
  // onion) are skipped.
  const m = url.match(/^https?:\/\/t\.me\/(?:s\/)?([a-zA-Z][a-zA-Z0-9_]{3,31})/);
  return m ? m[1]! : null;
}

// ─── MISP Galaxy actors ─────────────────────────────────────────────────────

interface MispActor {
  uuid?: string;
  value: string;
  meta?: {
    synonyms?: string[];
    'associated-telegram-handle'?: string | string[];
    country?: string;
    'attribution-confidence'?: string;
    [k: string]: unknown;
  };
}

const mispCacheByInput = new WeakMap<Cache, { actors: MispActor[]; loadedAt: number }>();
let mispCacheNull: { actors: MispActor[]; loadedAt: number } | null = null;
const MISP_TTL_MS = 12 * 60 * 60 * 1000;

async function loadMisp(cache: Cache | null): Promise<MispActor[]> {
  const existing = cache ? mispCacheByInput.get(cache) : mispCacheNull;
  if (existing && Date.now() - existing.loadedAt < MISP_TTL_MS) return existing.actors;
  let actors: MispActor[] = [];
  if (cache) {
    const cached = await safeNullLog(
      'tac-misp-cache',
      cache.match(new Request('https://misp-galaxy-actors.internal/v1'))
    );
    if (cached) {
      try {
        const body = (await cached.json()) as { values: MispActor[] };
        actors = body.values ?? [];
      } catch {
        actors = [];
      }
    }
  }
  const fresh = { actors, loadedAt: Date.now() };
  if (cache) mispCacheByInput.set(cache, fresh);
  else mispCacheNull = fresh;
  return actors;
}

function mispTelegramHandles(actor: MispActor): string[] {
  const m = actor.meta?.['associated-telegram-handle'];
  if (!m) return [];
  if (Array.isArray(m)) return m;
  return [m];
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface CorrelateOptions {
  /** Cloudflare Cache API for MISP + DDC fetches. Optional. */
  cache?: Cache | null;
}

/**
 * Given a Telegram handle, return every actor attributed to it across the
 * three sources. Results are de-duplicated by `actor_id`; multiple-source
 * hits carry every source in `sources` and have a higher cumulative
 * confidence.
 */
export async function correlateHandle(
  handle: string,
  opts: CorrelateOptions = {}
): Promise<ActorHit[]> {
  const key = handle.replace(/^@/, '').toLowerCase();
  if (!key) return [];

  const cache = opts.cache ?? null;
  const [byHandle, ddcEntries, mispActors] = await Promise.all([
    Promise.resolve(getCatalogByHandle()),
    loadDDC(cache),
    loadMisp(cache),
  ]);

  const byActorId = new Map<string, ActorHit>();

  // 1) Operator-curated catalog — highest confidence, explicit attribution.
  for (const actor of byHandle.get(key) ?? []) {
    const idx = (actor.telegram_handles ?? []).findIndex((h) => h.toLowerCase() === key);
    const source = actor.telegram_handles_source?.[idx] ?? 'in-repo catalog';
    byActorId.set(actor.id, {
      actor_id: actor.id,
      name: actor.name,
      country: actor.country,
      type: actor.type,
      confidence: 0.9,
      sources: ['catalog'],
      citations: [source],
    });
  }

  // 2) deepdarkCTI — researcher-curated, slightly lower confidence.
  for (const entry of ddcEntries) {
    const h = handleFromUrl(entry.url ?? '');
    if (!h || h.toLowerCase() !== key) continue;
    if (entry.category !== 'Threat-Actor Telegram') continue;
    const id = entry.actor ?? entry.name;
    const existing = byActorId.get(id);
    if (existing) {
      existing.sources.push('deepdarkcti');
      existing.citations.push(`deepdarkCTI: ${entry.attack_type ?? 'telegram_threat_actors.md'}`);
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      if (!existing.country && entry.actor) existing.country = '';
    } else {
      byActorId.set(id, {
        actor_id: id,
        name: entry.name,
        country: '',
        type: 'unknown',
        confidence: 0.7,
        sources: ['deepdarkcti'],
        citations: [
          `deepdarkCTI ${entry.attack_type ? `(${entry.attack_type})` : 'telegram_threat_actors.md'}`,
        ],
        note: entry.notes,
      });
    }
  }

  // 3) MISP Galaxy — loosest match; only kicks in for explicit custom field.
  for (const actor of mispActors) {
    const handles = mispTelegramHandles(actor).map((h) => h.toLowerCase());
    if (!handles.includes(key)) continue;
    const existing = byActorId.get(actor.value);
    if (existing) {
      existing.sources.push('misp');
      existing.citations.push(`MISP Galaxy: ${actor.value}`);
      existing.confidence = Math.min(1, existing.confidence + 0.1);
    } else {
      const country = actor.meta?.country;
      byActorId.set(actor.value, {
        actor_id: actor.value,
        name: actor.value,
        country: typeof country === 'string' ? country : '',
        type: 'unknown',
        confidence: 0.55,
        sources: ['misp'],
        citations: ['MISP Galaxy: associated-telegram-handle'],
      });
    }
  }

  return Array.from(byActorId.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Reverse-lookup: for a given actor, return every Telegram handle linked
 * to it across the same three sources. Used by the actor detail page.
 */
export async function handlesForActor(actorId: string, opts: CorrelateOptions = {}): Promise<string[]> {
  const cache = opts.cache ?? null;
  const [byHandle, ddcEntries, mispActors] = await Promise.all([
    Promise.resolve(getCatalogByHandle()),
    loadDDC(cache),
    loadMisp(cache),
  ]);

  const out = new Set<string>();

  // Catalog
  for (const [handle, actors] of byHandle.entries()) {
    if (actors.some((a) => a.id === actorId)) out.add(handle);
  }

  // deepdarkCTI
  for (const entry of ddcEntries) {
    if (entry.category !== 'Threat-Actor Telegram') continue;
    if (entry.actor === actorId) {
      const h = handleFromUrl(entry.url ?? '');
      if (h) out.add(h.toLowerCase());
    }
  }

  // MISP
  for (const actor of mispActors) {
    if (actor.value !== actorId) continue;
    for (const h of mispTelegramHandles(actor)) out.add(h.toLowerCase());
  }

  return Array.from(out);
}
