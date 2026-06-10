# Dependency Bump

**Category:** Maintenance / manual

## Loop Description

Update dependencies safely: bump, then prove nothing broke across all three TypeScript
projects, the build, and the tests — one logical group at a time so a regression is easy to
attribute. Loop until the target deps are current and everything is green.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT bump everything at once — group related deps so a failure points at a culprit.
- Do NOT pin around a vulnerability or pass tests by reverting the bump silently; if a dep
  can't be updated, record why.
- A green exit means typecheck + build + tests all pass — remember the api route tests
  (CI skips `test/routes/`; run locally, sandbox disabled) and the worker typecheck
  (`tsc -p api/tsconfig.worker.json`).
- Do NOT ignore a real `npm audit` finding by suppressing it; fix or explicitly accept it.

## Kickoff Prompt

```
Start the "Dependency Bump" loop.

Goal: Target dependencies are current with all checks green
Max iterations: 8
Between iterations run: npm run lint && the 3 tsc projects && npm run test:run && (api) vitest && npm audit
Exit when: deps updated, all typechecks/build/tests pass, and audit findings are resolved or accepted

Step 1: Bump one logical group, reinstall, and run lint + all three typechecks + tests +
audit. Fix breakage at the source, then move to the next group.

Self-pace this loop. After each iteration, run the checks, read the output, and only
continue while anything is red or deps remain. Stop when current-and-green or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Bump a group** — one related set of deps; reinstall.
2. **Typecheck all three** — root, api, and `api/tsconfig.worker.json`.
3. **Build + test** — `npm run build:check`, root tests, and the api route tests locally (sandbox disabled).
4. **Audit** — `npm audit`; fix or explicitly accept findings; repeat per group.
