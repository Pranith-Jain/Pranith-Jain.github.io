# Upload Route Hardening

**Category:** Security / manual

## Loop Description

After adding or changing a file-upload route, verify it survives the global `/api/v1/*`
middleware and enforces its own limits. The global `looseValidation` middleware 413s any
body over 256 KB _before the handler runs_, so upload routes MUST be `multipart/form-data`
(the exempted content type) AND enforce their own size cap — proven by an integration
test that mounts the real middleware. Loop until that test passes.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT raise or remove the 256 KB global cap to make an upload work — the route must be
  multipart (exempt) and cap itself.
- Do NOT test the handler in isolation with the middleware stubbed out; the integration
  test MUST mount the real `looseValidation` middleware, or it proves nothing.
- Do NOT drop the per-route size enforcement; multipart exemption removes the global cap,
  so the route owns the limit.
- If an upload legitimately needs >256 KB, that is fine via multipart — but the own-cap
  and the integration test are still required.

## Kickoff Prompt

```
Start the "Upload Route Hardening" loop.

Goal: Each upload route is multipart, self-caps, and passes an integration test mounting the real middleware
Max iterations: 6
Between iterations run: the api integration test that mounts looseValidation against the upload route
Exit when: the integration test exits 0 (multipart accepted, oversized body rejected by the route's own cap)

Step 1: Confirm the route accepts multipart/form-data, enforces its own byte cap, and has
an integration test that mounts the REAL looseValidation middleware and asserts both the
happy path and the oversized-body rejection. Fix the route or the test until green.

Self-pace this loop. After each iteration, run the check, read the output, and only
continue if the test is still failing. Stop when green or max iterations is reached. Give
a short status update each pass.
```

## Steps (Agent Actions)

1. **Content type** — confirm the route reads `multipart/form-data` (the global 256 KB cap exemption).
2. **Own cap** — enforce a per-route byte limit in the handler.
3. **Integration test** — mount the real `looseValidation` middleware; assert valid upload passes and oversized body is rejected by the route.
4. **Run locally** — sandbox disabled (CI skips `test/routes/`); confirm exit 0.
