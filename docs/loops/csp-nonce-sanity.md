# CSP Nonce Sanity

**Category:** Deploy / manual

## Loop Description

After touching `worker/csp.ts` or `index.html`, verify the Content-Security-Policy still
lets the app's JavaScript run. The CSP is header-only (no meta tag) and `script-src` is
nonce-based for HTML — a past incident shipped a mismatched nonce that blocked ALL JS and
left every page blank. Loop until the served page executes its scripts.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT add `'unsafe-inline'` to `script-src` to make scripts run — that defeats the
  nonce protection. Fix the nonce injection so the header nonce matches the inline
  `<script>` nonce.
- Do NOT move the CSP into a `<meta>` tag; it is header-only by design.
- Do NOT verify by reading the code alone — load the actual served page and confirm JS
  executed (hydration happened, no spinner-stuck/blank page, no CSP console errors).
- If you must broaden a directive, scope it as tightly as possible and flag it for review
  rather than reaching for a wildcard.

## Kickoff Prompt

```
Start the "CSP Nonce Sanity" loop.

Goal: The served pages run their JS under the nonce-based CSP with no violations
Max iterations: 5
Between iterations run: load / and a prerendered route, check the console for CSP violations and confirm hydration
Exit when: scripts execute (page hydrates, no blank/spinner-stuck page, zero CSP console errors)

Step 1: After changing csp.ts or index.html, confirm the header nonce matches the inline
script nonce, load the page, and check the console. Fix the nonce injection until JS runs.

Self-pace this loop. After each iteration, load the page, read the console, and only
continue if any CSP violation remains. Stop when clean or max iterations is reached. Give
a short status update each pass.
```

## Steps (Agent Actions)

1. **Match nonces** — confirm the CSP header `script-src 'nonce-…'` equals the inline `<script nonce="…">` value.
2. **Header-only** — verify no `<meta http-equiv="Content-Security-Policy">` crept in.
3. **Load + inspect** — open `/` and a prerendered route; confirm hydration and a clean console.
4. **Fix injection** — correct the nonce wiring; never reach for `'unsafe-inline'`.
