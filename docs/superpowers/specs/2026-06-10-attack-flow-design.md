# MITRE Attack-Flow Output (sub-project) — Design Spec

**Date:** 2026-06-10
**Status:** Draft — awaiting user review
**Scope:** Emit MITRE **Attack-Flow** STIX 2.1 extension objects from `buildStixBundle`
so a built bundle carries an ordered attack-step graph, not just an unordered set of
`attack-pattern` objects. Sub-project 2 of the Stixify-integration effort (see
[[stixify-roadmap]]). Sub-project 3 (TAXII determinism) is separate.

## Background / decisions (locked with user)

- Techniques enter the bundle ONLY via the LLM extractor (`llmEntities.attackPatterns`,
  an **unordered** array); `extract.ts` produces none. The LLM array order is
  non-deterministic across runs.
- **Ordering = "both": deterministic tactic-phase order by default; LLM-inferred order
  when available.** Tactic ordering also normalizes the LLM's flaky array order into a
  stable kill-chain sequence. Determinism holds on the non-LLM-ordered path (the user
  accepted that LLM-ordered flows are non-deterministic).
- **Linear chain only** for v1 — `attack-flow` + ordered `attack-action`s linked by
  `effect_refs`. No `attack-condition`/`attack-operator`/`attack-asset` (no branching
  signal exists; empty branches would be noise).
- **Regenerate the ATT&CK index** to carry each technique's tactic (the build script
  currently discards `kill_chain_phases`).
- Bundle output only — the frontend Attack-Flow visualizer is out of scope (the `view`
  gains an ordered `flowSteps[]` for a future renderer).

## Attack-Flow STIX model (reference)

Extension id: `extension-definition--fb9c968a-745b-4ade-9b25-c324172197f4`; every
Attack-Flow SDO carries `extensions: { "<extId>": { extension_type: "new-sdo" } }`.

