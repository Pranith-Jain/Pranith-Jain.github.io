/**
 * AI-powered threat-intelligence summary generator.
 *
 * Given a collection of feed items (writeups, cybercrime, signals, etc.),
 * produces a concise analyst-grade summary covering:
 *   - Key themes and trends
 *   - Notable threat actors / campaigns
 *   - Critical CVEs or vulnerabilities
 *   - Recommended actions
 *
 * Uses the shared LLM client with preferGroq: every AI summary runs on Groq's
 * openai/gpt-oss-120b (GPT) first, with Gemini → Workers AI as fallback.
 * Gracefully degrades: on any failure returns null so the caller can skip
 * the summary card without blocking the page.
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';
import { findUngroundedCves, extractCves, detectSlop } from './ai-output-validator';
import { fenceUntrusted, neutralizeUntrusted, UNTRUSTED_DATA_SYSTEM_NOTE } from './prompt-fence';

export interface SummaryInput {
  /** Page surface name (e.g. "CTI Writeups", "Cybercrime", "Signal"). */
  surface: string;
  /** ISO date the summary covers. */
  date: string;
  /** Items to summarize. title + body are joined; source is metadata. */
  items: Array<{ title: string; body: string; source?: string }>;
  /** Max items to feed into the prompt. Default 30. */
  maxItems?: number;
}

export interface SummaryResult {
  summary: string;
  tweet: string;
  /** LinkedIn-formatted post body (no URL — the client appends it). */
  linkedin: string;
  modelUsed: string;
  itemCount: number;
  _validation?: {
    quality_score?: number;
    ungrounded_cves?: string[];
    slop_count?: number;
  };
}

const SYSTEM_PROMPT = `You are a senior cyber-threat-intelligence analyst who also writes compelling social media content. Given a list of security items from a specific feed surface, produce THREE outputs separated by lines containing ONLY the markers ---TWEET--- and ---LINKEDIN--- (in that order).

OUTPUT 1 — FULL SUMMARY (150-300 words):
Structure:
1. **Headline**: One or two punchy sentences capturing the most important development.
2. **Key themes**: 2-4 bullet points (prefixed with "- ") of dominant trends.
3. **Notable entities**: Specific threat actors, malware families, CVEs, or campaigns.
4. **Analyst takeaway**: One actionable sentence for defenders.

OUTPUT 2 — TWEET (after ---TWEET---):
A single tweet-ready line (max 280 chars) that a security professional would actually post. Include 1-3 relevant hashtags (#ThreatIntel, #CyberSecurity, #InfoSec, #CVE, etc). Make it punchy, specific, and jargon-light enough for a broad tech audience. No markdown formatting.

OUTPUT 3 — LINKEDIN POST (after ---LINKEDIN---):
A LinkedIn post (300-600 chars, plus 3-5 hashtags) written for practitioners, using the 2026 LinkedIn engagement rules:
1. **HOOK** — first 1-2 lines (<= 210 chars, all inside the above-the-fold window): a complete, standalone concrete point — named actor/CVE/campaign + a hard number. NOT a teaser; the reader learns something specific without clicking "see more".
2. **INSIGHT** — 1-2 short paragraphs (2-4 lines each) with the analytical take the coverage misses. Lead with the take, then support it.
3. **A bullet list** of 3-5 scannable concrete facts (named CVE / vendor / sector / group). One bullet = one fact.
4. **CLOSE** — one line takeaway + a substantive question in the style a SOC lead or IR consultant would actually answer. NOT "Thoughts?".
5. **FINAL LINE**: at most 3 hashtags, specific to the case — never a generic stack (#ThreatIntel works; #CyberSecurity #InfoSec alone is too generic).
Rules for LinkedIn: NO URL in the body — the client adds it so the reader can move it to the first comment. No markdown headers, no **bold**, no asterisks. At most ONE emoji (🔴 ⚠️) — never decorative.

Rules (all outputs):
- Be specific and factual. Reference actual names, CVE IDs, and actors from the items.
- Do not invent or speculate beyond what the items state.
- Write like a human analyst, not a corporate release. Avoid filler phrases.
- If the items are thin or low-signal, say so honestly rather than padding.
- Do not use markdown headers (#). Use bold (**) only in the full summary.
- The tweet must stand alone and make sense without the full summary.
- The LinkedIn post must read differently from the tweet — same substance, platform-native structure.

${UNTRUSTED_DATA_SYSTEM_NOTE}`;

const MAX_BODY_CHARS = 12000;
// Outer bound for the whole runCompletion chain (Groq → Gemini → NVIDIA →
// Workers AI). Must be (a) long enough that the fallback chain can actually
// run — a single Groq call alone allows 15s, so the old 12s value fired the
// timeout BEFORE any fallback could respond, turning a slow/rate-limited Groq
// into a hard 503 — and (b) short enough to return before the frontend's 20s
// abort. 18s threads that needle.
const CALL_TIMEOUT_MS = 18000;

