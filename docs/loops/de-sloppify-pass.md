# De-Sloppify Pass

**Category:** Cleanup / manual

## Loop Description

After implementation, run a cleanup pass over the diff: remove debug code, tighten
naming, delete dead branches, and make the new code read like the surrounding code. Loop
until a fresh read of the diff finds nothing left to clean and the build/lint stay green.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT change behavior during cleanup — this is a readability/quality pass, not a
  refactor of what the code does. If you find a real bug, note it separately.
- Do NOT delete tests or assertions to "clean up"; dead _test_ code is rare and usually
  load-bearing.
- Keep edits within the diff under review — do not wander into unrelated files.
- Cleanup must keep `lint` and the build green; a "tidy" that breaks the build is not
  done.

## Kickoff Prompt

```
Start the "De-Sloppify Pass" loop.

Goal: The diff is clean — no debug code, clear names, no dead branches, matches house style
Max iterations: 4
Between iterations run: re-read the diff (git diff origin/main) + npm run lint
Exit when: a fresh read finds nothing to clean AND lint passes

Step 1: Read the diff. Remove leftover console/debug code, tighten names, delete
unreachable branches, and match the surrounding style. Re-run lint.

Self-pace this loop. After each iteration, re-read the diff + lint, and only continue if
anything is still messy or lint is red. Stop when clean or max iterations is reached. Give
a short status update each pass.
```

## Steps (Agent Actions)

1. **Read the diff** — `git diff origin/main`.
2. **Remove cruft** — debug logs, commented-out code, unreachable branches, leftover TODOs.
3. **Tighten** — names, types, and structure to match the surrounding code.
4. **Lint** — `npm run lint`; confirm green, behavior unchanged.
