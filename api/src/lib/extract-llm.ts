/**
 * LLM-backed entity extractor (cron-warm path only).
 *
 * Augments the regex/dictionary `extract()` with entities that are stated
 * in prose but missed by pattern matching: industry sectors, affected
 * vendor/product pairs, MITRE ATT&CK techniques, and CANDIDATE actor /
 * malware names worth analyst review.
 *
 * Reconciliation rules (defense in depth against hallucination):
 *   1. Strict JSON schema in the system prompt + low temperature.
 *   2. Tolerant parser — extracts the first balanced `{…}` substring so
 *      fenced/prose-wrapped responses still parse.
 *   3. Per-class validators drop malformed entries silently rather than
 *      rejecting the whole result.
 *   4. ATT&CK IDs must exist in `ATTACK_ID_INDEX` (the canonical MITRE
 *      catalog snapshot). Invented IDs (e.g. T9999) are dropped.
 *   5. Actor / malware candidates must appear VERBATIM (case-insensitive
 *      substring) in `title + body`. The LLM cannot manufacture a name.
 *   6. Candidates already canonicalized by `ACTOR_ALIASES` / `MALWARE_DICT`
 *      are dropped — they would already be in `view.threatActors[]` /
 *      `view.malware[]`.
 *   7. Hard caps on every list.
 *
 * Failure mode: any error (rate limit, parse failure, timeout, schema
 * mismatch) returns `{ ran: true, partial: true, …empty arrays }` with
 * a structured log — never throws.
 */

import type { Env } from '../env';
import type { ExtractedEntities } from './extract';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { MALWARE_DICT } from '../data/malware-dict';
import { ATTACK_ID_INDEX } from '../data/attack-id-index';
import { runCompletion as defaultRunCompletion } from '../case-study/generation/ai-client';

export interface LlmEntities {
  sectors: { name: string }[];
  affectedProducts: { vendor: string; product: string }[];
  attackPatterns: { id: string; name: string }[];
  actorCandidates: { name: string; rationale: string }[];
  malwareCandidates: { name: string; rationale: string }[];
  /** False when skipped (short body / no findings). True when the call was attempted. */
  ran: boolean;
  /** True when the call ran but parse/schema validation degraded the result. */
  partial: boolean;
  /** Provider:model that produced this result, when known. */
  modelUsed?: string;
}

export const EMPTY_LLM_ENTITIES: LlmEntities = {
  sectors: [],
  affectedProducts: [],
  attackPatterns: [],
  actorCandidates: [],
  malwareCandidates: [],
  ran: false,
  partial: false,
};

export interface ExtractLlmOptions {
  /** DI seam for tests. Defaults to the real runCompletion (Groq → Workers AI). */
  runCompletion?: typeof defaultRunCompletion;
  /** How many findings the source briefing had. 0 → skip the LLM call. */
  findingsCount?: number;
}

const MIN_BODY_CHARS = 600;

/** True when the LLM extractor should be invoked for this input. */
function shouldRunLlm(body: string, findingsCount: number | undefined): boolean {
  if (body.length < MIN_BODY_CHARS) return false;
  if (findingsCount !== undefined && findingsCount === 0) return false;
  return true;
}

/**
 * Extract the first balanced `{...}` substring from `text` and JSON.parse it.
 * Tolerates markdown fences, prose preambles, and trailing text. Returns
 * `null` on any failure — the caller turns that into `partial: true`.
 *
 * Brace-counting (rather than regex) keeps nested objects/arrays balanced.
 */
export function parseLlmJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const CAPS = {
  sectors: 8,
  affectedProducts: 12,
  attackPatterns: 16,
  actorCandidates: 4,
  malwareCandidates: 4,
} as const;

const ATTACK_ID_RE = /^T\d{4}(\.\d{3})?$/;

/** Build a case-insensitive lookup of every actor canonical + alias. */
const ACTOR_DICT_LOWER: Set<string> = (() => {
  const s = new Set<string>();
  for (const a of ACTOR_ALIASES) {
    s.add(a.canonical.toLowerCase());
    for (const alias of a.aliases) s.add(alias.toLowerCase());
  }
  return s;
})();

const MALWARE_DICT_LOWER: Set<string> = (() => {
  const s = new Set<string>();
  for (const m of MALWARE_DICT) {
    s.add(m.canonical.toLowerCase());
    for (const alias of m.aliases) s.add(alias.toLowerCase());
  }
  return s;
})();

