/**
 * Telegram MTProto sidecar sync — preview-dark channels → KV bot-posts.
 *
 * Problem: channels like `breachdetect` (27k subs, same crew as
 * CyberMonitum) disable web previews, so `t.me/s/<handle>` serves 0
 * messages and the preview-based firehose (api/src/routes/telegram-feed.ts
 * CHANNELS) cannot ingest them — see the audit note there. Bot API
 * getUpdates only covers channels where the operator bot is admin.
 *
 * This script is the third path: a user-client (MTProto) session joins
 * the PUBLIC channel as a regular subscriber — preview settings don't
 * apply to subscribers — syncs recent history, and writes it to KV in
 * the EXACT `tg:bot-posts:<chatId>` shape `fetchFromBotApiCache` reads,
 * plus a `tg:bot-channel-map` handle→chatId entry. The feed then renders
 * the channel as `[Bot] <handle>` with zero API-code changes.
 *
 * Interop: chat IDs are written Bot-API-style (`-100<channelId>`) so a
 * later operator-bot admining converges on the same KV keys instead of
 * forking a duplicate entry.
 *
 *   TG_API_ID, TG_API_HASH, TG_SESSION  — MTProto creds (see
 *       scripts/tg-mtproto-login.mjs for the one-time bootstrap)
 *   TG_CHANNELS=breachdetect            — comma-separated handles
 *   TG_HISTORY_LIMIT=40                 — posts per channel (max 100)
 *   CF_API_TOKEN, CF_ACCOUNT_ID         — Cloudflare KV writer
 *   CF_KV_NAMESPACE_ID                  — defaults to KV_CACHE
 *   node scripts/sync-telegram-mtproto.mjs [--dry-run]
 *       [--channels=a,b] [--limit=N]
 *
 * Safety: dedicated account recommended; StringSession reuse avoids
 * re-login spam flags; FloodWait sleeps are capped (then abort);
 * `--dry-run` prints the normalized payload without any KV writes.
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const DEFAULT_CHANNELS = ['breachdetect'];
const DEFAULT_HISTORY_LIMIT = 40;
const MAX_HISTORY_LIMIT = 100;
const MERGE_CAP = 50; // matches telegram-feed.ts slice(-50)
const POSTS_TTL_SECONDS = 172_800; // matches telegram-feed.ts expirationTtl
const CHANNEL_MAP_KEY = 'tg:bot-channel-map';
const DEFAULT_KV_NAMESPACE_ID = '5125e769e49f4a1586f81d1935f9856a'; // KV_CACHE (wrangler.jsonc)
const MAX_FLOOD_SLEEP_SECONDS = 300;
const KV_TIMEOUT_MS = 15_000;

/**
 * Bot-API-style chat id for a bare MTProto channel id, so MTProto-synced
 * and Bot-API-synced writers converge on one KV key. Pure.
 */
export function botApiChatId(channelId) {
  const digits = String(channelId).replace(/^-/, '');
  if (!/^\d{1,15}$/.test(digits)) throw new Error(`bad channel id: ${channelId}`);
  return Number(`-100${digits}`);
}

/** Permalink in the exact form fetchFromBotApiCache builds. Pure. */
export function permalinkFor(handle, messageId) {
  return `https://t.me/${handle}/${messageId}`;
}

/**
 * Normalize one GramJS message to the Bot-API channel_post SUBSET that
 * fetchFromBotApiCache reads ({message_id, chat, date, text/caption}).
 * Returns null for textless service messages (they add noise and drag
 * the channel quality scorer). Pure.
 */
export function normalizeMtprotoMessage(handle, chatId, title, msg) {
  const id = Number(msg?.id);
  const date = Number(msg?.date);
  const text = String(msg?.message ?? '').trim();
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!Number.isFinite(date) || date <= 0) return null;
  if (!text) return null;
  return {
    message_id: id,
    chat: { id: chatId, username: handle, title, type: 'channel' },
    date,
    text: text.slice(0, 800),
  };
}

/**
 * Merge fresh posts into the cached array: dedupe by message_id (fresh
 * wins), ascending order, cap to MERGE_CAP newest. Pure.
 */
export function mergeBotPosts(existing, fresh, cap = MERGE_CAP) {
  const byId = new Map();
  for (const p of [...(existing ?? []), ...(fresh ?? [])]) {
    if (p && Number.isFinite(Number(p.message_id))) byId.set(Number(p.message_id), p);
  }
  return [...byId.values()].sort((a, b) => a.message_id - b.message_id).slice(-cap);
}

function kvUrl(accountId, namespaceId, key) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
}

