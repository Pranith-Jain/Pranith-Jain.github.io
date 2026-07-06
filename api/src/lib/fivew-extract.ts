/**
 * 5W extraction (Who/What/When/Where/Why) — a single LLM call that
 * summarizes a report into a structured grid. Cheap, fast, and the
 * "Why" + "Who" fields are usually the most analyst-actionable.
 *
 * Modeled on ti-mindmap-hub's "5W Context" tab.
 *
 * Returns null on any failure so callers can degrade gracefully.
 * Retries once with a simplified prompt if the first attempt fails.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';
import { extractJson } from './llm-json';

export interface FiveW {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how?: string;
  so_what?: string;
  what_next?: string;
  attribution_basis?: string;
  confidence: number;
}

const SYSTEM = `You are a senior threat-intelligence analyst summarizing an incident into the expanded 5W+ grid. Return STRICT JSON:

{
  "who": "<threat actor / group / 'Unattributed' / 'Unknown'>",
  "what": "<one-sentence summary of what happened, max 220 chars>",
  "when": "<ISO 8601 date or human-readable window>",
  "where": "<targeted sector / region / org type, max 120 chars>",
  "why": "<motive: financial / espionage / hacktivism / disruption / unknown>",
  "how": "<specific attack chain summary: initial access → lateral movement → impact, 2-3 sentences>",
  "so_what": "<why this matters to defenders: what's the strategic significance>",
  "what_next": "<what defenders should expect: will this actor continue, what's the likely next move>",
  "attribution_basis": "<if claiming attribution, the basis; else null>"
}

Rules:
- Every field MUST be filled. Use "Unknown" or "Unattributed" rather than guessing.
- Be terse for who/what/when/where/why. Be more detailed for how/so_what/what_next.
- For 'how', describe the actual attack chain observed in the report.
- For 'so_what', explain why this threat matters beyond the immediate incident.
- For 'what_next', predict likely future activity based on the actor's patterns.
- Output JSON only. No prose, no markdown fences.`;

const RETRY_SYSTEM = `Return a JSON object with exactly these keys: who, what, when, where, why, how, so_what, what_next, attribution_basis. All values must be strings. attribution_basis can be null.`;

const TIMEOUT_MS = 25_000;
const MAX_INPUT_CHARS = 12_000;

export async function extractFiveW(text: string, env: Env): Promise<FiveW | null> {
  if (!text || text.trim().length < 100) return null;
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;

  // Attempt 1: full prompt
  const result = await tryExtract(SYSTEM, input, env);
  if (result) return result;

  // Attempt 2: simplified prompt
  return tryExtract(RETRY_SYSTEM, input, env);
}

async function tryExtract(system: string, input: string, env: Env): Promise<FiveW | null> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fivew timeout')), TIMEOUT_MS));
    const r = await Promise.race([
      runCompletion(
        env.AI,
        { system, user: `REPORT:\n\n${input}`, maxTokens: 350, temperature: 0.2 },
        { googleKey: env.GOOGLE_AI_STUDIO_API_KEY, groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);
    const raw = typeof r.text === 'string' ? r.text : '';
    const parsed = extractJson<Record<string, unknown>>(raw);
    if (!parsed) return null;
    const out: FiveW = {
      who: str(parsed.who) ?? 'Unknown',
      what: str(parsed.what) ?? '',
      when: str(parsed.when) ?? '',
      where: str(parsed.where) ?? '',
      why: str(parsed.why) ?? '',
      how: str(parsed.how) ?? undefined,
      so_what: str(parsed.so_what) ?? undefined,
      what_next: str(parsed.what_next) ?? undefined,
      attribution_basis: str(parsed.attribution_basis) ?? undefined,
      confidence: 0,
    };
    let filled = 0;
    for (const k of ['who', 'what', 'when', 'where', 'why'] as const) {
      if (out[k] && !/^(unknown|unattributed|n\/a)$/i.test(out[k])) filled += 1;
    }
    out.confidence = Math.round((filled / 5) * 100) / 100;
    return out;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}
