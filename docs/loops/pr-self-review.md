# PR Self-Review

**Category:** Review / manual

## Loop Description

Review your own diff like a senior reviewer would, fix what you find, and repeat for a
few passes before opening the PR. Each pass looks at the change with fresh eyes —
correctness, edge cases, naming, tests, and whether it matches the surrounding code.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT rubber-stamp your own work — each pass must genuinely look for problems, not
  confirm the code is fine.
- Do NOT defer real findings to "later"; either fix them now or record them explicitly as
  known follow-ups.
- A clean exit means a _fresh_ pass found nothing actionable — not that you ran out of
  patience.
- Keep the review scoped to the diff; do not expand into unrelated refactors.

## Kickoff Prompt

```
Start the "PR Self-Review" loop.

Goal: The diff survives a senior-level self-review with no actionable findings
Max iterations: 3
Between iterations run: git diff origin/main  (re-read with fresh eyes; run lint + relevant tests)
Exit when: a fresh review pass finds nothing actionable AND lint + tests pass

Step 1: Read the diff as a skeptical senior reviewer — correctness, edge cases, error
handling, naming, missing tests, house-style fit. Fix each finding, then re-review.

Self-pace this loop. After each iteration, re-read + check, and only continue if anything
remains. Stop when clean or max iterations (3) is reached. Give a short status update each
pass.
```

## Steps (Agent Actions)

1. **Read as a reviewer** — `git diff origin/main`; look for correctness/edge-case/error gaps.
2. **Check tests + style** — is the change tested? does it match the surrounding code?
3. **Fix findings** — remediate at the source; record any deliberate follow-ups.
4. **Re-review** — fresh pass; exit only when it surfaces nothing actionable.
