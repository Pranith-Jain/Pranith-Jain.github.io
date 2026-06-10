# Feed Onboarding

**Category:** Integration / manual

## Loop Description

Onboard a new threat-intel content feed (advisories, disclosures, ransomware activity,
dark-web chatter) into the aggregation layer. Distinct from Add Provider (which is
per-IOC enrichment) — this is recurring content ingestion. Loop until the feed parses real
upstream items into the shared shape, dedupes, bounds its item count, and surfaces in the
aggregate without breaking the cron budget.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT assert success on a 200 — verify parsed items have real titles/dates/links, not
  an empty or partially-parsed shell.
- Do NOT let one feed's fetch run unbounded — cap items per feed and time-box the fetch;
  the aggregation runs under the cron subrequest budget.
- Do NOT block the aggregate on one slow/dead feed — degrade gracefully and record the
  failure (feeds rot like providers).
- Respect the existing serving model (e.g. some feeds are served from a GitHub raw data
  branch, not a live proxy) — don't reroute a feed's transport without reason.

## Kickoff Prompt

```
Start the "Feed Onboarding" loop.

Goal: The new feed parses real upstream items into the shared shape and surfaces in the aggregate, in budget
Max iterations: 8
Between iterations run: fetch the feed live + run the aggregate and inspect the new feed's item count + shape
Exit when: the feed yields real, deduped, count-bounded items in the aggregate and the cron stays within its subrequest budget

Step 1: Write the parser (fetch, parse to the shared item shape, dedupe, cap items),
register it in the aggregate, and verify against the live source. Confirm it degrades
gracefully on failure.

Self-pace this loop. After each iteration, fetch + aggregate + inspect, and only continue
while items are empty/malformed/unbounded or the budget is at risk. Stop when clean or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Parser** — fetch + parse upstream to the shared item shape; dedupe; cap items per feed; time-box.
2. **Register** — wire into the aggregate; respect the existing serving model.
3. **Verify live** — confirm real titles/dates/links (not status-ok-but-empty); graceful degradation on failure.
4. **Budget** — run the aggregate/cron path; confirm subrequest budget intact.