function buildUserPrompt(input: SummaryInput): string {
  const items = input.items.slice(0, input.maxItems ?? 30);
  // Feed item title/body/source are attacker-authorable (feed authors). Fence
  // them as untrusted data so an embedded "ignore previous instructions" in a
  // feed title cannot steer the summary. Surface/date are app metadata.
  const itemLines: string[] = [];
  for (const item of items) {
    const src = item.source ? ` [${neutralizeUntrusted(item.source)}]` : '';
    const body = neutralizeUntrusted(item.body.replace(/\s+/g, ' ').trim().slice(0, 300));
    itemLines.push(`- ${neutralizeUntrusted(item.title)}${src}: ${body}`);
  }
  const lines: string[] = [
    `Surface: ${input.surface}`,
    `Date: ${input.date}`,
    `Items (${items.length} of ${input.items.length}):`,
    '',
    fenceUntrusted(itemLines.join('\n'), 'FEED_ITEMS'),
  ];
  const joined = lines.join('\n');
  return joined.length > MAX_BODY_CHARS ? joined.slice(0, MAX_BODY_CHARS) + '\n…[truncated]' : joined;
}

/**
 * Generate an AI summary for a feed surface. Returns null on any failure
 * (rate limit, timeout, parse error) so callers can skip gracefully.
 */
export async function generateAiSummary(input: SummaryInput, env: Env): Promise<SummaryResult | null> {
  if (input.items.length === 0) return null;

  const userPrompt = buildUserPrompt(input);

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ai-summary timeout')), CALL_TIMEOUT_MS)
    );
    const result = await Promise.race([
      runCompletion(
        env.AI,
        {
          system: SYSTEM_PROMPT,
          user: userPrompt,
          // gpt-oss-120b is a reasoning model: max_completion_tokens must cover
          // the internal reasoning trace AND the visible output. The prompt now
          // asks for three outputs (full summary + tweet + LinkedIn post), so
          // 800 starved the model into empty/truncated content (→ null → 503)
          // and 1500 covered two outputs. 2000 gives headroom for three.
          maxTokens: 2000,
          temperature: 0.3,
        },
        {
          infronKey: env.INFRON_API_KEY,
          googleKey: env.GOOGLE_AI_STUDIO_API_KEY,
          groqKey: env.GROQ_API_KEY,
          nvidiaKey: env.NVIDIA_API_KEY as string | undefined,
          preferGroq: true,
        }
      ),
      timeoutPromise,
    ]);

    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text || text.length < 50) {
      // Empty/near-empty completion — the classic reasoning-model symptom when
      // max_completion_tokens is exhausted on the internal trace. Log it so the
      // cause isn't lost behind the generic 503.
      console.error(`generateAiSummary[${input.surface}] short output (${text.length} chars) from ${result.modelUsed}`);
      return null;
    }

    const tweetSplit = text.split('---TWEET---');
    const summary = tweetSplit[0]!.trim();
    const linkedinSplit = (tweetSplit[1] ?? '').split('---LINKEDIN---');
    const tweet = (linkedinSplit[0] ?? '').trim().slice(0, 280) || summary.split('\n')[0]!.slice(0, 280);
    // LinkedIn fallback: if the model skipped the block (e.g. low-signal items),
    // reuse the summary stripped of markdown rather than leaving the field empty.
    const linkedin =
      (linkedinSplit[1] ?? '').trim().slice(0, 3000) || summary.replace(/\*\*/g, '').trim().slice(0, 900);

    // Validate grounding against source items
    const sourceText = input.items.map((i) => `${i.title} ${i.body}`).join(' ');
    const ungrounded = [
      ...new Set([...findUngroundedCves(summary, sourceText), ...findUngroundedCves(linkedin, sourceText)]),
    ];
    const slop = detectSlop(summary);
    const sourceCves = new Set(extractCves(sourceText));
    const textCves = extractCves(summary);
    const groundedCves = textCves.filter((c) => sourceCves.has(c));

    // Quality score: start at 100, deduct for issues
    let quality = 100;
    if (ungrounded.length > 0) quality -= ungrounded.length * 15;
    if (slop.length > 1) quality -= slop.length * 10;
    if (textCves.length > 0 && groundedCves.length === 0) quality -= 20;
    quality = Math.max(0, Math.min(100, quality));

    return {
      summary,
      tweet,
      linkedin,
      modelUsed: result.modelUsed,
      itemCount: Math.min(input.items.length, input.maxItems ?? 30),
      _validation: {
        quality_score: quality,
        ungrounded_cves: ungrounded.length > 0 ? ungrounded : undefined,
        slop_count: slop.length > 0 ? slop.length : undefined,
      },
    };
  } catch (err) {
    // Never swallow silently — the route turns null into a generic 503, so the
    // worker log is the ONLY place the real cause (provider exhaustion, auth,
    // timeout, parse failure) surfaces. Keep returning null so the caller still
    // degrades gracefully, but make the failure diagnosable.
    console.error(`generateAiSummary[${input.surface}] failed:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}
