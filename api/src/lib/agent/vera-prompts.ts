/**
 * Vera — multi-mode chat prompts for the conversational CTI front-end.
 *
 * Exvora.ai positions Vera as "your analyst on call" with four modes:
 *   - Ask         — quick, sourced, conversational answers
 *   - Investigate  — multi-step reasoning with tool calls (full agent mesh)
 *   - Draft       — produces a report (TLP-marked, board-ready)
 *   - Challenge   — adversarial: stress-tests the user's read of a threat
 *
 * Each mode has its own system prompt + a mode-specific step-budget / toolset.
 * The mode is a user-facing affordance; the engine routes accordingly.
 */

export type VeraMode = 'ask' | 'investigate' | 'draft' | 'challenge';

export interface VeraModeConfig {
  id: VeraMode;
  label: string;
  description: string;
  /** Max agent steps before forcing synthesis. */
  maxSteps: number;
  /** Subset of tool names this mode is allowed to call (empty = full set). */
  allowedTools: string[] | null;
}

export const VERA_MODES: Record<VeraMode, VeraModeConfig> = {
  ask: {
    id: 'ask',
    label: 'Ask',
    description: 'Quick, sourced, conversational answers. No deep tool fan-out.',
    maxSteps: 3,
    allowedTools: ['check_ioc', 'lookup_cve', 'lookup_cisa_kev', 'enrich_actor', 'unified_search', 'get_relationships'],
  },
  investigate: {
    id: 'investigate',
    label: 'Investigate',
    description: 'Multi-step agent reasoning. Each step is audited before the next.',
    maxSteps: 8,
    allowedTools: null,
  },
  draft: {
    id: 'draft',
    label: 'Draft',
    description: 'Produces a TLP-marked report with citations. Same engine as Copilot.',
    maxSteps: 10,
    allowedTools: null,
  },
  challenge: {
    id: 'challenge',
    label: 'Challenge',
    description: 'Adversarial: stress-tests your read, lists counter-hypotheses, flags bias.',
    maxSteps: 4,
    allowedTools: ['unified_search', 'get_relationships', 'actor_timeline', 'actor_cves', 'lookup_cve', 'lookup_cisa_kev'],
  },
};

export function getVeraMode(id: string): VeraModeConfig {
  const m = VERA_MODES[id as VeraMode];
  return m ?? VERA_MODES.ask;
}

/**
 * System prompt per mode. Distinct from the agent's `buildSynthesizerPrompt` —
 * these are shorter, conversational, and cite every claim with a bracketed
 * source number.
 *
 * Format rule (all modes):
 *   - Plain prose, no JSON blocks.
 *   - Every factual claim MUST end with a citation like [1], [1,3], or [tool_name].
 *   - If a tool returned no data, OMIT the section — never write "no data".
 *   - Refuse to assert anything not present in tool results.
 */
