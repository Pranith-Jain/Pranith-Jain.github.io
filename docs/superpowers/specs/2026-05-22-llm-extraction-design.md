# LLM Extraction (Intel-Bundle Augment) — Design Spec

**Date:** 2026-05-22
**Status:** Approved — pending implementation plan
**Author:** Claude (brainstormed with user)

## Summary

Add a second, LLM-backed extraction pass to the intel-bundle pipeline that
catches entities the regex/dictionary `extract()` misses — sectors,
affected products, MITRE ATT&CK techniques, and **candidate** actor/malware
names from prose. Runs only on the cron-warmed path (no user-facing
latency, no extra cost on cache-miss render paths). Output is reconciled
through a strict allowlist + verbatim-in-source guardrail so a hallucinated
attribution can never enter the canonical `view.threatActors[]` /
`view.malware[]` arrays — it lands in a separate "candidate" slot the UI
renders under an explicit "unverified" disclosure.

## Cross-Cutting Constraints

1. **Cron-warm path only.** Wired into `warmIntelBundles()`. The synchronous
   on-demand routes (`GET /api/v1/intel-bundle`, `POST .../build`) stay
   regex/dict-only — first card paint is unaffected. The cron warmer
   already runs at 1 bundle/hour with a dedicated subrequest budget, so
   the extra LLM call comfortably fits.
2. **Additive, never overrides.** Regex/dictionary output stays the
   canonical extraction. LLM output augments — sectors, products, attack
   patterns — or lands in a candidate slot for actors/malware. The
   existing `view.threatActors[]` / `view.malware[]` / `view.iocs[]`
   shapes are unchanged in semantics.
3. **Bundle never blocked by LLM.** Any LLM failure (rate limit, parse
   error, timeout, schema mismatch) degrades to an empty result with
   `partial: true`; the bundle still ships with regex-only signal.
4. **Defensive boundary preserved.** The LLM extractor inherits the
   pipeline's combolist filter (it never sees credential pairs in the
   first place — extract.ts already strips them before this runs at the
   call site).

## Placement in Pipeline

```
warmIntelBundles → for each row:
  entities       = extract(title, body)                          (sync, regex/dict)
  llmEntities    = shouldRunLlm(body, briefing) ? extractLlm(...) : empty
  bulk           = enrichBulk(entities.iocs, env)
  cveEnrichments = enrichCves(entities.cves)
  built          = buildStixBundle(report, entities, bulk, cveEnrichments, llmEntities)
  writeBundle(db, built, report, bulk)
```

`extractLlm` runs in parallel with `enrichBulk` and `enrichCves` (all three
in a single `Promise.all`), so wall-clock cost stays bounded by the slowest
of the three.

**Skip rule** (before any LLM call):

- `intelBody.length < 600` (no prose to mine), OR
- `briefing.sections.findings.length === 0` (degraded / empty briefing)

When skipped, `extractLlm` returns `{ ran: false, ...empty arrays }`
without hitting the LLM at all.

## LLM Call Contract

