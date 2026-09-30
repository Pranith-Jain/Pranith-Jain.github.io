# API Tests Unsandboxed

**Category:** Testing / manual

## Loop Description

Run the `api/` test suite, including `test/routes/`, and loop until green. No sandbox
flag is needed — the suite passes under `@cloudflare/vitest-pool-workers` as configured
(`api/vitest.config.ts`), and CI runs the routes as their own step (`api vitest (routes)`),
so a red here is a real failure, not an environment quirk.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT `.skip`/`xfail` a failing route test to clear the suite — fix the handler or
  the test expectation against real behavior.
- Do NOT delete the integration test that mounts the real `looseValidation` middleware
  for file-upload routes — it guards the 256 KB body cap exemption.
- Do NOT reintroduce `dangerouslyDisableSandbox` (or a `SANDBOX_DISABLED`-style flag)
  as a "fix" for a real failure — the suite does not need it; a failure here is a real
  failure.
- If a test fails for an environment reason you cannot resolve, STOP and report it.

## Kickoff Prompt

```
Start the "API Tests Unsandboxed" loop.

Goal: api/ test suite (including test/routes/) passes
Max iterations: 8
Between iterations run: `cd api && npx vitest run test/routes`
Exit when: vitest exits 0 for the touched route tests

Step 1: Run the route tests (`cd api && npx vitest run test/routes`).
Read the first failure, fix the handler or expectation at the source, and re-run.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if any test is still failing. Stop when green or max iterations is reached.
Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Run route tests** — `cd api && npx vitest run test/routes` (CI runs the same set).
2. **Read first failure** — identify the failing route + assertion.
3. **Fix at the source** — correct the handler, validation schema, or expectation; keep the real middleware mounted for upload-route tests.
4. **Re-run** — confirm the suite exits 0.

## Notes (repo footguns)

- The suite timeout is 30 s (`testTimeout` in `api/vitest.config.ts`) because
  cold-cache loader routes can spend 15 s on one upstream fetch (ransomwhere) plus
  10 s on transfer fetches before degrading to empty — a 15 s timeout turned that
  into a flaky red. The tracer EVM expand test carries its own 60 s timeout for the
  same reason.
- External `/api/v1/*` reads are key-gated; every source helper degrades to empty
  output on missing keys, so assertions should never depend on live upstream data.
- `singleWorker` is not a real option in the pool's schema (unknown keys are
  stripped). If `EADDRNOTAVAIL` ever recurs under concurrency, set
  `fileParallelism: false` in `api/vitest.config.ts` instead of skipping routes.
