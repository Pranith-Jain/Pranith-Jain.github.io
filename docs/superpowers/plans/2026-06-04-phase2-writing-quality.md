# Phase 2 — Writing & Content Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the case-study blog/social generator off the deprecated Groq model to `openai/gpt-oss-120b` (blog) + `llama-3.3-70b-versatile` (social) with a per-call `reasoning_effort` override, rewrite the blog prompt to 2026 AEO/GEO norms (TL;DR + query-shaped H2s + FAQ + named detections + IOC table + estimative-language discipline + stat density), enforce those elements in structural QA, and emit `BlogPosting`+`FAQPage` JSON-LD plus a visible "Updated" date and AI-crawler allow rules on the render layer.

**Architecture:** Generation lives in `api/src/case-study/generation/` (`ai-client.ts` → Groq-then-Workers-AI client; `templates.ts` → blog system/user prompt; `copywriting.ts` → shared voice; `post-process.ts` → deterministic structural QA; `index.ts` → `generatePost` orchestrator with one self-heal pass). Blog markdown is rendered to HTML server-side by `api/src/routes/blog-public.ts` → `api/src/case-study/rendering/markdown.ts` (`marked`, GFM tables on by default), and displayed by the React page `src/pages/BlogPost.tsx` (which inlines the JSON-LD `<script>` and the byline/date). Crawler access is the static `public/robots.txt`.

**Tech Stack:** TypeScript on Cloudflare Workers (Hono + `marked`); Groq OpenAI-compatible chat API + Workers AI (`ai.run`); React 18 + react-router for the public blog page; Vitest (`@cloudflare/vitest-pool-workers` for `api/`, jsdom + `@testing-library/react` for `src/`).

---

## Conventions for every Task

- **API tests** live under `api/test/` and run with the Cloudflare Workers pool. Run a single file from the `api/` directory with the sandbox disabled (the pool requires it in this environment — per project memory):
  ```
  cd api && npx vitest run test/case-study/generation/<file>.test.ts
  ```
  These generation tests are **not** under `api/test/routes/`, so CI runs them too — but run them locally with the flag above while iterating.
- **Frontend tests** live under `src/` and run from the repo root with the jsdom runner:
  ```
  npx vitest run src/test/BlogPost.test.tsx
  ```
- **Typecheck-on-edit hook** blocks on TS errors — every saved file must compile. After editing anything under `worker/` run `tsc -p api/tsconfig.worker.json` (no `worker/` files are touched in this phase, so this is only a safety net).
- **Deploy is from repo ROOT** (two wranglers); do NOT deploy from `api/`. This plan does not deploy — it commits on the current feature branch and lets auto-merge handle `main`. Re-check the current branch before each `git commit` (HEAD can switch to `main` mid-session); never rebase/force-push/`branch -f main`.
- Commit after each Task passes. Co-author trailer (exact):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Task 1 — Model swap + per-call `reasoning_effort` / model override in `ai-client.ts`

