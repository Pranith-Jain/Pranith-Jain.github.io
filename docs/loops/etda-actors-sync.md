# ETDA Actors Sync

Manually re-fetch and rebuild the APT actor database from ETDA Threat Group Cards
and the APTmap relationship graph.

## When to run

- First time setting up the vertical
- After more than 7 days since last sync (check `lastSyncedAt` in
  `public/data/apt-actors/index.json`)
- Before deploying if the actor data is stale

## Steps

```bash
# 1. Fetch upstream data into staging
node scripts/sync-etda-actors.mjs

# 2. Build manifest into public/data/apt-actors/
node scripts/build-etda-actors.mjs

# 3. Verify the built index
node -e "
const idx = require('../public/data/apt-actors/index.json');
console.log('Actors:', idx.counts.actors, '(APT:', idx.counts.apt, ')');
console.log('With cards:', idx.counts.withCards);
console.log('With MITRE IDs:', idx.counts.withMitre);
console.log('With tools:', idx.counts.withTools);
console.log('Sectors:', idx.counts.totalSectors);
console.log('APTmap nodes:', idx.aptmap?.nodes);
"
```

## Verifying type checks

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p api/tsconfig.json
```

## Expected output

```
✔ Built:
    504 actors      (public/data/apt-actors/actors/)
      416 APT, 54 other, 34 unknown
      400 with detail cards, 2 HTML parse failures
    1 aptmap graph  (public/data/apt-actors/aptmap.json)
    1 slim index    (public/data/apt-actors/index.json)
```

## Footguns

- ETDA showcard pages fetch one at a time (5 concurrent, 200ms between
  batches). The sync fetches APT groups only (~416 cards) and takes 2-3
  minutes.
- ETDA server may be slow or unreachable from non-Thai IPs. The script
  handles individual card failures gracefully.
- The APTmap `apt_rel.json` is ~2.8 MB. It's copied verbatim into
  `aptmap.json` in the output tree. The MCP tool and REST route return
  it as-is for client-side rendering.
- Actor slugs are derived from the primary name via `slugify()`. If the
  upstream renames a group, the slug changes (orphaning the old file).
  This is acceptable for a weekly-synced cache; stale files accumulate
  only until the next build (which wipes and recreates the directory).
- The sector list in `etda_list_sectors` loads each actor body to extract
  sectors (since the index only carries `sectorCount`). For 504 actors
  this is ~504 `assets.fetch()` calls — acceptable cold but warmed by
  the LRU cache on subsequent calls.