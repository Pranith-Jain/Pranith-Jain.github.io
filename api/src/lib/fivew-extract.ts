/**
 * 5W extraction (Who/What/When/Where/Why) — a single LLM call that
 * summarizes a report into a structured grid. Cheap, fast, and the
 * "Why" + "Who" fields are usually the most analyst-actionable.
 *
 * Modeled on ti-mindmap-hub's "5W Context" tab.
 *
 * Returns null on any failure so callers can degrade gracefully.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

export interface FiveW {
  who: string; // threat actor, group, or "Unknown" / "Unattributed"
  what: string; // one-sentence summary of what happened
  when: string; // ISO 8601 date or human-readable window
  where: string; // targeted sector / region / org type
  why: string; // motive (financial / espionage / hacktivism / disruption)
  /** Optional attribution basis — "claimed by X", "similar to Y", etc. */
  attribution_basis?: string;
  /** Confidence 0-1, set by validator. */
  confidence: number;
}

const SYSTEM = `You are a senior threat-intelligence analyst summarizing an incident into the classic 5W grid. Return STRICT JSON:

{
  "who": "<threat actor / group / 'Unattributed' / 'Unknown'>",
  "what": "<one-sentence summary of what happened, max 220 chars>",
  "when": "<ISO 8601 date or human-readable window, e.g. '2026-04-15' or 'early April 2026'>",
  "where": "<targeted sector / region / org type, max 120 chars>",
  "why": "<motive: financial / espionage / hacktivism / disruption / unknown — be specific>",
  "attribution_basis": "<if claiming attribution, the basis (e.g. 'TTP overlap with FIN7'); else null>"
}

Rules:
- Every field MUST be filled. Use "Unknown" or "Unattributed" rather than guessing.
- Be terse. Each field is a short phrase, not a paragraph.
- For 'when', prefer the date of intrusion/observation over publication date.
- For 'where', name the sector first (finance, healthcare, government…), then geography if known.
- Output JSON only. No prose, no markdown fences.`;

const TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 12_000;

export async function extractFiveW(text: string, env: Env): Promise<FiveW | null> {
  if (!text || text.trim().length < 100) return null;
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fivew timeout')), TIMEOUT_MS));
    const r = await Promise.race([
      runCompletion(
        env.AI,
        { system: SYSTEM, user: `REPORT:\n\n${input}`, maxTokens: 350, temperature: 0.2 },
        { groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);
    const raw = typeof r.text === 'string' ? r.text.trim() : '';
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    const parsed = JSON.parse(raw.slice(i, j + 1)) as Record<string, unknown>;
    const out: FiveW = {
      who: str(parsed.who) ?? 'Unknown',
      what: str(parsed.what) ?? '',
      when: str(parsed.when) ?? '',
      where: str(parsed.where) ?? '',
      why: str(parsed.why) ?? '',
      attribution_basis: str(parsed.attribution_basis) ?? undefined,
      confidence: 0, // filled in below
    };
    // Confidence: how concrete each field is.
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
