# IOC Subrequest Budget

**Category:** Performance / manual

## Loop Description

After changing the IOC enrichment fan-out, verify a single invocation stays under the
Free-plan limit of 50 subrequests. The fan-out must use ONE batched KV read + ONE batched
KV write (`primeBatch` / `flushBatch`) — KV and Cache-API operations BOTH count toward the
cap. Loop until the traced subrequest count is provably under budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT add per-provider cache reads/writes inside the fan-out — that is exactly what
  blows the budget. One batched prime + one batched flush, period.
- Do NOT raise the assumed 50-subrequest ceiling to make the count "pass" — it is the
  platform limit on the Free plan, not a tunable.
- Do NOT count only KV and ignore Cache-API (or vice versa) — both count.
- If genuine coverage needs more than 50 subrequests, split the work across invocations;
  do not silently drop providers without logging what was skipped.

## Kickoff Prompt

```
Start the "IOC Subrequest Budget" loop.

Goal: One IOC fan-out invocation stays under 50 subrequests with batched KV
Max iterations: 6
Between iterations run: a trace/count of subrequests (KV + Cache-API) for one fan-out invocation
Exit when: subrequest count < 50 AND the fan-out uses exactly one primeBatch + one flushBatch

Step 1: Trace one IOC fan-out invocation. Count every subrequest (KV reads/writes and
Cache-API ops both count). If over budget or doing per-provider cache ops, refactor to a
single batched read + single batched write.

Self-pace this loop. After each iteration, run the count, read it, and only continue if
over budget. Stop when within budget or max iterations is reached. Give a short status
update each pass.
```

## Steps (Agent Actions)

1. **Trace one invocation** — instrument the fan-out path and count subrequests.
2. **Classify** — KV reads/writes + Cache-API ops both count; sum them.
3. **Batch** — collapse to one `primeBatch` read + one `flushBatch` write; remove per-provider cache ops.
4. **Re-count** — confirm < 50; if coverage forces more, split across invocations and log what was deferred.
