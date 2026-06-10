# Add CTI Endpoint

**Category:** Feature / manual

## Loop Description

Add a new `/api/v1/*` endpoint end-to-end. A route is not done until its handler reads are
mirrored by a `validate()` schema, it respects the auth gate, it's registered, and it has
a local test that passes — loop until the contract test and the route test are green.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT let the `validate()` schema drift from the handler's reads — drift 400s valid
  requests before the handler runs; the contract test exists to catch exactly this.
- Do NOT bypass the auth gate; external `/api/v1/*` reads are key-gated (with the
  `OPEN_PUBLIC_READS` valve for test/emergency only — not a way to ship an open endpoint).
- Do NOT rely on CI to catch route bugs — CI skips `test/routes/`; run the route test
  locally (sandbox disabled).
- If the endpoint accepts uploads, it MUST be multipart + self-cap (the global 256 KB
  `looseValidation` cap 413s larger non-multipart bodies).

## Kickoff Prompt

```
Start the "Add CTI Endpoint" loop.

Goal: A new /api/v1 endpoint is registered, schema-contracted, auth-gated, and tested green
Max iterations: 8
Between iterations run: the route-schema contract test + the new route's local test (sandbox disabled)
Exit when: both tests pass and the handler is reachable through the auth gate

Step 1: Add the handler, a validate() schema mirroring its reads, register the route, and
write a local route test (happy path + a rejected-input path). Run the contract + route
tests.

Self-pace this loop. After each iteration, run the tests, read the output, and only
continue if anything is red or the schema/handler drift. Stop when green or max iterations
is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Handler** — implement the route in `api/src/routes/`; register it.
2. **Schema** — add a `validate()` schema in `validation-schemas` that mirrors every handler read.
3. **Auth** — confirm it sits behind the key gate; only test config uses `OPEN_PUBLIC_READS`.
4. **Test** — local route test (happy + rejected input) with the sandbox disabled; confirm the contract test stays green.
