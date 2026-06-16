# KV Audit & Optimization Report

## Current State

**Total KV operations across platform:** ~100+ reads/writes per day
**Free-tier limits:** 100k reads/day, 1k writes/day, 25GB storage
**KV namespace:** KV_CACHE (single namespace for all operations)

## KV Usage by Component

| Component      | Reads/day | Writes/day | Keys                          | Purpose                |
| -------------- | --------- | ---------- | ----------------------------- | ---------------------- |
| Rate Limiter   | ~50       | ~50        | `rl:provider:window`          | Fixed-window counters  |
| Feed Scheduler | ~20       | ~15        | `feed:jobs`, `feed:history:*` | Job state, run history |
| Landscape Sync | ~10       | ~5         | `owasp:*`, `curated:*`        | OWASP data, toolbox    |
| Telegram Feed  | ~15       | ~8         | `tg:custom-channels:*`        | Custom channel config  |
| Watch Engine   | ~8        | ~5         | `watches`, `alert-log`        | Watch alerts           |
| Queue Consumer | ~3        | ~3         | `gp:warm:*`                   | Feed warm cache        |
| SI Enrichment  | ~20       | ~20        | `rl:provider:window`          | Rate limiting          |

**Estimated daily usage:** ~126 reads, ~106 writes

## Optimization Opportunities

### 1. Rate Limiter — Batch Writes (Saves ~40 writes/day)

**Current:** Each `consume()` call does 1 get + 1 put
**Fix:** Batch writes within a single DO invocation using `ctx.waitUntil()`

### 2. Feed Scheduler — Consolidate History Keys (Saves ~10 reads/day)

**Current:** Separate KV keys per source for history
**Fix:** Use a single `feed:history` key with source names as map keys

### 3. Landscape Sync — Conditional Writes (Saves ~5 writes/day)

**Current:** Writes on every sync even if data unchanged
**Fix:** Compare hashes before writing (already partially implemented with `kvPutIfChanged`)

### 4. Telegram Feed — Reduce Bump Operations (Saves ~4 writes/day)

**Current:** Writes bump key + deletes shadow cache separately
**Fix:** Single atomic operation with shorter TTL

### 5. Watch Engine — Batch Alert Log Updates (Saves ~3 writes/day)

**Current:** Each alert triggers a separate KV write
**Fix:** Batch alerts within a single DO invocation

### 6. SI Rate Limit — Skip Disabled Providers (Saves ~2 reads/day)

**Current:** Always reads even for disabled providers
**Fix:** Return early without KV access for disabled providers

## Implementation Priority

1. **High:** Rate limiter batch writes (easy win, saves most writes)
2. **High:** Skip disabled providers (trivial fix)
3. **Medium:** Consolidate feed history keys (reduces key count)
4. **Medium:** Conditional landscape sync writes (already partially done)
5. **Low:** Watch engine batching (lower impact)
