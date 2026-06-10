# Coverage Until Threshold

**Category:** Testing / manual

## Loop Description

Add focused tests until coverage meets your threshold, without changing production
behavior. Generic flow; in this repo, coverage comes from `npm run test:coverage` (root)
or the `api/` vitest suite.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT change production code to inflate coverage — only add tests (bug fixes the tests
  expose are fine, but note them separately).
- Do NOT write assertion-free or trivially-passing tests to bump the number; each test
  must actually exercise and verify behavior.
- Do NOT lower the threshold to pass the loop — the threshold IS the goal.
- For `api/` route coverage, remember CI skips `test/routes/`; run them locally (sandbox
  disabled).

## Kickoff Prompt

```
Start the "Coverage Until Threshold" loop.

Goal: Coverage meets the target threshold (e.g. 80%) with meaningful tests
Max iterations: 10
Between iterations run: npm run test:coverage  (or the api vitest coverage run)
Exit when: coverage >= threshold AND all tests pass

Step 1: Read the coverage report, find the most important uncovered branch/function, and
add a focused test that actually verifies its behavior. Re-run coverage.

Self-pace this loop. After each iteration, run coverage, read it, and only continue if
below threshold. Stop when the threshold is met or max iterations is reached. Give a short
status update each pass.
```

## Steps (Agent Actions)

1. **Measure** — `npm run test:coverage` (root) or the `api/` coverage run.
2. **Target the gap** — pick the highest-value uncovered branch/function.
3. **Add a real test** — exercise the behavior and assert on it; no behavior changes.
4. **Re-measure** — confirm the number rose and all tests pass.