function canonicalSector(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function asObject(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Validate + reconcile the parsed LLM JSON into a typed `LlmEntities`-shaped slice. */
export function validateLlmEntities(
  raw: unknown,
  title: string,
  body: string
): Omit<LlmEntities, 'ran' | 'partial' | 'modelUsed'> {
  const empty = {
    sectors: [] as LlmEntities['sectors'],
    affectedProducts: [] as LlmEntities['affectedProducts'],
    attackPatterns: [] as LlmEntities['attackPatterns'],
    actorCandidates: [] as LlmEntities['actorCandidates'],
    malwareCandidates: [] as LlmEntities['malwareCandidates'],
  };
  const obj = asObject(raw);
  if (!obj) return empty;

  // Sectors --------------------------------------------------------------
  const seenSectors = new Set<string>();
  const sectors: LlmEntities['sectors'] = [];
  for (const item of asArray(obj.sectors)) {
    if (!isString(item)) continue;
    const slug = canonicalSector(item);
    if (!slug || seenSectors.has(slug)) continue;
    seenSectors.add(slug);
    sectors.push({ name: slug });
    if (sectors.length >= CAPS.sectors) break;
  }

  // Affected products ----------------------------------------------------
  const seenProducts = new Set<string>();
  const affectedProducts: LlmEntities['affectedProducts'] = [];
  for (const item of asArray(obj.affected_products)) {
    const o = asObject(item);
    if (!o) continue;
    const vendor = isString(o.vendor) ? o.vendor.trim() : '';
    const product = isString(o.product) ? o.product.trim() : '';
    if (!vendor || !product) continue;
    const key = `${vendor.toLowerCase()}|${product.toLowerCase()}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    affectedProducts.push({ vendor, product });
    if (affectedProducts.length >= CAPS.affectedProducts) break;
  }

  // Attack patterns ------------------------------------------------------
  const seenAttack = new Set<string>();
  const attackPatterns: LlmEntities['attackPatterns'] = [];
  for (const item of asArray(obj.attack_patterns)) {
    const o = asObject(item);
    if (!o) continue;
    const id = isString(o.id) ? o.id.trim() : '';
    const name = isString(o.name) ? o.name.trim() : '';
    if (!ATTACK_ID_RE.test(id)) continue;
    if (!(id in ATTACK_ID_INDEX)) continue;
    if (seenAttack.has(id)) continue;
    seenAttack.add(id);
    attackPatterns.push({ id, name: name || id });
    if (attackPatterns.length >= CAPS.attackPatterns) break;
  }

  // Actor / malware candidates ------------------------------------------
  const haystack = `${title}\n${body}`.toLowerCase();
  const validateCandidates = (
    items: unknown[],
    dictLower: Set<string>,
    cap: number
  ): LlmEntities['actorCandidates'] => {
    const out: LlmEntities['actorCandidates'] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const o = asObject(item);
      if (!o) continue;
      const name = isString(o.name) ? o.name.trim() : '';
      const rationale = isString(o.rationale) ? o.rationale.trim() : '';
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      if (dictLower.has(lower)) continue; // already canonicalized
      if (!haystack.includes(lower)) continue; // verbatim-in-source guardrail
      seen.add(lower);
      out.push({ name, rationale });
      if (out.length >= cap) break;
    }
    return out;
  };
  const actorCandidates = validateCandidates(asArray(obj.actor_candidates), ACTOR_DICT_LOWER, CAPS.actorCandidates);
  const malwareCandidates = validateCandidates(
    asArray(obj.malware_candidates),
    MALWARE_DICT_LOWER,
    CAPS.malwareCandidates
  );

  return { sectors, affectedProducts, attackPatterns, actorCandidates, malwareCandidates };
}

export async function extractLlm(
  title: string,
  body: string,
  _entities: ExtractedEntities,
  _env: Env,
  options: ExtractLlmOptions = {}
): Promise<LlmEntities> {
  if (!shouldRunLlm(body, options.findingsCount)) {
    return { ...EMPTY_LLM_ENTITIES };
  }
  // Real LLM call wired in Task 4. Returning a stub for now so the skip-rule
  // tests don't require a real model.
  return { ...EMPTY_LLM_ENTITIES, ran: true };
}
