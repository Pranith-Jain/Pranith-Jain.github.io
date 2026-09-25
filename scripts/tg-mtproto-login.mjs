/**
 * Telegram MTProto login bootstrap (interactive, run once locally).
 *
 * The sync sidecar (scripts/sync-telegram-mtproto.mjs) authenticates with
 * a persisted session string so CI never handles phone codes or 2FA
 * passwords. This script performs the one-time interactive login and
 * prints the session string — store it as the `TG_SESSION` GitHub secret.
 *
 *   1. Create an app at https://my.telegram.org → API development tools
 *      → note `api_id` (number) and `api_hash` (hex). A DEDICATED
 *      Telegram account is strongly recommended (datacenter logins on a
 *      personal account risk spam flags; a session string is as sensitive
 *      as a password — GitHub secret, never committed, never logged).
 *   2. TG_API_ID=<id> TG_API_HASH=<hash> node scripts/tg-mtproto-login.mjs
 *   3. Enter phone (+country code), the login code Telegram sends, and
 *      the 2FA password if the account has one.
 *   4. Copy the printed `TG_SESSION=...` value into repo secrets.
 *
 * The session is printed to stdout ONLY. This script writes nothing to
 * disk and makes exactly one auth call sequence.
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import input from 'input';

const isMain = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    return resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

async function runLogin() {
  const apiId = Number(process.env.TG_API_ID ?? '');
  const apiHash = process.env.TG_API_HASH ?? '';
  if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
    console.error('Usage: TG_API_ID=<id> TG_API_HASH=<hash> node scripts/tg-mtproto-login.mjs');
    process.exit(2);
  }
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => input.text('Phone number (with +country code): '),
    password: async () => input.password('2FA password (blank if none): '),
    phoneCode: async () => input.text('Login code from Telegram: '),
    onError: (err) => console.error('login error:', err?.message ?? err),
  });

  const session = client.session.save();
  await client.disconnect();

  if (!session) {
    console.error('Login did not produce a session string — aborting.');
    process.exit(1);
  }

  console.log('\nLogin OK. Store this as the TG_SESSION secret (treat like a password):\n');
  console.log(`TG_SESSION=${session}`);
}

if (isMain) {
  await runLogin();
}
