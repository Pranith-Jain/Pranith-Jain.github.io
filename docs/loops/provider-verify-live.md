# Provider Verify Live

**Category:** Integration / manual

## Loop Description

After touching any provider adapter under `api/src/providers/`, verify each one against
its LIVE upstream — provider adapters silently rot (wrong auth/field/branch → HTTP 200
but empty payload). Loop until no adapter returns status-ok-but-empty.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT assert success from HTTP status alone — a 200 with an empty/zero-length body is
  a FAILURE for this loop. Inspect the parsed fields.
- Do NOT mock or stub the upstream to make the check pass. Verify against the real
  upstream response format.
- Do NOT relax the "non-empty + correct shape" assertion to clear a stubborn adapter.
- If an adapter is genuinely upstream-broken (key revoked, endpoint moved), STOP and
  report it rather than papering over it.

## Kickoff Prompt

```
Start the "Provider Verify Live" loop.

Goal: Every touched provider adapter returns real, correctly-shaped data from its live upstream
Max iterations: 8
Between iterations run: a script/curl that calls each touched adapter and prints field counts
Exit when: no touched adapter returns status-ok-but-empty (every one yields populated, correctly-typed fields)

Step 1: For each adapter changed in `api/src/providers/`, call it against the live
upstream, compare the parsed output to the documented upstream format, and fix
auth/field-mapping/branch bugs until the data is real.

Self-pace this loop. After each iteration, run the check, read the field counts, and only
continue if any adapter is still empty/malformed. Stop when all are populated or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Enumerate touched adapters** — `git diff --name-only origin/main -- api/src/providers/`.
2. **Call live** — hit each adapter against the real upstream; capture the parsed object.
3. **Diff vs upstream format** — confirm auth header, response field paths, and branch/version match the current upstream.
4. **Fix at the source** — correct the mapping/auth; never weaken the non-empty assertion.
