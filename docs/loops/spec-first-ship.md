# Spec-First Ship

**Category:** Planning / manual

## Loop Description

Implement from a written spec checklist — each iteration completes exactly one unchecked
requirement, then re-reads the spec. In this repo, designs live in
`docs/superpowers/specs/`; this loop drives one of those specs to completion item by item.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT check off a requirement you haven't actually implemented and verified.
- Do NOT silently expand scope beyond the spec — if something is missing from the spec,
  note it and ask, don't improvise a new feature.
- Each iteration ships ONE requirement, tested; do not batch half-finished items to look
  productive.
- If a requirement turns out to be wrong or infeasible, STOP and reconcile the spec rather
  than coding around it.

## Kickoff Prompt

```
Start the "Spec-First Ship" loop.

Goal: Every requirement in the spec checklist is implemented, tested, and checked off
Max iterations: 20
Between iterations run: re-read the spec checklist + run the relevant tests for the item just finished
Exit when: all checklist items are checked AND their tests pass

Step 1: Open the spec (docs/superpowers/specs/<spec>.md). Take the first unchecked
requirement, implement it, test it, check it off. Re-read the spec.

Self-pace this loop. After each iteration, re-read the checklist + run that item's tests,
and only continue if any requirement is unchecked. Stop when the spec is complete or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Open the spec** — the relevant `docs/superpowers/specs/<spec>.md` checklist.
2. **Take one item** — the first unchecked requirement.
3. **Implement + test** — complete and verify just that item; check it off.
4. **Re-read** — confirm remaining items; repeat until the checklist is done.
