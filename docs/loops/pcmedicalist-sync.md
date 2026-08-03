# PCMedicalist Sync

Kick off when **`public/data/pcmedicalist/`** needs rebuilding — either because the
daily cron ran, or because you manually synced from the upstream feed repo.

## Kickoff Prompt

```
/pcmedicalist-sync
```

## Goal

Regenerate `public/data/pcmedicalist/` from the upstream PCMedicalist Intelligence
Feed (github.com/PCMedicalist/pcmedicalist-intellegence-feed, CC BY 4.0): a slim
`index.json` + one per-day digest body (run summary + two social posts + top-10
items per intelligence layer). The full ~4.6 MB/day feed is NOT mirrored — the
`/api/v1/pcmedicalist/day/:date/search` deep-dive proxies it live with Cache-API +
KV last-good.

## Max Iterations

2 (sync + build is deterministic). After iteration 2 stop and report.

## Between-iteration Check

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json
```

If typecheck fails, fix and re-run. Never weaken the check.

## Exit Condition

- `public/data/pcmedicalist/index.json` reports `counts.digests >= 1`
- The latest `digests/<date>.json` has non-empty `postA`/`postB`, `layers.length >= 9`,
  and every layer has `count > 0` and `top.length > 0`
- Deep-dive smoke: `GET /api/v1/pcmedicalist/day/<latest>/search?cve=CVE-...` returns
  items (curl with an API key or same-origin)

## Steps

1. `node scripts/sync-pcmedicalist.mjs` — fetches index.json + new/changed day
   feeds (staging cache means only new days download the 4.6 MB feed).
2. `node scripts/build-pcmedicalist.mjs` — slices staged feeds into the slim manifest.
3. Verify the exit conditions above, then commit `public/data/pcmedicalist/` and
   deploy from the repo root.

## Guardrails

- Do NOT commit `pcmedicalist-staging/` (gitignored — 110 MB raw archive).
- Do NOT mirror full `feed.json` bodies into `public/data/` — that is the live
  deep-dive proxy's job; the mirror is intentionally slim.
- Do NOT bump `PCM_TOP_PER_LAYER` above ~20 without re-checking the bundle budget
  (each digest body grows ~6 KB per item row).
