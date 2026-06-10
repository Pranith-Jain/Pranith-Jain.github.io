# API Tests Unsandboxed

**Category:** Testing / manual

## Loop Description

Run the `api/` test suite locally. The vitest-pool-workers suite only passes with the
sandbox disabled, and CI skips `test/routes/` — so after editing `api/src/routes/`, run
those route tests locally and loop until green.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT `.skip`/`xfail` a failing route test to clear the suite — fix the handler or
  the test expectation against real behavior.
- Do NOT delete the integration test that mounts the real `looseValidation` middleware
  for file-upload routes — it guards the 256 KB body cap exemption.
- Do NOT keep `dangerouslyDisableSandbox` as a "fix" for a real failure; it is only the
  environment requirement for vitest-pool-workers, not a way to pass.
- If a test fails for an environment reason you cannot resolve, STOP and report it.

## Kickoff Prompt

```
Start the "API Tests Unsandboxed" loop.

Goal: api/ test suite (including test/routes/) passes locally
Max iterations: 8
Between iterations run: the api vitest run with the sandbox disabled
Exit when: vitest exits 0 for the touched route tests

Step 1: Run the api test suite locally (sandbox disabled, since CI skips test/routes/).
Read the first failure, fix the handler or expectation at the source, and re-run.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if any test is still failing. Stop when green or max iterations is reached.
Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Run route tests locally** — the api vitest-pool-workers run with `dangerouslyDisableSandbox` (CI does not cover `test/routes/`).
2. **Read first failure** — identify the failing route + assertion.
3. **Fix at the source** — correct the handler, validation schema, or expectation; keep the real middleware mounted for upload-route tests.
4. **Re-run** — confirm the suite exits 0.
