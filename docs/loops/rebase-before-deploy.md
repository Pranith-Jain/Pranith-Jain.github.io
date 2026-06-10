# Rebase Before Deploy

**Category:** Deploy / manual

## Loop Description

Right before deploying, bring the working branch up to date with `origin/main`. Feature
branches here get auto-fast-forward-merged into `main` and pushed mid-session, so `main`
moves fast — deploying a stale branch ships an outdated tree. Loop until the branch is
on top of the latest `origin/main` and still builds clean.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT force-push, `branch -f main`, or rewrite `main` to resolve drift — commit on the
  branch and let the automation fast-forward it.
- Do NOT deploy from a stale tree to skip the rebase; the whole point is freshness at
  deploy time.
- Re-check the current branch before any git mutation — HEAD can switch to `main`
  mid-session via the auto-merge.
- After rebasing, re-run the build before deploying; a clean rebase can still produce a
  broken tree if `main` changed shared code.

## Kickoff Prompt

```
Start the "Rebase Before Deploy" loop.

Goal: The deploy happens from a tree on top of the latest origin/main that still builds
Max iterations: 4
Between iterations run: git fetch origin && git rev-list --count HEAD..origin/main  (then npm run build:check)
Exit when: HEAD..origin/main count is 0 AND build:check passes

Step 1: Fetch origin. If origin/main is ahead, rebase the branch onto it (never
force-push main). Re-run the build. Repeat until the branch is current and builds clean,
then deploy.

Self-pace this loop. After each iteration, fetch + count + build, and only continue if the
branch is behind or the build is red. Stop when current and green or max iterations is
reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Re-check branch** — confirm you are on the feature branch, not `main` (auto-merge can switch HEAD).
2. **Fetch + measure drift** — `git fetch origin`; `git rev-list --count HEAD..origin/main`.
3. **Rebase if behind** — rebase the branch onto `origin/main`; never force-push or rewrite `main`.
4. **Rebuild + deploy** — `npm run build:check`; deploy only once current and green.
