# Add Provider

**Category:** Integration / manual

## Loop Description

Add a new threat-intel provider adapter (`api/src/providers/`) and wire it into the IOC
enrichment fan-out, verified against the LIVE upstream. A provider is not done until it
returns real, correctly-shaped data, is reachable through `check_ioc`, and stays within
the subrequest budget — loop until all three hold.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT assert success from HTTP status alone — a 200 with an empty body is a FAILURE.
  Verify the parsed fields against the real upstream format (adapters silently rot).
- Do NOT add per-provider cache reads/writes inside the fan-out — it must use the shared
  batched KV (`primeBatch` / `flushBatch`); the Free-plan cap is 50 subrequests
  (KV + Cache-API both count).
- Do NOT hardcode a key/secret; declare it as an optional binding and degrade gracefully
  when absent.
- Return a typed provider error on upstream failure; one provider must not sink the whole
  fan-out.

## Kickoff Prompt

```
Start the "Add Provider" loop.

Goal: The new provider returns real upstream data through check_ioc within the subrequest budget
Max iterations: 8
Between iterations run: call the adapter against live upstream + run a check_ioc fan-out and count subrequests
Exit when: the adapter yields populated, correctly-typed fields, surfaces in check_ioc, and the fan-out stays < 50 subrequests

Step 1: Write the adapter (auth, request, parse to the shared shape), register it in the
provider index + check_ioc fan-out, and add it to the batched KV path. Verify against live
upstream and count subrequests.

Self-pace this loop. After each iteration, call live + count, and only continue if the
data is empty/malformed or the budget is blown. Stop when correct-and-in-budget or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Adapter** — auth + request + parse to the shared provider shape (`api/src/providers/`); optional key binding.
2. **Wire in** — register in the provider index and the `check_ioc` fan-out; use the shared batched KV (no per-provider cache ops).
3. **Verify live** — call against the real upstream; confirm populated, correctly-typed fields (not status-ok-but-empty).
4. **Budget** — run a fan-out, count subrequests (KV + Cache-API), confirm < 50.
