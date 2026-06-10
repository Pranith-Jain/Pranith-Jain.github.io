# Ship PR Until Green

**Category:** CI / manual

## Loop Description

Implement on a branch, test locally, push, open a PR, and loop until CI checks pass.
Generic flow — adapted to this repo's commit-on-a-branch / auto-merge workflow.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT modify the check command or exit criteria to force success.
- Do NOT skip, disable, or `.skip` checks to pass the exit condition.
- Commit on a feature branch and let the automation merge it; never force-push or rewrite
  `main`. Re-check the current branch before any git mutation.
- If stuck after several iterations, stop and report blockers instead of gaming the
  metric.

## Kickoff Prompt

```
Start the "Ship PR Until Green" loop.

Goal: PR is open with all CI checks passing
Max iterations: 10
Between iterations run: gh pr checks
Exit when: all PR checks are success

Step 1: Implement the change on a branch, test locally, push, open the PR, and fix CI
until green.

Self-pace this loop. After each iteration, run the check command, read the output, and
only continue if the exit condition is not met. Stop when all checks pass or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Implement + test** — scoped change on a branch; run the relevant local tests.
2. **Commit + push** — clear message; push the branch (never `main`).
3. **Open/update PR** — `gh pr create` / `gh pr view --json statusCheckRollup,url`.
4. **Fix CI** — read logs, fix locally, push, re-wait until checks pass.