- `attack-flow` — `name`, `scope` (use `'incident'`), `start_refs: [<first action>]`.
- `attack-action` — `name`, `technique_id` (T####), `technique_ref` → the
  `attack-pattern` object, `effect_refs: [<next>]` (linear chain).
- (v1 omits `attack-asset`/`attack-condition`/`attack-operator`.)
- We also emit the `extension-definition` SDO itself once (name "Attack Flow",
  `extension_types: ['new-sdo']`) so the bundle imports cleanly into Attack Flow Builder.

## Architecture

### 1. ATT&CK index gains tactic data

`scripts/build-attack-index.mjs`: for `attack-pattern` objects, capture the first
`kill_chain_phases[].phase_name` (where `kill_chain_name === 'mitre-attack'`) as `tac`.
Result entries become `{ id, col, tac? }`. Update the generated header's `AttackRef`
interface to `{ id: string; col: 'e' | 'i' | 'm'; tac?: string }`. **Regenerate**
`api/src/data/attack-id-index.ts` by running the script (one-time ~47 MB fetch).

### 2. New helper `api/src/lib/attack-flow.ts` (pure, testable)

```ts
export const ATTACK_FLOW_EXT_ID = 'extension-definition--fb9c968a-745b-4ade-9b25-c324172197f4';

// Enterprise tactics in kill-chain order (phase_name shortnames).
export const TACTIC_ORDER: string[] = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
];

export interface FlowTechnique {
  id: string;
  name: string;
  stixApId: string;
  tactic?: string;
}

/** Deterministic kill-chain sort: by TACTIC_ORDER index (unknown tactics last),
 *  then by technique id (stable tiebreak). Pure — no I/O. */
export function orderByTactic(techs: FlowTechnique[]): FlowTechnique[];
```

`orderByTactic` resolves each technique's tactic from its `tactic` field (LLM) or
`ATTACK_ID_INDEX[id]?.tac`. The helper also exposes object-builder pure functions used
by `buildStixBundle` (so they're unit-testable without the whole pipeline):
`buildAttackFlowObjects(ordered, { flowName, identityId, time, idFor })` returning
`{ objects: StixCommon[]; flowId: string; startRef: string | null }` where `idFor` is an
injected async UUIDv5 id factory (keeps determinism + testability).

### 3. extract-llm gains ordering signal

- Prompt: instruct the model to list `attackPatterns` **in the chronological / kill-chain
  order described in the report**, and optionally tag each with its ATT&CK `tactic`
  (phase_name shortname).
- `LlmEntities.attackPatterns` entry gains optional `tactic?: string`. Add
  `flowOrdered: boolean` to `LlmEntities` (true when the model ran and returned ordered
  techniques; false on the empty/degraded paths). `validateLlmEntities` preserves array
  order (it already pushes in order) and passes through a validated `tactic` when present
  (lowercased, must be in `TACTIC_ORDER` else dropped).

### 4. buildStixBundle integration

After `attackPatternObjs` + `reportRefId` are computed (before `object_refs`):

- Zip `llmEntities.attackPatterns[i]` ↔ `attackPatternObjs[i]` → `FlowTechnique[]`.
- `ordered = llmEntities.flowOrdered ? techs : orderByTactic(techs)`.
- If `ordered.length >= 1`: build the `extension-definition` SDO, the `attack-flow`, and
  the linear `attack-action`s via the helper; push them into the final `objects` array;
  add `attackFlowId` to `object_refs` (so the existing `report → refers-to → attack-flow`
  loop covers it). Do NOT add individual actions to `object_refs` (keeps refers-to noise
  down; actions are reachable via the flow).
- `view.flowSteps = ordered.map(t => ({ techniqueId: t.id, name: t.name, tactic }))`.

All Attack-Flow object IDs are deterministic UUIDv5: `attack-flow|{sourceId}|{itemRef}`,
`attack-action|{sourceId}|{itemRef}|{techId}`, `extension-definition` uses the fixed
canonical id. So objects are byte-identical across runs; only `effect_refs`/`start_refs`
ordering varies when `flowOrdered` is true.

### 5. IntelView

Add optional `flowSteps?: { techniqueId: string; name: string; tactic?: string }[]`.

## Error handling / edge cases

- 0 techniques → no Attack-Flow objects emitted (bundle unchanged from today).
- 1 technique → valid flow: one `attack-action`, no `effect_refs`, `start_refs=[it]`.
- Unknown tactic (not in `TACTIC_ORDER`, no index `tac`) → sorts last, stable by id.
- `orderByTactic` is total/pure; never throws.

## Testing

- **attack-flow.ts unit:** `orderByTactic` (kill-chain order; unknown-tactic-last; id
  tiebreak; LLM `tactic` overrides index); `buildAttackFlowObjects` with an injected id
  factory → correct linear `effect_refs`, `start_refs`, `technique_ref` wiring, and the
  `extensions` block + `extension-definition` SDO on output.
- **stix-build:** golden test — fixed `llmEntities.attackPatterns` (flowOrdered=false) →
  deterministic tactic-ordered flow (assert action order + stable IDs); flowOrdered=true
  → LLM array order preserved; `report → refers-to → attack-flow` edge present; running
  twice yields identical bundles. Existing `stix-build.test.ts` (23) stays green.
- **index:** a tiny assertion that a known technique (e.g. `T1059`) now has a `tac`.
- Typecheck all three projects.

## Files touched

**New:** `api/src/lib/attack-flow.ts`, `api/test/lib/attack-flow.test.ts`
**Edited:** `scripts/build-attack-index.mjs`, `api/src/data/attack-id-index.ts`
(regenerated), `api/src/lib/extract-llm.ts`, `api/src/lib/stix-build.ts`,
`api/test/lib/stix-build.test.ts`

## Non-goals / seams

- No branching SDOs (v1). No frontend visualizer. No change to TAXII (sub-project 3).
- A later sub-project could add `attack-asset` (link IOCs/malware to actions) and
  branching once a signal exists; `buildAttackFlowObjects` is structured to extend.