**Client.** Reuses `runCompletion(ai, input, { groqKey })` from
`api/src/case-study/generation/ai-client.ts`. Provider order is Groq →
Workers AI fallback, fail-fast on rate-limit (account-wide quota errors
can't be retried away). The LLM-extractor exposes a DI seam:

```ts
extractLlm(title, body, entities, env, opts?: {
  runCompletion?: typeof runCompletion;
})
```

The default is the real implementation; tests inject a stub. Same pattern
as `cve-enrich.ts` with its optional `fetch?` parameter.

**Call shape:**

- Body cap: **8K chars** before send (truncate the tail with an ellipsis
  marker so the prompt boundary is honest).
- `maxTokens: 1500`, `temperature: 0.2`.
- `AbortSignal.timeout(8000)`.
- Single attempt — no retry on the LLM side. On any failure the bundle
  is still written (regex-only signal + `llmEnrichment.ran: true,
partial: true`), so the next cron firing will **not** re-attempt
  (the row is already in `intel_bundles`). Re-warming a specific slug
  with LLM is explicitly out of scope; the per-bundle audit trail in
  `view.llmEnrichment` is what makes a future re-warm affordance
  buildable when needed.

**System prompt (verbatim):**

```
You are a defensive cyber-threat-intelligence analyst extracting entities
from a security briefing. Respond with ONLY a JSON object matching this
schema, no prose, no markdown fences:

{
  "sectors": ["string"],
  "affected_products": [{"vendor": "string", "product": "string"}],
  "attack_patterns": [{"id": "T#### or T####.###", "name": "string"}],
  "actor_candidates": [{"name": "string", "rationale": "string"}],
  "malware_candidates": [{"name": "string", "rationale": "string"}]
}

Rules:
- Use ONLY entities explicitly named in the source text.
- Sectors are industries / verticals affected by the threat
  (e.g. "european-government", "healthcare", "manufacturing").
- Affected products are software/hardware named as vulnerable or targeted.
- Attack patterns must be MITRE ATT&CK technique IDs (T#### or sub-T####.###).
- actor_candidates and malware_candidates are NEW or unfamiliar names
  worth analyst review. The rationale must be one sentence quoting or
  paraphrasing the source.
- Empty arrays are valid. Do not invent.
```

**User prompt:** literal title on first line, blank line, then body
(capped at 8K chars).

## Output Schema & Reconciliation

### Tolerant parser

Response is parsed by extracting the **first balanced `{…}` substring**
(handles fenced / prose-wrapped responses), then `JSON.parse`. Parse
failure → empty result with `partial: true`. No exception escapes.

### Per-class validation

| Field                | Validation                                                                                                                                                                                                                                                                          | Cap |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `sectors`            | Trim, lowercase-canonical (spaces → dashes), dedupe                                                                                                                                                                                                                                 | 8   |
| `affected_products`  | Drop rows missing vendor or product; trim; dedupe by `vendor\|product`                                                                                                                                                                                                              | 12  |
| `attack_patterns`    | `id` matches `^T\d{4}(\.\d{3})?$`; **must** exist in `ATTACK_ID_INDEX`; dedupe by id. Mapped into `view.attackPatterns` as `{ name, mitreId: id }`.                                                                                                                                 | 16  |
| `actor_candidates`   | Drop if `name` already canonical in `ACTOR_ALIASES` (canonical or any alias, case-insensitive equality). Drop if `name.toLowerCase()` is not a substring of `(title + ' ' + body).toLowerCase()` — substring (not word-boundary) so multi-word names match without false-negatives. | 4   |
| `malware_candidates` | Same as actors with `MALWARE_DICT`.                                                                                                                                                                                                                                                 | 4   |

A class with all entries dropped becomes `[]`. The
`view.llmEnrichment.partial` flag (distinct from the existing
`view.partial` which reflects the IoC-bulk pipeline) flips when the LLM
call **ran** but **either** the JSON parse failed **or** the response
contained no recognisable top-level shape. Individual per-class drops
do NOT flip `partial` — they're the strict guardrail working as
intended.

### Where the values live

| Class               | STIX bundle                                                                                                                                         | View                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sectors`           | `report.x_sectors: string[]`                                                                                                                        | `view.sectors: string[]`                                                                              |
| `affectedProducts`  | `report.x_affected_products: { vendor, product }[]`                                                                                                 | `view.affectedProducts`                                                                               |
| `attackPatterns`    | One `attack-pattern` SDO per validated MITRE ID with `external_references` to attack.mitre.org; plus `report → uses → attack-pattern` relationships | `view.attackPatterns: { name, mitreId }[]` (slot already exists, always empty before — now populated) |
| `actorCandidates`   | `report.x_llm_actor_candidates: { name, rationale }[]`                                                                                              | `view.actorCandidates`                                                                                |
| `malwareCandidates` | `report.x_llm_malware_candidates`                                                                                                                   | `view.malwareCandidates`                                                                              |
| LLM provenance      | `report.x_llm_enrichment: { ran, partial, modelUsed }`                                                                                              | `view.llmEnrichment`                                                                                  |

**Candidates are NOT emitted as `threat-actor` / `malware` SDOs.** That is
the strict-guardrail boundary — the STIX bundle's canonical entity lists
stay authoritative even if the candidates are correct.

## Schema Additions

**`api/src/lib/stix-build.ts`** — `IntelView` gains:

```ts
sectors: string[];
affectedProducts: { vendor: string; product: string }[];
attackPatterns: { name: string; mitreId: string }[];   // existed; now populated
actorCandidates: { name: string; rationale: string }[];
malwareCandidates: { name: string; rationale: string }[];
llmEnrichment?: { ran: boolean; partial: boolean; modelUsed?: string };
```

**`buildStixBundle` signature:**

```ts
buildStixBundle(
  report, entities, bulk,
  cveEnrichments?: Map<string, CveEnrichment>,
  llmEntities?: LlmEntities
)
```

`llmEntities` defaults to an empty object so all existing call sites
(the build route, the stix-build tests) compile without edits.

**`src/hooks/useIntelBundle.ts`** — mirror the new fields as `?:` optional
for back-compat with bundles persisted before this lands.

## Frontend UI (IntelCard)

- **Sectors** — chip row above "Keywords", same chip styling, label
  `Sectors`. Hidden when empty.
- **Affected products** — new section under "CVEs", `vendor · product`
  rows in a small list. Hidden when empty.
- **Attack patterns** — the existing rendering slot (currently always
  empty) lights up with `name · T####` chips.
- **Candidates (LLM-only, unverified)** — folded into a single bottom
  `<details>` disclosure block labeled `Suggested (unverified, LLM)`,
  dashed border + muted color. Lists `actorCandidates` and
  `malwareCandidates` with their rationales. Hidden when both arrays
  empty.
- **Provenance footer** — when `llmEnrichment.ran === true`, append a
  small `LLM: <model>` chip next to the existing `TLP:WHITE` badge.
  When `partial === true`, append a `partial LLM` warning badge.

## Guardrails & Observability

**Hallucination defense in depth:**

1. Strict JSON schema in system prompt + `temperature: 0.2`.
2. Tolerant parser that extracts the first `{…}` (resilient to fences).
3. Per-class type-checking; malformed entries dropped, not bundle-rejected.
4. `ATTACK_ID_INDEX` allowlist for attack patterns.
5. Verbatim-in-source check for actor / malware candidates.
6. Dictionary dedupe (don't carry a "candidate" of something we already
   canonicalized).
7. Hard caps on every list.

**Cost / timeout:**

- Skip rule before any call (body ≥ 600 chars + ≥1 finding).
- 8K body cap, `maxTokens: 1500`, `AbortSignal.timeout(8000)`.
- Single attempt — no retry, no exponential backoff (the underlying
  `runCompletion` already throws `RateLimitError` fast on quota).

**Error handling:** any thrown error is caught, structured-logged
(`{job: 'extract-llm', slug, error}`), and returns
`{ ran: true, partial: true, ...empty arrays }`. **Never throws upward.**

**Observability:** the existing `intel-bundle-warm` cron-summary log
gets two new fields per slug — `llm_ran`, `llm_partial` — so prod logs
remain greppable for "is the LLM enrichment landing today?". No new D1
column; `view.llmEnrichment` carries the per-bundle audit data.

## Testing

**`api/test/lib/extract-llm.test.ts`** (new):

- Tolerant JSON parsing — fenced, prose-wrapped, malformed inputs.
- ATT&CK ID allowlist — drops `T9999`, keeps valid.
- Verbatim-in-source check — drops candidates not in title+body.
- Dictionary dedupe — drops APT28 (already in dict).
- Caps enforced on every class.
- Skip behavior: short body / zero findings → `ran: false`, no
  `runCompletion` call attempted (verified via spied DI stub).
- Error path: stubbed `runCompletion` throws → returns
  `{ ran: true, partial: true, ...empty }`.

**`api/test/lib/stix-build.test.ts`** (extend):

- With `llmEntities` populated → bundle contains `attack-pattern` SDOs
  and `report → uses → attack-pattern` relationships.
- `report.x_sectors` / `x_affected_products` / `x_llm_*_candidates`
  round-trip into bundle JSON.
- Candidates **do not** appear as `threat-actor` / `malware` SDOs.
- View carries the new fields.

**`api/test/lib/intel-bundle-warm.test.ts`** (extend):

- Stub `extractLlm` via DI (or via stubbing `runCompletion`) and assert
  the new view fields land in the persisted bundle.

## Out of Scope / YAGNI

- **No retry for failed LLM calls.** If the LLM fails on a row, the row
  still gets a bundle written (regex-only); the next cron will not
  re-attempt. A manual "re-warm slug X with LLM" command is a future
  affordance, not blocking this design.
- **No on-demand path integration.** Build routes (`POST .../build`)
  and cache-miss GETs stay regex-only. Re-evaluate after a month if
  briefings users want LLM signal on ad-hoc input.
- **No structured outputs / function-calling** (Groq supports JSON mode
  but Workers AI fallback doesn't reliably; the tolerant parser is the
  consistent path).
- **No per-class specialized prompts** (Approach B from brainstorm). One
  call, one schema; revisit only if quality from Approach A is poor.
- **No new D1 column** for LLM telemetry. `view.llmEnrichment` is the
  durable audit trail; log line is the realtime signal.

## Risks

- **Groq quota exhaustion at the account level.** Mitigated by the
  existing `runCompletion`'s Groq → Workers AI fallback and fail-fast.
  In the worst case the LLM enrichment quietly stops and bundles
  continue to ship with regex-only signal.
- **Hallucinated attribution in the candidate slot.** The verbatim-in-
  source guardrail makes it physically impossible to surface a name the
  source text didn't already contain, but the LLM could still pull a
  spurious noun phrase. Mitigation: the UI labels the section
  "unverified" and the candidates never enter `view.threatActors`.
- **`ATTACK_ID_INDEX` lag.** New ATT&CK techniques (released by MITRE
  quarterly) won't appear in the index until we sync. The validator
  silently drops them. Acceptable — the alternative (regex-only check)
  would let any `T####` pass, including LLM-invented ones.
- **Prompt drift across model versions.** The system prompt assumes
  modern Llama-3.x behavior. If the underlying Groq model changes
  defaults, the schema-compliance rate may drop. Mitigation: the
  tolerant parser tolerates a wide range of malformed outputs; tests
  pin the schema shape.

## Build Order

Single sub-project. Order within: helper + tests → buildStixBundle
integration + tests → warmer wiring + tests → frontend rendering.
Typecheck + lint gates as usual.