async function kvGetJson(accountId, namespaceId, token, key) {
  const r = await fetch(kvUrl(accountId, namespaceId, key), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(KV_TIMEOUT_MS),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`KV GET ${key}: HTTP ${r.status}`);
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function kvPutJson(accountId, namespaceId, token, key, value, ttlSeconds) {
  const url = kvUrl(accountId, namespaceId, key) + (ttlSeconds ? `?expiration_ttl=${ttlSeconds}` : '');
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(KV_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`KV PUT ${key}: HTTP ${r.status}`);
  const body = await r.json().catch(() => ({}));
  if (body.success === false) throw new Error(`KV PUT ${key} rejected: ${JSON.stringify(body.errors ?? []).slice(0, 200)}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function floodSeconds(err) {
  if (!err || typeof err !== 'object') return 0;
  if (typeof err.seconds === 'number' && err.seconds > 0) return err.seconds;
  const m = /FLOOD_WAIT_(\d+)/.exec(String(err.errorMessage ?? err.message ?? ''));
  return m ? Number(m[1]) : 0;
}

function parseArgs(argv) {
  const out = { dryRun: false, channels: null, limit: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--channels=')) out.channels = a.slice(11).split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
    else if (a.startsWith('--limit=')) out.limit = Math.min(MAX_HISTORY_LIMIT, Math.max(1, parseInt(a.slice(8), 10) || DEFAULT_HISTORY_LIMIT));
  }
  return out;
}

async function syncChannel(client, handle, limit) {
  const entity = await client.getEntity(handle).catch((err) => {
    throw new Error(`resolve @${handle}: ${err?.message ?? err}`);
  });
  const channelId = entity?.id != null ? String(entity.id) : '';
  if (!/^\d+$/.test(channelId)) throw new Error(`resolve @${handle}: no numeric channel id (private or missing?)`);
  const title = String(entity.title ?? handle);
  const chatId = botApiChatId(channelId);

  let messages;
  try {
    messages = await client.getMessages(entity, { limit });
  } catch (err) {
    const wait = floodSeconds(err);
    if (wait > 0 && wait <= MAX_FLOOD_SLEEP_SECONDS) {
      await sleep(wait * 1000 + 1000);
      messages = await client.getMessages(entity, { limit });
    } else {
      throw new Error(`history @${handle}: ${err?.message ?? err}`);
    }
  }
  const posts = (messages ?? []).map((m) => normalizeMtprotoMessage(handle, chatId, title, m)).filter(Boolean);
  return { handle, title, chatId, posts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const channels = args.channels ?? (process.env.TG_CHANNELS ?? '').split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
  const list = (channels.length ? channels : DEFAULT_CHANNELS).slice(0, 20);
  const limit = args.limit ?? Math.min(MAX_HISTORY_LIMIT, Math.max(1, parseInt(process.env.TG_HISTORY_LIMIT ?? '', 10) || DEFAULT_HISTORY_LIMIT));

  const apiId = Number(process.env.TG_API_ID ?? '');
  const apiHash = process.env.TG_API_HASH ?? '';
  const session = process.env.TG_SESSION ?? '';
  if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash || !session) {
    console.error('Missing TG_API_ID / TG_API_HASH / TG_SESSION (bootstrap: node scripts/tg-mtproto-login.mjs).');
    process.exit(1);
  }

  const dryRun = args.dryRun || process.env.DRY_RUN === '1';
  const cfToken = process.env.CF_API_TOKEN ?? '';
  const cfAccount = process.env.CF_ACCOUNT_ID ?? '';
  const cfNamespace = process.env.CF_KV_NAMESPACE_ID || DEFAULT_KV_NAMESPACE_ID;
  if (!dryRun && (!cfToken || !cfAccount)) {
    console.error('Missing CF_API_TOKEN / CF_ACCOUNT_ID (or pass --dry-run).');
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  await client.connect().catch((err) => {
    console.error(`MTProto connect failed: ${err?.message ?? err}`);
    process.exit(1);
  });

  const summary = { dryRun, channels: [], failures: [] };
  try {
    for (const handle of list) {
      try {
        const { title, chatId, posts } = await syncChannel(client, handle, limit);
        let merged = posts;
        let mapUpdated = false;
        if (!dryRun) {
          const existing = await kvGetJson(cfAccount, cfNamespace, cfToken, `tg:bot-posts:${chatId}`);
          merged = mergeBotPosts(Array.isArray(existing) ? existing : [], posts);
          await kvPutJson(cfAccount, cfNamespace, cfToken, `tg:bot-posts:${chatId}`, merged, POSTS_TTL_SECONDS);
          const map = (await kvGetJson(cfAccount, cfNamespace, cfToken, CHANNEL_MAP_KEY)) ?? {};
          if (map[handle.toLowerCase()] !== chatId) {
            map[handle.toLowerCase()] = chatId;
            await kvPutJson(cfAccount, cfNamespace, cfToken, CHANNEL_MAP_KEY, map);
            mapUpdated = true;
          }
        }
        summary.channels.push({ handle, title, chatId, fetched: posts.length, stored: merged.length, mapUpdated });
        if (dryRun) summary.channels[summary.channels.length - 1].sample = posts.slice(0, 2);
      } catch (err) {
        summary.failures.push({ handle, error: err instanceof Error ? err.message : String(err) });
      }
      await sleep(1500); // pacing between channels — cheap FloodWait insurance
    }
  } finally {
    await client.disconnect().catch(() => {});
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.failures.length ? 2 : 0);
}

// Exported for unit tests (node:test). Side-effectful main() runs only as CLI.
export const __test__ = { parseArgs, kvUrl };
const isMain = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    return resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) {
  await main();
}
