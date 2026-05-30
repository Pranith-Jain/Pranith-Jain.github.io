#!/usr/bin/env bash
set -euo pipefail
# Seed Telegram leak-monitor channels into KV + D1.
# Usage: bash scripts/seed-channels.sh [--local]
#
# Reads scripts/seed-channels.json, merges with existing custom channels
# in KV, and inserts missing handles into the D1 watched_channels table.

WRANGLER="npx wrangler"
MODE="${1:---remote}"
FLAG=""
KV_FLAG=""
[[ "$MODE" == "--local" ]] && FLAG="--local" KV_FLAG="--local" || FLAG=""
KV_BINDING="KV_CACHE"
D1_DB="pranithjain-briefings"
KV_KEY="tg:custom-channels:v1"

echo "=== Seeding channels ($MODE) ==="

# 1. Read existing custom channels from KV
EXISTING_JSON="[]"
EXISTING=$($WRANGLER kv key get "$KV_KEY" --binding="$KV_BINDING" $KV_FLAG 2>/dev/null || true)
if [[ -n "$EXISTING" && "$EXISTING" != "null" ]]; then
  EXISTING_JSON="$EXISTING"
  echo "Read $(echo "$EXISTING_JSON" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length))") existing channels from KV"
else
  echo "No existing channels in KV, starting fresh"
fi

# 2. Read new channels from seed file
NEW_JSON=$(cat scripts/seed-channels.json)
SEED_COUNT=$(echo "$NEW_JSON" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length))")
echo "Seed file has $SEED_COUNT channels"

# 3. Merge: add new channels that aren't already in KV
MERGED=$(node -e "
const existing = JSON.parse(process.argv[1] || '[]');
const newChannels = JSON.parse(process.argv[2]);
const existingHandles = new Set(existing.map(c => c.handle.toLowerCase()));
const added = [];
for (const ch of newChannels) {
  if (!existingHandles.has(ch.handle.toLowerCase())) {
    existing.push({ handle: ch.handle, name: ch.name, added_at: new Date().toISOString() });
    existingHandles.add(ch.handle.toLowerCase());
    added.push(ch.handle);
  }
}
console.log(JSON.stringify(existing));
if (added.length) console.error('+ ' + added.join(', '));
else console.error('(no new channels to add)');
" "$EXISTING_JSON" "$NEW_JSON")

# 4. Write merged data back to KV
echo "Writing merged channels to KV..."
echo "$MERGED" | $WRANGLER kv key put "$KV_KEY" --binding="$KV_BINDING" $KV_FLAG --pipe

# 5. Bump the cache key so feed scraper picks up changes
$WRANGLER kv key put "tg:custom-channels:bump" "$(date +%s)" --binding="$KV_BINDING" $KV_FLAG

# 6. Insert into D1 watched_channels table
echo "Inserting into D1 telegram_watched_channels..."
node -e "
const newChannels = JSON.parse(process.argv[1]);
const existingRaw = process.argv[2];
const existingSet = new Set((existingRaw ? JSON.parse(existingRaw) : []).filter(c => c && c.handle).map(c => c.handle.toLowerCase()));
const dedup = new Set();
for (const ch of newChannels) {
  if (!existingSet.has(ch.handle.toLowerCase()) && !dedup.has(ch.handle.toLowerCase())) {
    dedup.add(ch.handle.toLowerCase());
    const sql = \`INSERT OR IGNORE INTO telegram_watched_channels (handle, title, category, added_by, added_at) VALUES ('\${ch.handle}', '\${ch.name.replace(/'/g, \"''\")}', '\${ch.category || 'auto-discovered'}', 'seed-script', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));\`;
    console.log(sql);
  }
}
" "$NEW_JSON" "$EXISTING_JSON" | while IFS= read -r sql; do
  $WRANGLER d1 execute "$D1_DB" --command="$sql" $FLAG 2>&1 | tail -1
done

echo "=== Seeding complete! ==="
echo "Bumped cache key — feed scraper will pick up new channels on next run."
