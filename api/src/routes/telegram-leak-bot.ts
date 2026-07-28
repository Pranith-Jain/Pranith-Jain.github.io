import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin, safeEqual } from '../lib/admin-auth';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string; username?: string };
    text?: string;
    document?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    caption?: string;
    date: number;
  };
  my_chat_member?: {
    chat: { id: number; type: string; title?: string; username?: string };
    new_chat_member: { status: string };
  };
}

interface TelegramFile {
  file_id: string;
  file_size?: number;
  file_path?: string;
}

const LEAK_FILE_MIMES = [
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/x-jsonlines',
  'application/octet-stream',
];

const LEAK_FILE_EXTS = ['.txt', '.csv', '.json', '.jsonl', '.tsv', '.log', '.sql', '.xlsx', '.zip'];

const BOT_COMMANDS = [
  { command: 'start', description: 'Show bot info' },
  { command: 'status', description: 'Show monitoring stats' },
  { command: 'stats', description: 'Show leak monitoring statistics' },
];

async function getFile(token: string, fileId: string): Promise<TelegramFile | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; result?: TelegramFile };
    return data.result ?? null;
  } catch (_catchErr) {
    console.error('getFile failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

async function downloadFile(token: string, filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_catchErr) {
    console.error('downloadFile failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

function isLikelyLeakFile(fileName: string | undefined, mimeType: string | undefined): boolean {
  if (!fileName) return false;
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (LEAK_FILE_EXTS.includes(ext)) return true;
  if (mimeType && LEAK_FILE_MIMES.includes(mimeType)) return true;
  return false;
}

function parseCredentialLine(line: string): { email: string; password: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(':');
  const tabIdx = trimmed.indexOf('\t');
  const sepIdx = colonIdx > -1 ? colonIdx : tabIdx > -1 ? tabIdx : -1;
  if (sepIdx < 1 || sepIdx >= trimmed.length - 1) return null;

  const email = trimmed.slice(0, sepIdx).trim();
  if (!email.includes('@')) return null;
  const password = trimmed.slice(sepIdx + 1).trim();
  if (!password) return null;

  return { email, password };
}

function parseLeakContent(text: string): { entries: { email: string; password: string }[]; domains: string[] } {
  const lines = text.split('\n');
  const entries: { email: string; password: string }[] = [];
  const domains: Set<string> = new Set();
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseCredentialLine(line);
    if (parsed) {
      const key = `${parsed.email}:${parsed.password}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(parsed);
        const domain = parsed.email.split('@')[1];
        if (domain) domains.add(domain.toLowerCase());
      }
    }
  }

  return { entries, domains: Array.from(domains) };
}

async function setBotCommands(token: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (_catchErr) {
    console.error('setBotCommands failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* non-critical */
  }
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (_catchErr) {
    console.error('sendMessage failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }
}

async function processLeakFile(
  token: string,
  msg: NonNullable<TelegramUpdate['message']>,
  db: D1Database | undefined
): Promise<void> {
  const doc = msg.document;
  if (!doc) return;

  const chatName = msg.chat.title || msg.chat.username || String(msg.chat.id);

  if (!isLikelyLeakFile(doc.file_name, doc.mime_type)) return;

  const fileInfo = await getFile(token, doc.file_id);
  if (!fileInfo?.file_path) return;

  const content = await downloadFile(token, fileInfo.file_path);
  if (!content || content.length < 10) return;

  const { entries, domains } = parseLeakContent(content);
  if (entries.length === 0) return;

  // Store ONE entry per file — not per credential. The credential_count
  // field captures how many were found, avoiding flooding the DB.
  //
  // SECURITY: We NEVER store raw credentials (email:password) or the
  // raw file content. Only metadata (domains, counts, file name) is
  // persisted. This minimises PII liability while preserving the
  // intelligence value (which domains are affected, how many creds,
  // severity assessment).
  if (db) {
    const now = new Date()
      .toISOString()
      .replace('T', 'T')
      .replace(/\.\d+Z/, 'Z');
    const messageLink = `https://t.me/${chatName}/${msg.message_id}`;
    // Strip any credential-like patterns from the caption/message text
    // before storage. Keep only the first 500 chars of the caption (not
    // the file content) for context.
    const safeCaption = (msg.caption || '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+:[^\s]{1,100}/g, '[REDACTED]')
      .replace(/[a-zA-Z0-9._%+-]+\t[^\s]{1,100}/g, '[REDACTED]')
      .slice(0, 500);
    await db
      .prepare(
        `INSERT OR IGNORE INTO telegram_leak_entries
        (channel_handle, message_link, message_text, leak_type, credential_count, domains_found, severity, file_name, discovered_at)
       VALUES (?, ?, ?, 'credential', ?, ?, 'high', ?, ?)`
      )
      .bind(
        chatName,
        messageLink,
        safeCaption || `${entries.length} credentials from ${domains.length} domains`,
        entries.length,
        JSON.stringify(domains),
        doc.file_name || 'unknown',
        now
      )
      .run();
  }

  const summary = `📄 <b>Leak file detected</b>\n<b>Chat:</b> ${chatName}\n<b>File:</b> ${doc.file_name || 'unknown'}\n<b>Credentials found:</b> ${entries.length}\n<b>Domains affected:</b> ${domains.length > 0 ? domains.slice(0, 5).join(', ') + (domains.length > 5 ? ` +${domains.length - 5} more` : '') : 'unknown'}`;
  await sendMessage(token, msg.chat.id, summary);
}

export async function telegramLeakBotWebhookHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ error: 'bot not configured' }, 503);

  // Validate Telegram webhook secret_token. When registering the webhook
  // via `setWebhook`, we pass `secret_token=<TELEGRAM_WEBHOOK_SECRET>`.
  // Telegram sends it back as `X-Telegram-Bot-Api-Secret-Token` on every
  // update. This is the ONLY authentication on this path (it is exempt from
  // the API-key middleware), so we FAIL CLOSED: if the secret is not
  // configured, refuse to process updates rather than accepting forged ones.
  const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ error: 'webhook secret not configured' }, 503, { 'Cache-Control': 'no-store' });
  }
  const provided = c.req.header('x-telegram-bot-api-secret-token') ?? '';
  if (!safeEqual(provided, webhookSecret)) {
    return c.json({ error: 'forbidden' }, 403, { 'Cache-Control': 'no-store' });
  }

  // Parse defensively: a malformed body must not surface as a 500 (which
  // would make Telegram retry the bad update indefinitely). This runs after
  // the secret-token gate, so only Telegram-authenticated callers reach it.
  let update: TelegramUpdate;
  try {
    update = (await c.req.json()) as TelegramUpdate;
  } catch (_catchErr) {
    console.error(
      'telegramLeakBotWebhookHandler failed:',
      _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
    );
    return c.json({ error: 'invalid JSON' }, 400, { 'Cache-Control': 'no-store' });
  }

  // Handle chat join immediately (fast path).
  if (update.my_chat_member) {
    const chat = update.my_chat_member.chat;
    const status = update.my_chat_member.new_chat_member.status;
    if (status === 'member' || status === 'administrator') {
      c.executionCtx.waitUntil(
        sendMessage(
          token,
          chat.id,
          `🤖 Added to <b>${chat.title || chat.username || chat.id}</b>\nI will monitor this chat for leak files (.txt, .csv, .json) and credential patterns.\n\nSend /status to see monitoring stats.`
        )
      );
    }
    return c.json({ ok: true });
  }

  const msg = update.message;
  if (!msg) return c.json({ ok: true });

  // Commands — respond immediately, handle async.
  if (msg.text === '/start') {
    c.executionCtx.waitUntil(
      sendMessage(
        token,
        msg.chat.id,
        '<b>🔍 Telegram Leak Monitor Bot</b>\n\n' +
          'Monitors chats for leaked credential files and credential patterns.\n\n' +
          '<b>Commands:</b>\n' +
          '/status — show monitoring stats\n' +
          '/stats — show leak statistics\n\n' +
          '<b>How it works:</b>\n' +
          '• Add me to any channel or group\n' +
          '• I will scan messages for .txt/.csv/.json files\n' +
          '• Credential patterns (email:password) are extracted and stored\n' +
          '• Data is indexed for search in the DFIR toolkit'
      )
    );
    return c.json({ ok: true });
  }

  if (msg.text === '/status' || msg.text === '/stats') {
    const db = c.env.BRIEFINGS_DB;
    c.executionCtx.waitUntil(
      (async () => {
        let statsText = '<b>📊 Monitoring Statistics</b>\n\n';
        if (db) {
          try {
            const leakCount = await db
              .prepare('SELECT COUNT(*) as n FROM telegram_leak_entries')
              .first<{ n: number }>();
            const channelCount = await db
              .prepare('SELECT COUNT(*) as n FROM telegram_watched_channels WHERE active = 1')
              .first<{ n: number }>();
            const discCount = await db
              .prepare('SELECT COUNT(*) as n FROM telegram_discovered_channels WHERE reviewed = 0')
              .first<{ n: number }>();
            statsText += `📝 Leak entries indexed: <b>${leakCount?.n ?? 0}</b>\n`;
            statsText += `📡 Active channels: <b>${channelCount?.n ?? 0}</b>\n`;
            statsText += `🔍 Unreviewed discovered channels: <b>${discCount?.n ?? 0}</b>\n`;
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            statsText += 'Database unavailable\n';
          }
        } else {
          statsText += 'Database not configured\n';
        }
        await sendMessage(token, msg.chat.id, statsText);
      })()
    );
    return c.json({ ok: true });
  }

  // File processing — respond 200 immediately, process in background.
  if (msg.document) {
    c.executionCtx.waitUntil(processLeakFile(token, msg, c.env.BRIEFINGS_DB));
  }

  return c.json({ ok: true });
}

export async function telegramLeakBotWebhookStatusHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ ok: false, error: 'bot not configured' }, 503);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return c.json(data);
  } catch (e) {
    console.error('telegramLeakBotWebhookStatusHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, 502, {
      'Cache-Control': 'no-store',
    });
  }
}

export async function telegramLeakBotRegisterHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = c.req.query('url');
  if (!token) return c.json({ error: 'bot not configured' }, 503);
  if (!webhookUrl) return c.json({ error: 'url query param required' }, 400);

  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  try {
    const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET;
    const setWebhookUrl = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
    setWebhookUrl.searchParams.set('url', webhookUrl);
    setWebhookUrl.searchParams.set('max_connections', '30');
    if (webhookSecret) {
      setWebhookUrl.searchParams.set('secret_token', webhookSecret);
    }
    const setRes = await fetch(setWebhookUrl.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    const data = (await setRes.json()) as { ok: boolean; description?: string };
    if (data.ok) {
      await setBotCommands(token);
    }
    return c.json(data);
  } catch (e) {
    console.error('telegramLeakBotRegisterHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : 'failed' }, 502, { 'Cache-Control': 'no-store' });
  }
}