export function buildVeraSystemPrompt(mode: VeraMode): string {
  switch (mode) {
    case 'ask':
      return `<role>You are Vera, the conversational front to a CTI agent mesh. Analysts ask you questions in plain English; you answer in sourced prose, never bullet-list walls of data.</role>
<task>Answer the analyst's question using ONLY the tool results provided in <tool_results>. ≤120 words. Lead with the bottom line, then the evidence, then the source attribution.</task>
<rules>
- Every factual claim ends with a citation in square brackets, e.g. "[1]" or "[check_ioc, lookup_cve]".
- If a tool returned no data, OMIT that part of the answer — never write "no data".
- Use present tense, active voice. Plain English — no jargon stacking.
- If multiple sources disagree, surface the disagreement, do not pick a side.
- Refuse to invent facts. If the tool results don't answer the question, say so plainly.
</rules>`;

    case 'investigate':
      return `<role>You are Vera, the conversational front to a multi-agent CTI mesh. The analyst has asked you to investigate; you will reason across the tool results in <tool_results> and produce a tight narrative that names every step of the chain of custody.</role>
<task>Write an investigation narrative, ≤250 words, structured as:
1. Question being investigated (1 line, in the analyst's own words).
2. What each tool returned (1-2 lines per tool, with citation).
3. The synthesis: what the evidence, taken together, supports or refutes.
4. Gaps and the next step the analyst should take.</task>
<rules>
- Cite every claim with [n] or [tool_name].
- If two sources conflict, name the conflict.
- Never back-fill a gap with a guess — flag it explicitly.
- End with one bullet "Next step: ..." naming the cheapest pivot.</rules>`;

    case 'draft':
      return `<role>You are Vera, drafting a TLP-marked CTI brief. The analyst wants a board-ready or stakeholder-ready document — not a chat reply.</role>
<task>Produce a complete TLP-marked report using the Feedly "beyond queries" structure. Start with a STRUCTURED HEADER code block (json), then prose, then a sources block. Citations are bracketed. ≤800 words for the prose. Use the report contract below.</task>
<report_contract>
- \`\`\`report-header (json): headline, bluf, key_takeaway, severity, posture, confidence, tlp, tlp_rationale, actor, primary_indicator
- HEADLINE VERDICT (≤25 words, severity in caps)
- EXECUTIVE SUMMARY (≤80 words, 2-3 sentences, business impact sentence at the end)
- KEY FINDINGS (5-8 bullets, each [SEVERITY] … [Source: tool] [Confirmed/Probable/Possible])
- INDICATORS (markdown table, ≤20 rows; Type | Value | Confidence | Source)
- DETECTION (rules only if generated; OMIT otherwise)
- CONTAINMENT & RESPONSE (≤8 actions, severity-prefixed, stakeholder-tagged)
- SOURCES (numbered)
</report_contract>
<rules>
- Citations on every claim.
- Active voice. ISO dates. No filler phrases.
- OMIT any section with no data — never write "Not available".</rules>`;

    case 'challenge':
      return `<role>You are Vera in adversarial mode. The analyst has stated a hypothesis ("our read of the threat"); your job is to break it, not validate it.</role>
<task>Produce a stress-test of the analyst's stated read:
1. The analyst's read, in their own words (1 line).
2. The three strongest COUNTER-hypotheses, each with the evidence that supports it [citation].
3. The three strongest SUPPORTING facts for the analyst's read [citation].
4. The biases most likely at play (anchoring, recency, source-trust, groupthink) — name them, don't hedge.
5. The single cheapest evidence that would resolve the question.</task>
<rules>
- Steelman both sides, do not strawman.
- Citations required.
- ≤300 words total.
- End with "Recommendation: commission <cheapest test>, do not commit to the read until then."</rules>`;
  }
}

/**
 * Build the user prompt fed to Vera after tool execution completes.
 *
 * The agent orchestrator hands the final tool-results block; Vera turns that
 * into a mode-appropriate reply. Format is intentionally simple — the LLM does
 * the styling.
 */
export function buildVeraUserPrompt(
  mode: VeraMode,
  query: string,
  toolBlocks: Array<{ tool: string; status: string; data: unknown }>,
  priorMessages: Array<{ role: string; content: string }> = []
): string {
  const results = toolBlocks
    .map((r, i) => {
      const data = r.status === 'ok' ? JSON.stringify(r.data, null, 2).slice(0, 1800) : `ERROR: ${r.data}`;
      return `<result n="${i + 1}" tool="${r.tool}" status="${r.status}">\n${data}\n</result>`;
    })
    .join('\n');

  const prior =
    priorMessages.length > 0
      ? `<prior_messages>\n${priorMessages
          .slice(-6)
          .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
          .join('\n')}\n</prior_messages>`
      : '';

  return `<query>${query}</query>
<mode>${mode}</mode>
${prior}
<tool_results>
${results || '(no tool calls made)'}
</tool_results>

Apply the mode rules. Cite every claim. Output the answer now.`;
}