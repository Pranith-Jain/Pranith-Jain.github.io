# Telegram MTProto sidecar — preview-dark channels (e.g. @breachdetect)

The preview firehose (`api/src/routes/telegram-feed.ts` CHANNELS) reads
`t.me/s/<handle>` web previews. Channels that disable previews (HTTP 302
to the join page, 0 messages — verified live for `breachdetect` on
2026-09-25 while siblings `CVEDetector`/`CyberMonitum` served 20/20) can
never join that list. The Bot API path only covers channels where the
operator bot is admin. This sidecar is the third path.

## How it works

A Telegram **user-client** (MTProto, GramJS) joins the public channel as
a regular subscriber — preview settings don't apply to subscribers —
syncs recent history, and writes it to KV in the exact
`tg:bot-posts:<chatId>` shape `fetchFromBotApiCache` already reads, plus
a `tg:bot-channel-map` handle→chatId entry. The feed renders the channel
as `[Bot] <handle>` with **zero API-code changes**. Chat IDs are written
Bot-API-style (`-100<channelId>`) so a later operator-bot admining
converges on the same keys instead of forking duplicates.

## One-time setup (local machine)

1. **App credentials** — https://my.telegram.org → API development tools
   → create an app → note `api_id` + `api_hash`. Use a **dedicated**
   account (datacenter logins on a personal number risk spam flags).
2. **Login** — `TG_API_ID=<id> TG_API_HASH=<hash> node scripts/tg-mtproto-login.mjs`
   → phone (+country code) → code → 2FA password. Prints `TG_SESSION=…`.
3. **Join the channel** — in any Telegram client, join `@breachdetect`
   (public: search → Join). The session inherits your memberships.
4. **GitHub secrets** (`Settings → Secrets → Actions`):
   `TG_API_ID`, `TG_API_HASH`, `TG_SESSION`, `CF_API_TOKEN` (KV write),
   `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID` (optional, defaults to KV_CACHE).
5. **Dry run** — `TG_API_ID=… TG_API_HASH=… TG_SESSION=… node
scripts/sync-telegram-mtproto.mjs --dry-run --channels=breachdetect`
   prints normalized posts without touching KV.

`TG_SESSION` is as sensitive as a password: secret storage only, never
logged (the scripts print message text in dry-run — review before
sharing logs).

## Operations

- Schedule: `.github/workflows/telegram-mtproto-sync.yml` every 6h
  (+ manual dispatch with dry-run input). Missing secrets → soft skip.
- To add a channel: extend `TG_CHANNELS` (comma-separated) in the
  workflow. Each must be public + joined by the session account.
- Merge semantics mirror the Bot path: dedupe by `message_id`, cap 50
  newest, 48h TTL. FloodWait sleeps are capped at 5 min, then abort.
- Verify: `GET /api/v1/admin/telegram/bot-status` → `breachdetect` in
  `cached_channels`; feed shows `[Bot] breachdetect` items.
