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
