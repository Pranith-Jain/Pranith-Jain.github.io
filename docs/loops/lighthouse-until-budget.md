# Lighthouse Until Budget

**Category:** Performance / manual

## Loop Description

Measure Core Web Vitals and bundle budgets, and improve the page until both pass your
thresholds. This repo has a graveyard of _measured_ perf reverts (lazy-shell,
vendor-icons, lazy-Home) — changes that looked like wins but regressed Lighthouse — so
this loop is measure-first: every change is justified by a number, and regressions are
reverted, not rationalized.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT raise or remove the budgets in `scripts/check-budgets.mjs` to pass
  `check:budgets` — the budget IS the check.
- Do NOT apply a lazy-load / code-split / vendor-chunk change without measuring it; grep
  the perf-experiment notes first, because several of these were already tried and
  reverted for regressing CWV.
- Do NOT optimize one metric (e.g. bundle size) while silently regressing another (LCP,
  INP, CLS) — judge the page as a whole.
- If a change does not measurably help, revert it. "Feels faster" is not a number.

## Kickoff Prompt

```
Start the "Lighthouse Until Budget" loop.

Goal: Core Web Vitals and bundle budgets both meet their thresholds
Max iterations: 8
Between iterations run: npm run build:check  (build + scripts/check-budgets.mjs) and a Lighthouse / CWV measurement of the built page
Exit when: bundle budgets pass AND LCP/INP/CLS are within target with no metric regressed from baseline

Step 1: Take a baseline measurement. Make ONE scoped change, re-measure, and keep it only
if it improves the target metric without regressing the others. Revert anything that does
not measurably help.

Self-pace this loop. After each iteration, run the check + measurement, read the numbers,
and only continue if a threshold is unmet. Stop when both pass or max iterations is
reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Baseline** — `npm run build:check` for budgets + a Lighthouse/CWV run of the built page; record the numbers.
2. **Check prior art** — grep the documented perf experiments before any lazy/split/vendor change (many were reverted).
3. **One change, re-measure** — apply a single scoped change and re-run; keep only measured wins.
4. **Revert regressions** — drop anything that doesn't help or regresses another metric.