Swap the deprecated Groq model. Make the Groq model and `reasoning_effort` per-call so blog (`openai/gpt-oss-120b`, reasoning) and social (`llama-3.3-70b-versatile`, no reasoning) can differ. Keep the Workers-AI fallback chain and fail-fast-on-429 exactly as they are. gpt-oss is a reasoning model, so the blog path must also send a system line forbidding chain-of-thought/preamble (that line is added in Task 2's prompt, but the param plumbing lands here).

**Files:**

- Modify: `api/src/case-study/generation/ai-client.ts` (constants at `:20-26`, `CompletionInput`/`CompletionOpts` at `:28-43`, `runGroq` at `:74-100`, `runCompletion` at `:121-165`)
- Test: `api/test/case-study/generation/ai-client.test.ts`

Steps:

- [ ] Write failing tests. Append these cases inside `api/test/case-study/generation/ai-client.test.ts` (the existing `describe('runCompletion — Groq primary')` block), and update the existing Workers-AI success assertion only if needed (it already asserts `llama-3.3-70b`, which still holds). Add at the end of the file:

  ```ts
  describe('runCompletion — Groq model + reasoning_effort plumbing', () => {
    it('defaults Groq to gpt-oss-120b and sends reasoning_effort when groqModel omitted', async () => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);
      const ai = { run: vi.fn() };
      const out = await runCompletion(ai as any, { system: 's', user: 'u' }, { groqKey: 'k', reasoningEffort: 'low' });
      expect(out.modelUsed).toBe('groq:openai/gpt-oss-120b');
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.model).toBe('openai/gpt-oss-120b');
      expect(body.reasoning_effort).toBe('low');
    });

    it('uses an explicit groqModel and OMITS reasoning_effort for the social model', async () => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);
      const ai = { run: vi.fn() };
      const out = await runCompletion(
        ai as any,
        { system: 's', user: 'u' },
        { groqKey: 'k', groqModel: 'llama-3.3-70b-versatile' }
      );
      expect(out.modelUsed).toBe('groq:llama-3.3-70b-versatile');
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.model).toBe('llama-3.3-70b-versatile');
      expect('reasoning_effort' in body).toBe(false);
    });
  });
  ```

- [ ] Run, expect FAIL:
  ```
  cd api && npx vitest run test/case-study/generation/ai-client.test.ts
  ```
  Expected: the two new cases fail with `expected 'groq:meta-llama/llama-4-scout-17b-16e-instruct' to be 'groq:openai/gpt-oss-120b'` and `reasoning_effort` undefined / model mismatch. The four pre-existing cases still pass.
- [ ] Implement. In `api/src/case-study/generation/ai-client.ts`:

  Replace the model constant block at the top (currently `:21`):

  ```ts
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
  const GROQ_TIMEOUT_MS = 30_000;
  ```

  with:

  ```ts
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  // Blog default: gpt-oss-120b is a reasoning model — the caller MUST also send
  // a "no chain-of-thought, output only the article" system line (templates.ts)
  // or it leaks <thinking>. Social callers pass groqModel:'llama-3.3-70b-versatile'
  // (stable, no reasoning leakage). The previous llama-4-scout-17b model is
  // DEPRECATED on Groq.
  const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
  const GROQ_TIMEOUT_MS = 30_000;
  ```

  Extend `CompletionOpts` (currently `:40-43`) — replace it with:

  ```ts
  export interface CompletionOpts {
    /** Groq API key; when present Groq is tried first. */
    groqKey?: string;
    /** Override the Groq model. Defaults to GROQ_DEFAULT_MODEL (gpt-oss-120b). */
    groqModel?: string;
    /**
     * gpt-oss reasoning budget. Only sent to Groq when set AND the resolved
     * model is a gpt-oss model (other Groq models 400 on this param). Blog uses
     * 'low'/'medium'; social omits it.
     */
    reasoningEffort?: 'low' | 'medium' | 'high';
  }
  ```

  Replace the `runGroq` signature + request body. Change the function header (currently `:74`) to accept the resolved model + effort, and add `reasoning_effort` to the JSON body only for gpt-oss models:

  ```ts
  async function runGroq(
    key: string,
    model: string,
    input: CompletionInput,
    reasoningEffort?: 'low' | 'medium' | 'high'
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxTokens ?? 4000,
      temperature: input.temperature ?? 0.5,
    };
    // reasoning_effort is a gpt-oss-only param; other Groq models 400 on it.
    if (reasoningEffort && /gpt-oss/.test(model)) body.reasoning_effort = reasoningEffort;
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`groq request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 429) throw new RateLimitError('groq rate limited (429)');
    if (!res.ok) throw new Error(`groq HTTP ${res.status}`);
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
    return text;
  }
  ```

  In `runCompletion` (the Groq branch, currently `:126-139`), resolve the model and pass both new args, and report the resolved model in `modelUsed`:

  ```ts
  // 1. Groq primary (own quota + quality) when configured.
  if (opts.groqKey) {
    const model = opts.groqModel ?? GROQ_DEFAULT_MODEL;
    try {
      const text = await runGroq(opts.groqKey, model, input, opts.reasoningEffort);
      return { text, modelUsed: `groq:${model}` };
    } catch (err) {
      if (isRateLimited(err)) {
        console.warn('runCompletion: groq rate-limited, falling back to Workers AI', err);
      } else {
        console.warn('runCompletion: groq failed, falling back to Workers AI', err);
      }
      // fall through to Workers AI
    }
  }
  ```

  Leave the Workers-AI fallback loop (`:141-164`) and `isRateLimited` (`:53-72`) untouched.

- [ ] Run, expect PASS (all 6 cases):
  ```
  cd api && npx vitest run test/case-study/generation/ai-client.test.ts
  ```
- [ ] Commit:
  ```
  git commit -am "feat(case-study): swap blog model to gpt-oss-120b + per-call reasoning_effort/model override"
  ```

---

## Task 2 — Wire blog/social model choice + no-CoT system line into `generatePost` and `templates.ts`

`generatePost` currently calls `runCompletion(ai, {...}, { groqKey })` with no model/effort, so after Task 1 the blog path uses gpt-oss-120b but never sends `reasoning_effort` and never tells the reasoning model to suppress chain-of-thought. This Task threads the blog model choice through and adds the strict "output only the article, no thinking, no preamble" guardrail to the blog system prompt (so the reasoning model doesn't leak `<thinking>` into the published body). Social prompts are out of scope for Phase 2 (Phase 3), so only the blog/case-study path is wired here.

**Files:**

- Modify: `api/src/case-study/generation/copywriting.ts` (`PIPELINE_OUTPUT_GUARDRAIL` at `:150-156`)
- Modify: `api/src/case-study/generation/index.ts` (both `runCompletion` calls at `:150` and `:166-177`)
- Test: `api/test/case-study/generation/index.test.ts`, `api/test/case-study/generation/templates.test.ts`

Steps:

- [ ] Write failing tests.

  (a) In `api/test/case-study/generation/index.test.ts`, add a case that asserts both the model and the reasoning effort reach the Groq client. The orchestrator passes through `runCompletion`; we assert via a stubbed Groq fetch (Groq is preferred when `groqKey` is set):

  ```ts
  it('drives the blog generation on gpt-oss-120b with reasoning_effort', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: goodMd } }] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const ai = { run: vi.fn() };
    await generatePost({ candidate, ai: ai as any, now: new Date(), groqKey: 'k' });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    vi.unstubAllGlobals();
  });
  ```

  Add `import { vi } from 'vitest';` is already present; ensure `vi.unstubAllGlobals()` runs (call it inline as above — there is no global afterEach in this file).

  (b) In `api/test/case-study/generation/templates.test.ts`, add to the first `describe('buildPrompt')` an assertion that the no-chain-of-thought guardrail is present in the system prompt:

  ```ts
  it('blog system prompt forbids chain-of-thought / preamble (gpt-oss reasoning leak guard)', () => {
    const { system } = buildPrompt({ type: 'cve', title: 'CVE-2026-1', facts: {} });
    expect(system).toMatch(/no chain-of-thought/i);
    expect(system).toMatch(/output only the (final |published )?article/i);
  });
  ```

- [ ] Run, expect FAIL:
  ```
  cd api && npx vitest run test/case-study/generation/index.test.ts test/case-study/generation/templates.test.ts
  ```
  Expected: index case fails (`body.model` is `openai/gpt-oss-120b` only if Task 1 shipped, but `body.reasoning_effort` is `undefined` because index.ts doesn't pass it); templates case fails (`no chain-of-thought` not found).
- [ ] Implement.

  In `api/src/case-study/generation/copywriting.ts`, extend `PIPELINE_OUTPUT_GUARDRAIL` (currently ends at `:156`). Replace the last bullet block so it adds the reasoning-leak guard:

  ```ts
  export const PIPELINE_OUTPUT_GUARDRAIL =
    `#PIPELINE OUTPUT (STRICT)\n\n` +
    `- Do the angle analysis and hook selection silently. Pick the best, write only that.\n` +
    `- Output ONLY the final, publish-ready piece. No "5 options", no reasoning, ` +
    `no "Hook Development", no "Performance Notes", no labels, no commentary.\n` +
    `- NO chain-of-thought, NO <thinking> blocks, NO preamble, NO "Here is the article". ` +
    `Output only the final article, starting with the hook paragraph.\n` +
    `- Never invent CVE IDs, CVSS scores, versions, dates, or indicators. Use only what the supplied facts contain.\n` +
    `- Never include raw JSON, FACTS blocks, structured data, or bare URLs in prose.`;
  ```

  In `api/src/case-study/generation/index.ts`, update BOTH `runCompletion` calls to pass the blog model + effort. The first call (currently `:150`):

  ```ts
  const completion = await runCompletion(
    ai,
    { system, user },
    { groqKey, groqModel: 'openai/gpt-oss-120b', reasoningEffort: 'low' }
  );
  ```

  The repair call (currently the `{ groqKey }` at `:176`) — change its opts to:

  ```ts
      { groqKey, groqModel: 'openai/gpt-oss-120b', reasoningEffort: 'low' }
  ```

  (Use the same explicit model even though it equals the default, so the intent is local and a future default change to `GROQ_DEFAULT_MODEL` doesn't silently move the blog path.)

- [ ] Run, expect PASS:
  ```
  cd api && npx vitest run test/case-study/generation/index.test.ts test/case-study/generation/templates.test.ts
  ```
- [ ] Commit:
  ```
  git commit -am "feat(case-study): drive blog gen on gpt-oss-120b/low + no-CoT guardrail"
  ```

---

## Task 3 — 2026 AEO/GEO blog prompt upgrade in `templates.ts`

Add the AEO/GEO requirements to the blog system prompt: answer-first TL;DR block (≤120 words: finding + impact + affected versions + one headline stat), query-shaped H2 headings (strict H1→H2→H3), a FAQ section (4-6 question-shaped items, 40-60-word answers), named detections (Sigma/YARA/KQL/SPL where the data supports) + an IOC table, estimative-language discipline (separate WEP likelihood from confidence; no weasel words), a specific number every ~200-300 words, and an entity-rich title directive. Preserve the existing voice/anti-slop/grounding fences — these are ADDITIONS to `SYSTEM_PROMPT`, and the per-section `OUTLINES` gain a `## TL;DR`, `## FAQ`, and (where appropriate) `## Indicators of compromise` anchor so the prompt and post-process agree.

