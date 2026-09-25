/**
 * Tests for scripts/sync-telegram-mtproto.mjs pure functions.
 *
 * No network, no Telegram session, no KV — covers the Bot-API-shape
 * normalization contract that api/src/routes/telegram-feed.ts
 * fetchFromBotApiCache reads (permalink form, date units, merge
 * semantics, chat-id interop).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  botApiChatId,
  permalinkFor,
  normalizeMtprotoMessage,
  mergeBotPosts,
  __test__,
} from './sync-telegram-mtproto.mjs';

test('botApiChatId maps bare channel ids to Bot-API-style chat ids', () => {
  assert.equal(botApiChatId('1234567890'), -1001234567890);
  assert.equal(botApiChatId(123), -100123);
  assert.throws(() => botApiChatId('abc'), /bad channel id/);
  assert.throws(() => botApiChatId(''), /bad channel id/);
});

test('permalinkFor matches the Bot-path permalink form', () => {
  assert.equal(permalinkFor('breachdetect', 4242), 'https://t.me/breachdetect/4242');
});

test('normalizeMtprotoMessage keeps text posts, drops textless ones', () => {
  const good = normalizeMtprotoMessage('breachdetect', -100123, 'BreachDetect', {
    id: 4242,
    date: 1758787200,
    message: '  New breach dump posted  ',
  });
  assert.deepEqual(good, {
    message_id: 4242,
    chat: { id: -100123, username: 'breachdetect', title: 'BreachDetect', type: 'channel' },
    date: 1758787200,
    text: 'New breach dump posted',
  });

  assert.equal(normalizeMtprotoMessage('x', -1, 'X', { id: 1, date: 2, message: '   ' }), null);
  assert.equal(normalizeMtprotoMessage('x', -1, 'X', { id: 1, date: 2 }), null);
  assert.equal(normalizeMtprotoMessage('x', -1, 'X', { id: 0, date: 2, message: 'hi' }), null);
  assert.equal(normalizeMtprotoMessage('x', -1, 'X', { id: 1, date: 0, message: 'hi' }), null);
});

test('normalizeMtprotoMessage truncates long text like the Bot path', () => {
  const out = normalizeMtprotoMessage('x', -1, 'X', { id: 1, date: 2, message: 'a'.repeat(5000) });
  assert.equal(out.text.length, 800);
});

test('mergeBotPosts dedupes by message_id, sorts ascending, caps newest', () => {
  const a = { message_id: 1, text: 'old' };
  const b = { message_id: 2, text: 'mid' };
  const b2 = { message_id: 2, text: 'mid-fresh' };
  const c = { message_id: 3, text: 'new' };
  const merged = mergeBotPosts([a, b], [b2, c]);
  assert.deepEqual(
    merged.map((p) => p.message_id),
    [1, 2, 3]
  );
  assert.equal(
    merged.find((p) => p.message_id === 2).text,
    'mid-fresh'
  );
  assert.deepEqual(
    mergeBotPosts([{ message_id: 1 }, { message_id: 2 }, { message_id: 3 }], [], 2).map((p) => p.message_id),
    [2, 3]
  );
  assert.deepEqual(mergeBotPosts(null, undefined), []);
});

test('parseArgs handles cli flags', () => {
  assert.deepEqual(__test__.parseArgs(['--dry-run']), { dryRun: true, channels: null, limit: null });
  assert.deepEqual(__test__.parseArgs(['--channels=a,b', '--limit=10']), {
    dryRun: false,
    channels: ['a', 'b'],
    limit: 10,
  });
  assert.equal(__test__.parseArgs(['--limit=9999']).limit, 100);
});

test('kvUrl builds the Cloudflare KV REST path', () => {
  assert.equal(
    __test__.kvUrl('acct', 'ns', 'tg:bot-posts:-1001'),
    'https://api.cloudflare.com/client/v4/accounts/acct/storage/kv/namespaces/ns/values/tg%3Abot-posts%3A-1001'
  );
});
