# Audit Provider Coverage

**Category:** Auditing / manual

## Loop Description

Audit the CTI platform's intel coverage: for each IOC type (IP, domain, hash, URL, CVE,
actor) confirm which provider adapters are actually live and returning real data, and
where the gaps and silent failures are. Loop until every adapter has a verified live/empty
verdict and the coverage gaps are recorded — this is the standing defense against
silent provider rot.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT count an adapter as "covered" on HTTP 200 alone — a status-ok-but-empty response
  is a coverage GAP, not coverage.
- Do NOT silently drop a dead provider; record it (key revoked, endpoint moved, format
  changed) so the gap is visible.
- Do NOT fix-as-you-go in this loop beyond trivial cases — its job is to produce an
  honest coverage map; route real fixes through the Provider Verify Live / Add Provider
  loops.
- Cover EVERY IOC type, not just the easy ones — the audit is only as good as its weakest
  pivot.

## Kickoff Prompt

```
Start the "Audit Provider Coverage" loop.

Goal: An honest live/empty coverage map across every IOC type, with gaps recorded
Max iterations: 8
Between iterations run: exercise check_ioc / enrich across each IOC type and record per-provider populated-vs-empty
Exit when: every adapter has a verified verdict (live with real data, or recorded gap) for each relevant IOC type

Step 1: For each IOC type, run the enrichment path and record which providers returned
real, correctly-shaped data vs status-ok-but-empty vs error. Note the gaps.

Self-pace this loop. After each iteration, exercise the next IOC type / provider group and
record results, continuing until the map is complete. Stop when every adapter is accounted
for or max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Enumerate** — list adapters in `api/src/providers/` and the IOC types each should serve.
2. **Exercise live** — run enrichment per IOC type; capture populated-vs-empty-vs-error per provider.
3. **Record gaps** — mark status-ok-but-empty and dead adapters explicitly (cause if known).
4. **Hand off** — route real fixes to Provider Verify Live / Add Provider; output the coverage map.