**Files:**

- Modify: `api/src/case-study/generation/templates.ts` (`SYSTEM_PROMPT` at `:5-41`, `OUTLINES` at `:43-158`, the `user` builder's closing instruction at `:345-358`)
- Test: `api/test/case-study/generation/templates.test.ts`

Steps:

- [ ] Write failing tests. Add to `api/test/case-study/generation/templates.test.ts`:

  ```ts
  describe('buildPrompt — 2026 AEO/GEO blog requirements', () => {
    it('blog system prompt requires TL;DR, FAQ, query-shaped H2s, IOC table, estimative language, stat density', () => {
      const { system } = buildPrompt({ type: 'cve', title: 'CVE-2026-1', facts: {} });
      expect(system).toMatch(/TL;DR/);
      expect(system).toMatch(/120 words/);
      expect(system).toMatch(/FAQ/);
      expect(system).toMatch(/40-?60[- ]word/i);
      expect(system).toMatch(/query-shaped|phrase .*as (a |the )?question/i);
      expect(system).toMatch(/IOC table|table of indicators/i);
      expect(system).toMatch(/Sigma|YARA|KQL|SPL/);
      // Estimative tradecraft: likelihood (WEP) separated from confidence.
      expect(system).toMatch(/likelihood/i);
      expect(system).toMatch(/confidence/i);
      // Stat density.
      expect(system).toMatch(/200-?300 words/);
      // Entity-rich title guidance.
      expect(system).toMatch(/From X to Y|entity-rich title/i);
    });

    it('CVE outline now anchors a TL;DR and FAQ section', () => {
      const { user } = buildPrompt({ type: 'cve', title: 'CVE-2026-1', facts: { cveId: 'CVE-2026-1' } });
      expect(user).toContain('## TL;DR');
      expect(user).toContain('## FAQ');
    });
  });
  ```

- [ ] Run, expect FAIL:
  ```
  cd api && npx vitest run test/case-study/generation/templates.test.ts
  ```
  Expected: the two new cases fail (none of the AEO strings exist yet; `## TL;DR`/`## FAQ` not in outline). The five pre-existing `buildPrompt` cases still pass.
- [ ] Implement.

  In `api/src/case-study/generation/templates.ts`, insert a new AEO block into `SYSTEM_PROMPT`. Add this constant just above `const SYSTEM_PROMPT =` (line `:5`):

  ```ts
  // 2026 AEO/GEO requirements (Princeton GEO study: stats → +41% AI-citation
  // visibility, citations/quotes → +30-40%) + FIRST/ICD-203 estimative tradecraft.
  const AEO_GEO_RULES =
    `<aeo-geo>\n` +
    `- ANSWER-FIRST TL;DR: the FIRST section is "## TL;DR" — a self-contained, quotable block of <=120 words that states the finding, the impact, the affected versions/products, and ONE headline statistic. Write it so an AI assistant could quote it verbatim as the answer.\n` +
    `- QUERY-SHAPED HEADINGS: every "## " H2 is phrased as the exact question a reader or AI would ask ("How does CVE-XXXX get exploited?", "Which versions are affected?"). Strict hierarchy: one H1 (the title), then H2 sections, H3 only for sub-points. Never skip a level.\n` +
    `- FAQ: include a "## FAQ" section near the end with 4-6 question-shaped items. Each answer is 40-60 words, self-contained, and quotable. Format each as a bold question line then the answer paragraph.\n` +
    `- NAMED DETECTIONS: where the GROUND TRUTH DATA supports it, give a concrete, named detection — a Sigma rule, a YARA rule, a KQL or SPL query — in a fenced code block. Never invent rule logic the data can't support; omit rather than fabricate.\n` +
    `- IOC TABLE: when the data contains indicators, render them as a markdown table with columns | Indicator | Type | Context |. One row per indicator. Use the REAL values from the data, never placeholders.\n` +
    `- ESTIMATIVE-LANGUAGE DISCIPLINE: separate LIKELIHOOD from CONFIDENCE. Likelihood uses Words of Estimative Probability (WEP): "very likely", "likely", "roughly even chance", "unlikely". Confidence is stated separately as High / Moderate / Low based on source quality. NEVER combine them in one sentence ("we are highly confident it is very likely"). No weasel words ("some say", "it is believed", "many experts").\n` +
    `- STAT DENSITY: land a specific, ground-truth number at least every 200-300 words (CVSS, version, count, date, percentage). A paragraph with no number is usually padding.\n` +
    `- ENTITY-RICH TITLE: if you propose or restate a title, make it entity-rich and load-bearing — a "From X to Y" framing or a witty line that still names the CVE/product/actor. The title's entities do the SEO/AEO work.\n` +
    `</aeo-geo>\n\n`;
  ```

  Then insert `AEO_GEO_RULES` into the `SYSTEM_PROMPT` concatenation, immediately after the `<structure>` block and before `<grounding>` (between the lines ending `...Don't force a fixed skeleton.\n` `</structure>\n\n` at `:16-17` and `` `<grounding>\n` ``). Change:

  ```ts
    `</structure>\n\n` +
    `<grounding>\n` +
  ```

  to:

  ```ts
    `</structure>\n\n` +
    AEO_GEO_RULES +
    `<grounding>\n` +
  ```

  Add the new outline anchors. In `OUTLINES`, prepend `'## TL;DR'` and append `'## FAQ'` (before `'## References'`) to every typed list EXCEPT `analysis` (which is intentionally outline-free at `:153-157`). For each of the 12 non-`analysis` types, the list becomes `['## TL;DR', …existing…, '## FAQ', '## References']`. Concretely, the `cve` entry (`:44-53`) becomes:

  ```ts
    cve: [
      '## TL;DR',
      '## What is this vulnerability?',
      '## Affected products',
      '## CVSS score breakdown',
      '## How the attack works',
      '## Why this matters',
      '## Indicators of compromise',
      '## Detection & mitigation',
      '## FAQ',
      '## References',
    ],
  ```

  Apply the same `## TL;DR` (first) and `## FAQ` (immediately before `## References`) insertion to `actor`, `malware`, `ransom`, `breach`, `scam`, `aisec`, `intel`, `osint`, `methodology`, `trend`, and `briefing`. Leave `analysis: []` unchanged.

  Update the user-builder closing instruction (`:350-357`) so the model is told to open with the TL;DR and place the FAQ. Replace:

  ```ts
      `Write the case study in Markdown. Open with a strong hook paragraph ` +
      `before the first section heading. Address the reader directly. ` +
  ```

  with:

  ```ts
      `Write the case study in Markdown. Open with a strong hook paragraph ` +
      `before the first section heading, then the "## TL;DR" answer block, then the analysis sections. ` +
      `Include a "## FAQ" (4-6 Q&A, 40-60-word answers) before "## References". ` +
      `Render any indicators as an IOC table. Address the reader directly. ` +
  ```

- [ ] Run, expect PASS (new + pre-existing template cases):
  ```
  cd api && npx vitest run test/case-study/generation/templates.test.ts
  ```
  Note: the pre-existing `'CVE prompt contains all required outline sections'` case asserts the old section strings (`## What is this vulnerability` etc.) — those are still present, so it stays green. The clamp/briefing cases are unaffected.
- [ ] Commit:
  ```
  git commit -am "feat(case-study): 2026 AEO/GEO blog prompt — TL;DR, FAQ, query H2s, detections, estimative language"
  ```

---

## Task 4 — Enforce the new AEO elements in structural QA (`post-process.ts`)

Extend `qaReview` to assert: a `## TL;DR` block is present, at least one FAQ item exists (a `## FAQ` heading with at least one bolded question), and — when the post extracted ≥1 IOC — a markdown IOC table is present. Headings-present and no-banned-slop checks already exist (`sectionCount < 2` in `qaReview`; `EGREGIOUS_SLOP` in `postProcess`). These new failures feed the existing one-shot self-heal in `generatePost` (no new repair plumbing needed). The checks must NOT fire on `analysis` type (outline-free thought-leadership) or `briefing` (digest format) where a rigid TL;DR/FAQ would fight the format — gate them to the structured types.

**Files:**

- Modify: `api/src/case-study/generation/post-process.ts` (`qaReview` at `:620-652`, and its call site at `:597` which already passes `input.type` + `iocs`)
- Test: `api/test/case-study/generation/post-process.test.ts`

Steps:

- [ ] Write failing tests. Add to `api/test/case-study/generation/post-process.test.ts`:

  ```ts
  describe('qaReview — 2026 AEO/GEO structural gates', () => {
    const longSections = Array.from(
      { length: 40 },
      (_, i) => `Specific finding number ${i} with a real detail and a number ${i}.`
    ).join(' ');

    it('fails a structured post missing the TL;DR block', () => {
      const body =
        `Hook line about the finding.\n\n## What is this vulnerability?\n\n${longSections}\n\n` +
        `## FAQ\n\n**What is affected?**\nThe affected build is named in the data.\n\n` +
        `## References\n\n- [NVD](https://nvd.nist.gov/x)`;
      const qa = qaReview(body, [], 'cve', QS(70));
      expect(qa.passed).toBe(false);
      expect(qa.issues.join('|')).toMatch(/tl;dr/i);
    });

    it('fails a structured post with no FAQ item', () => {
      const body =
        `Hook.\n\n## TL;DR\n\nThe finding, impact, affected versions, and one stat.\n\n` +
        `## What is this vulnerability?\n\n${longSections}\n\n## References\n\n- [NVD](https://nvd.nist.gov/x)`;
      const qa = qaReview(body, [], 'cve', QS(70));
      expect(qa.passed).toBe(false);
      expect(qa.issues.join('|')).toMatch(/faq/i);
    });

    it('fails when IOCs were extracted but no IOC table is present', () => {
      const body =
        `Hook.\n\n## TL;DR\n\nThe finding and a stat 9.8.\n\n## What is this vulnerability?\n\n${longSections}\n\n` +
        `## FAQ\n\n**Q?**\nAnswer text here for the reader.\n\n## References\n\n- [NVD](https://nvd.nist.gov/x)`;
      const qa = qaReview(body, [{ type: 'ipv4', value: '91.215.155.42' }], 'cve', QS(70));
      expect(qa.passed).toBe(false);
      expect(qa.issues.join('|')).toMatch(/ioc table/i);
    });

    it('passes a complete structured post (TL;DR + FAQ + IOC table)', () => {
      const body =
        `Hook.\n\n## TL;DR\n\nThe finding, impact, affected versions, and one stat 9.8.\n\n` +
        `## What is this vulnerability?\n\n${longSections}\n\n` +
        `## Indicators of compromise\n\n| Indicator | Type | Context |\n|---|---|---|\n| 91.215.155.42 | ipv4 | C2 |\n\n` +
        `## FAQ\n\n**Which versions are affected?**\nBuilds before 7.4.5 are affected per the advisory data.\n\n` +
        `## References\n\n- [NVD](https://nvd.nist.gov/x)`;
      const qa = qaReview(body, [{ type: 'ipv4', value: '91.215.155.42' }], 'cve', QS(70));
      expect(qa.passed).toBe(true);
      expect(qa.issues).toHaveLength(0);
    });

    it('does NOT apply TL;DR/FAQ/IOC-table gates to analysis or briefing types', () => {
      const body = `${longSections}\n\n## Some heading\n\nmore text here for depth.\n\n## Another\n\n[r](https://x.test/a)`;
      expect(qaReview(body, [{ type: 'ipv4', value: '91.215.155.42' }], 'analysis', QS(70)).passed).toBe(true);
      expect(qaReview(body, [{ type: 'ipv4', value: '91.215.155.42' }], 'briefing', QS(70)).passed).toBe(true);
    });
  });
  ```

  (`QS` is the existing helper at the top of this test file.) Also confirm the EXISTING `qaReview` cases at `:126-144` still pass: the `qaReview passes substantive…` case at `:126` uses type `'cve'` with NO TL;DR/FAQ and would now FAIL — so this test must be updated. Change its body so it includes a `## TL;DR` and a `## FAQ` with one bold question, keeping it substantive:

  ```ts
  it('qaReview passes substantive, sourced, non-repetitive content', () => {
    const body =
      `${'A precise, specific sentence about the finding number ' + Math.random()}\n\n## TL;DR\n\nThe finding, impact, affected versions, and one stat 9.8.\n\n` +
      `${Array.from({ length: 60 }, (_, i) => `Detection insight ${i} about the access vector and blast radius.`).join(
        ' '
      )}\n\n## Summary\n\nReal analysis here.\n\n## FAQ\n\n**What is affected?**\nThe affected build is named in the data for the reader.\n\n## References\n\n- [NVD](https://nvd.nist.gov/x)`;
    const qa = qaReview(body, [], 'cve', QS(70));
    expect(qa.passed).toBe(true);
    expect(qa.issues).toHaveLength(0);
  });
  ```

  (No IOCs are passed, so the IOC-table gate does not fire.)

- [ ] Run, expect FAIL:
  ```
  cd api && npx vitest run test/case-study/generation/post-process.test.ts
  ```
  Expected: the new gate cases fail (`qa.passed` is `true` because no TL;DR/FAQ/IOC-table check exists yet) and the rewritten `qaReview passes substantive…` case passes (it already has the elements, but the impl gate isn't there — it still passes structurally).
- [ ] Implement. In `api/src/case-study/generation/post-process.ts`, replace `qaReview` (currently `:620-652`):

  ```ts
  export function qaReview(body: string, iocs: PostIOC[], type: CaseStudyType, quality: QualityScore): QaVerdict {
    const issues: string[] = [];

    const words = body.split(/\s+/).filter(Boolean).length;
    if (words < QA_MIN_WORDS) issues.push(`too thin (${words} words < ${QA_MIN_WORDS})`);

    const sectionCount = (body.match(/^##\s+.+/gm) ?? []).length;
    if (sectionCount < 2) issues.push(`only ${sectionCount} section heading(s)`);

    const hasRefs = /^##\s+references/im.test(body);
    const linkCount = (body.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length;
    if (!hasRefs && linkCount === 0 && iocs.length === 0) {
      issues.push('no References section, citations, or IOCs — uncorroborated');
    }

    // 2026 AEO/GEO structural gates. Only enforced on the structured blog
    // types — 'analysis' is intentionally outline-free thought-leadership and
    // 'briefing' uses the weekly digest format, so a rigid TL;DR/FAQ would
    // fight those formats. These failures feed the existing one-shot self-heal
    // in generatePost; they don't permanently block.
    const AEO_TYPES: ReadonlySet<CaseStudyType> = new Set([
      'cve',
      'actor',
      'malware',
      'ransom',
      'breach',
      'scam',
      'aisec',
      'intel',
      'osint',
      'methodology',
      'trend',
    ]);
    if (AEO_TYPES.has(type)) {
      if (!/^##\s+tl;?dr\b/im.test(body)) issues.push('missing TL;DR block');
      const hasFaqHeading = /^##\s+faq\b/im.test(body);
      // A real FAQ has at least one bolded question line under the heading.
      const faqIdx = body.search(/^##\s+faq\b/im);
      const faqBody = faqIdx >= 0 ? body.slice(faqIdx) : '';
      const hasFaqItem = /\*\*[^*]+\?\*\*/.test(faqBody);
      if (!hasFaqHeading || !hasFaqItem) issues.push('missing FAQ (need a ## FAQ with >=1 bolded question)');
      // When indicators were extracted, the post must surface an IOC table.
      if (iocs.length > 0) {
        const hasTable = /^\s*\|.*\|\s*$\n^\s*\|[\s:|-]+\|\s*$/m.test(body);
        if (!hasTable) issues.push('IOCs present but no IOC table');
      }
    }

    // Repetition: a normalised sentence (>24 chars) repeated 3+ times.
    const norm = body
      .replace(/^##.*$/gm, ' ')
      .replace(/[*_`>#-]/g, ' ')
      .toLowerCase();
    const counts = new Map<string, number>();
    for (const raw of norm.split(/[.!?\n]+/)) {
      const s = raw.replace(/\s+/g, ' ').trim();
      if (s.length < 25) continue;
      const n = (counts.get(s) ?? 0) + 1;
      counts.set(s, n);
      if (n === 3) issues.push(`repeated sentence ×3: "${s.slice(0, 60)}…"`);
    }

    if (quality.total < QA_MIN_SCORE) issues.push(`quality score ${quality.total} < ${QA_MIN_SCORE}`);

    return { passed: issues.length === 0, score: quality.total, issues };
  }
  ```

  Note the signature change: the parameter `_type` becomes `type` (it was unused before; now it gates the AEO checks). The call site at `:597` already passes `input.type`, so no caller change is needed.

- [ ] Run, expect PASS (new + all pre-existing post-process cases):
  ```
  cd api && npx vitest run test/case-study/generation/post-process.test.ts
  ```
- [ ] Run the orchestrator test too — `generatePost`'s fixture `goodMd` is a `cve` post and now must satisfy the AEO gates or the test's "produces a complete Post" case will start self-healing/failing. Verify:
  ```
  cd api && npx vitest run test/case-study/generation/index.test.ts
  ```
  If `index.test.ts` now fails because `goodMd` lacks `## TL;DR`/`## FAQ`/IOC-table, update the `goodMd` fixture at `api/test/case-study/generation/index.test.ts:18-35` to include them: add `'## TL;DR'` + a ≤120-word answer line as the first section, add a `## FAQ` section with one `**Question?**`/answer pair before `## References`, and render the IOCs section as a markdown table (`| Indicator | Type | Context |`). Keep the post substantive so QA still passes. Re-run until green.
- [ ] Commit:
  ```
  git commit -am "feat(case-study): QA gates for TL;DR, FAQ, and IOC table on structured blog types"
  ```

---

## Task 5 — Blog render layer: BlogPosting + FAQPage JSON-LD, Person author sameAs, visible "Updated" date

`src/pages/BlogPost.tsx` already inlines a `BlogPosting` JSON-LD (`:261-285`) but: (a) `dateModified` just mirrors `datePublished`, (b) the author `Person` has no `sameAs`, (c) there's no `FAQPage` JSON-LD, and (d) the byline shows only the published date, not a visible "Updated" date. This Task adds a real `dateModified` (use `post.publishedAt` as the base, but surface an "Updated" label and emit `dateModified` so re-published posts read correctly), a `Person` author with `sameAs` → LinkedIn/X, a separate `FAQPage` JSON-LD built from the rendered FAQ section, and a visible "Updated <date>" line. The `FAQPage` is derived from the already-fetched `bodyHtml` (the `## FAQ` section renders to `<h2>FAQ</h2>` followed by `<p><strong>Q?</strong> … </p>` blocks).

**Files:**

- Modify: `src/pages/BlogPost.tsx` (the `Post` interface at `:7-17`, the JSON-LD `<script>` at `:261-285`, the byline `<div>` at `:317-323`)
- Test: `src/test/BlogPost.test.tsx` (NEW — there is no existing test for this page; `src/test/Blog.test.tsx` covers only the index)

Steps:

- [ ] Write a failing test. Create `src/test/BlogPost.test.tsx`. It mounts the page with a mocked `/api/v1/blog/posts/:slug` response whose `bodyHtml` contains an FAQ, then asserts the page renders a `BlogPosting` and a `FAQPage` JSON-LD plus a visible "Updated" string and the author `sameAs`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, waitFor } from '@testing-library/react';
  import { MemoryRouter, Routes, Route } from 'react-router-dom';
  import BlogPost from '../pages/BlogPost';

  const post = {
    slug: 'cve-2026-1234-x',
    title: 'From Patch Gap to Pwned: CVE-2026-1234',
    type: 'cve',
    publishedAt: '2026-05-19T15:05:00Z',
    body: '## TL;DR\n\nFinding.\n\n## FAQ\n\n**Which versions are affected?** Builds before 7.4.5.',
    hero: '<svg></svg>',
    iocs: [],
    tags: ['cve'],
    candidateId: 'manual-1',
  };
  const bodyHtml =
    '<h2>TL;DR</h2><p>Finding.</p>' +
    '<h2>FAQ</h2><p><strong>Which versions are affected?</strong> Builds before 7.4.5.</p>';

  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/blog/posts/cve-2026-1234-x')) {
        return new Response(JSON.stringify({ post, bodyHtml }));
      }
      return new Response(JSON.stringify({ posts: [] }));
    }) as unknown as typeof fetch;
  });

  function ldScripts(): Record<string, unknown>[] {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
      JSON.parse(s.textContent!.replace(/\\u003c/g, '<'))
    );
  }

  describe('BlogPost render layer (AEO schema + freshness)', () => {
    it('emits BlogPosting with dateModified and a Person author sameAs', async () => {
      render(
        <MemoryRouter initialEntries={['/blog/cve-2026-1234-x']}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogPost />} />
          </Routes>
        </MemoryRouter>
      );
      await waitFor(() => {
        const blog = ldScripts().find((s) => s['@type'] === 'BlogPosting');
        expect(blog).toBeTruthy();
        expect(blog!.dateModified).toBeTruthy();
        const author = blog!.author as { sameAs?: string[] };
        expect(author.sameAs?.some((u) => u.includes('linkedin.com'))).toBe(true);
        expect(author.sameAs?.some((u) => /x\.com|twitter\.com/.test(u))).toBe(true);
      });
    });

    it('emits a FAQPage built from the rendered FAQ section', async () => {
      render(
        <MemoryRouter initialEntries={['/blog/cve-2026-1234-x']}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogPost />} />
          </Routes>
        </MemoryRouter>
      );
      await waitFor(() => {
        const faq = ldScripts().find((s) => s['@type'] === 'FAQPage');
        expect(faq).toBeTruthy();
        const qs = (faq!.mainEntity as Array<{ name: string }>).map((q) => q.name);
        expect(qs.some((n) => /which versions are affected/i.test(n))).toBe(true);
      });
    });

    it('shows a visible Updated date', async () => {
      const { findByText } = render(
        <MemoryRouter initialEntries={['/blog/cve-2026-1234-x']}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogPost />} />
          </Routes>
        </MemoryRouter>
      );
      expect(await findByText(/Updated/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Run, expect FAIL:
  ```
  npx vitest run src/test/BlogPost.test.tsx
  ```
  Expected: `FAQPage` assertion fails (no such script), `dateModified` may pass (already mirrors published) but `author.sameAs` fails (current author has only `name`/`url`), and `Updated` text is not present.
- [ ] Implement. In `src/pages/BlogPost.tsx`:

  Add an FAQ extractor helper near `formatDate` (after `:87`). It parses the rendered `html` (already in state) for the FAQ section's bold-question paragraphs:

  ```tsx
  interface FaqItem {
    question: string;
    answer: string;
  }

  function extractFaq(htmlStr: string): FaqItem[] {
    // The "## FAQ" markdown renders to <h2>FAQ</h2> followed by paragraphs
    // shaped <p><strong>Question?</strong> answer…</p>. Pull each pair until
    // the next <h2>.
    const faqIdx = htmlStr.search(/<h2[^>]*>\s*FAQ\s*<\/h2>/i);
    if (faqIdx < 0) return [];
    const after = htmlStr.slice(faqIdx);
    const end = after.search(/<h2[^>]*>(?!\s*FAQ\s*<)/i);
    const section = end > 0 ? after.slice(0, end) : after;
    const items: FaqItem[] = [];
    const re = /<p>\s*<strong>([^<]+?)<\/strong>\s*([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section)) !== null) {
      const question = m[1].replace(/<[^>]+>/g, '').trim();
      const answer = m[2]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (question && answer) items.push({ question, answer });
    }
    return items;
  }
  ```

  Compute the FAQ items inside the component body (alongside `readTime`/`hashtags`, around `:234-240`):

  ```tsx
  const faqItems = useMemo(() => extractFaq(html), [html]);
  ```

  Extend the local `Post` interface (`:7-17`) so `dateModified` is optional and forward-compatible (the API `Post` does not yet carry it, so fall back to `publishedAt`):

  ```tsx
  interface Post {
    slug: string;
    title: string;
    type: string;
    publishedAt: string;
    updatedAt?: string;
    body: string;
    hero: string;
    iocs: { type: string; value: string }[];
    tags: string[];
    candidateId?: string;
  }
  ```

  Replace the existing `BlogPosting` JSON-LD `<script>` (`:261-285`) and add a sibling `FAQPage` script. Use `post.updatedAt ?? post.publishedAt` for `dateModified`, and give the author `sameAs`:

  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.body
          .replace(/<[^>]+>/g, '')
          .replace(/[#*`>_[\]]/g, '')
          .trim()
          .slice(0, 200),
        datePublished: post.publishedAt,
        dateModified: post.updatedAt ?? post.publishedAt,
        url: `https://pranithjain.qzz.io/blog/${post.slug}`,
        mainEntityOfPage: `https://pranithjain.qzz.io/blog/${post.slug}`,
        author: {
          '@type': 'Person',
          name: 'Pranith Jain',
          url: 'https://pranithjain.qzz.io',
          sameAs: ['https://www.linkedin.com/in/pranithjain', 'https://x.com/Npj8448'],
        },
        publisher: { '@type': 'Person', name: 'Pranith Jain' },
        keywords: post.tags.join(', '),
      }).replace(/</g, '\\u003c'),
    }}
  />;
  {
    faqItems.length > 0 && (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqItems.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />
    );
  }
  ```

  Add a visible "Updated" line to the byline `<div>` (`:317-323`). After the existing `<time>{formatDate(post.publishedAt)}</time>` block, append:

  ```tsx
                <span aria-hidden="true">·</span>
                <span>Updated {formatDate(post.updatedAt ?? post.publishedAt)}</span>
  ```

- [ ] Run, expect PASS:
  ```
  npx vitest run src/test/BlogPost.test.tsx
  ```
- [ ] Commit:
  ```
  git commit -am "feat(blog): BlogPosting+FAQPage JSON-LD, author sameAs, visible Updated date"
  ```

---

## Task 6 — Allow AI crawlers in `robots.txt`

Add explicit `User-agent` allow blocks for `GPTBot`, `PerplexityBot`, `ClaudeBot`, `OAI-SearchBot`, and `Applebot` in `public/robots.txt`. The frontend build copies `public/` into `dist/` (and the SSR `.ssr-build/robots.txt` is a build artifact — do NOT hand-edit `dist/` or `.ssr-build/`; they regenerate from `public/`).

**Files:**

- Modify: `public/robots.txt`
- Test: `src/test/robots.test.ts` (NEW — a plain file-content assertion; no DOM needed)

Steps:

- [ ] Write a failing test. Create `src/test/robots.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';

  const robots = readFileSync(fileURLToPath(new URL('../../public/robots.txt', import.meta.url)), 'utf8');

  describe('robots.txt AI crawler access', () => {
    it('explicitly allows the major AI crawlers', () => {
      for (const ua of ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'OAI-SearchBot', 'Applebot']) {
        const block = new RegExp(`User-agent:\\s*${ua}\\s*\\nAllow:\\s*/`, 'i');
        expect(block.test(robots)).toBe(true);
      }
    });

    it('still disallows admin/private/api for those crawlers and the wildcard', () => {
      expect(robots).toMatch(/Disallow:\s*\/admin\//);
      expect(robots).toMatch(/Disallow:\s*\/api\//);
    });
  });
  ```

- [ ] Run, expect FAIL:
  ```
  npx vitest run src/test/robots.test.ts
  ```
  Expected: the AI-crawler assertion fails (only a `User-agent: *` block exists today).
- [ ] Implement. Edit `public/robots.txt`. Keep the existing wildcard block and sitemap, and add explicit allow blocks for the AI crawlers (each still disallowing the private paths). Final file:

  ```
  # robots.txt for Pranith Jain Portfolio
  # https://pranithjain.qzz.io

  User-agent: *
  Allow: /

  # AI assistants & answer engines — explicitly allowed so blog content is
  # citable in AI answers (AEO/GEO). Private paths stay disallowed.
  User-agent: GPTBot
  Allow: /

  User-agent: OAI-SearchBot
  Allow: /

  User-agent: ClaudeBot
  Allow: /

  User-agent: PerplexityBot
  Allow: /

  User-agent: Applebot
  Allow: /

  # Sitemap location
  Sitemap: https://pranithjain.qzz.io/sitemap.xml

  # Disallow any potential admin or private areas (not applicable for this static site)
  Disallow: /admin/
  Disallow: /private/
  Disallow: /api/
  ```

- [ ] Run, expect PASS:
  ```
  npx vitest run src/test/robots.test.ts
  ```
- [ ] Commit:
  ```
  git commit -am "feat(seo): allow GPTBot/PerplexityBot/ClaudeBot/OAI-SearchBot/Applebot in robots.txt"
  ```

---

## Task 7 — Full Phase-2 regression + verification

Confirm the whole generation pipeline and the front-end render layer pass together, and that no pre-existing test regressed (the `goodMd` fixture change in Task 4 and the prompt changes in Task 3 are the highest-risk interactions).

**Files:** none (verification only).

Steps:

- [ ] Run the full generation test directory:
  ```
  cd api && npx vitest run test/case-study/generation
  ```
  Expected: all of `ai-client`, `templates`, `index`, `post-process`, `social`, `ioc-live-validation`, `hero-svg` green. (`social.test.ts` is unchanged — Phase 3 owns social — but it must not have regressed from the `copywriting.ts` guardrail edit; if `social.test.ts` asserts on `PIPELINE_OUTPUT_GUARDRAIL` text, reconcile.)
- [ ] Run the broader case-study e2e (catches orchestration drift):
  ```
  cd api && npx vitest run test/case-study/e2e.test.ts
  ```
  If `e2e.test.ts` exercises `generatePost` with a fixture body lacking TL;DR/FAQ/IOC-table, update that fixture the same way as Task 4's `goodMd` (add `## TL;DR`, `## FAQ` with a bold question, and an IOC table when the fixture has IOCs) until green.
- [ ] Run the front-end render + robots tests:
  ```
  npx vitest run src/test/BlogPost.test.tsx src/test/robots.test.ts src/test/Blog.test.tsx
  ```
  Expected: all green (Blog index unaffected; included to confirm no collateral break).
- [ ] Typecheck the API package (the per-edit hook already enforces this, but run once for the whole tree):
  ```
  cd api && npx tsc --noEmit
  ```
  Expected: no errors. (No `worker/` files were edited, so `tsc -p api/tsconfig.worker.json` is not required this phase.)
- [ ] If anything failed and was fixed above, commit the fixups:
  ```
  git commit -am "test(case-study): reconcile fixtures with Phase 2 AEO QA gates"
  ```
  (Skip if there was nothing to fix.)

---

## Phase 2 acceptance (maps to spec §4.5)

- Generation runs on `openai/gpt-oss-120b` (blog, `reasoning_effort: low`) / `llama-3.3-70b-versatile` (social default available via `groqModel`), with the no-chain-of-thought guardrail suppressing reasoning leakage (Tasks 1-2).
- New blog posts are prompted for and QA-gated on TL;DR + FAQ + IOC table + named detections + estimative language + stat density (Tasks 3-4).
- Rendered post emits valid `BlogPosting` (+`dateModified`) and `FAQPage` JSON-LD with a `Person` author `sameAs` → LinkedIn/X, shows a visible "Updated" date, and `robots.txt` allows the major AI crawlers (Tasks 5-6).
