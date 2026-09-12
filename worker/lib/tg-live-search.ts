/**
 * Stateless Telegram live keyword search (worker-side core).
 *
 * Fetches t.me/s/<handle> previews, matches keyword tokens in memory, and
 * returns hits WITHOUT writing to KV or D1. Used by the `tg_live_search`
 * MCP tool; the HTTP route (`GET /api/v1/tg-live-search` in
 * api/src/routes/telegram-feed.ts) has its own fuller implementation with
 * edge-cache read-through — this module is the dependency-free core for
 * contexts without Cache API access.
 *
 * Budget: sequential fetches (Telegram throttles bursty fan-out), caller
 * caps the channel list (recommended ≤8).
 */

export interface TgLiveHit {
  channel_handle: string;
  permalink: string;
  datetime: string;
  views?: string;
  snippet: string;
  matched: string[];
}

export interface TgLiveChannelStatus {
  handle: string;
  ok: boolean;
  messages: number;
  note?: string;
}

export interface TgLiveSearchResult {
  generated_at: string;
  query: string[];
  channels: TgLiveChannelStatus[];
  count: number;
  hits: TgLiveHit[];
}

const HANDLE_RE = /^[A-Za-z0-9_]{3,64}$/;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 50;

const UA = 'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io)';

interface ParsedMsg {
  permalink: string;
  datetime: string;
  views?: string;
  text: string;
}

/** Minimal t.me/s preview parse — same selectors as the route parser. */
export function parsePreviewMessages(html: string): ParsedMsg[] {
  const marked = html.replace(/<div class="tgme_widget_message_wrap/g, '\u0001<div class="tgme_widget_message_wrap');
  const blocks = marked.split('').slice(1);
  const out: ParsedMsg[] = [];
  for (const block of blocks) {
    const permalink = /<a class="tgme_widget_message_date"[^>]*href="([^"]+)"/.exec(block)?.[1];
    const datetime = /datetime="([^"]+)"/.exec(block)?.[1];
    if (!permalink || !datetime) continue;
    const views = /tgme_widget_message_views"[^>]*>([^<]+)/.exec(block)?.[1]?.trim();
    const raw = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? '';
    const text = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim()
      .slice(0, 800);
    out.push({ permalink, datetime, views, text });
  }
  return out;
}

export function isValidChannelHandle(h: string): boolean {
  return HANDLE_RE.test(h.replace(/^@/, ''));
}

export async function tgLiveSearch(
  query: string,
  channels: string[],
  opts: { maxResults?: number } = {}
): Promise<TgLiveSearchResult> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const diagnostics: TgLiveChannelStatus[] = [];
  const hits: TgLiveHit[] = [];
  const cap = Math.min(opts.maxResults ?? MAX_RESULTS, MAX_RESULTS);

  for (const raw of channels) {
    if (hits.length >= cap) break;
    const handle = raw.replace(/^@/, '');
    if (!isValidChannelHandle(raw)) {
      diagnostics.push({ handle: raw, ok: false, messages: 0, note: 'invalid handle' });
      continue;
    }
    let messages: ParsedMsg[] = [];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`https://t.me/s/${encodeURIComponent(handle)}`, {
          signal: ctrl.signal,
          headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': UA },
        });
        if (res.ok) {
          const html = await res.text();
          if (html.includes('tgme_widget_message_wrap')) messages = parsePreviewMessages(html);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* diagnostics below */
    }
    if (messages.length === 0) {
      diagnostics.push({ handle, ok: false, messages: 0, note: 'no preview (private/removed/rate-limited)' });
      continue;
    }
    diagnostics.push({ handle, ok: true, messages: messages.length });
    for (const m of messages) {
      const hay = m.text.toLowerCase();
      const matched = tokens.filter((t) => hay.includes(t));
      if (tokens.length > 0 && matched.length !== tokens.length) continue;
      const firstIdx = matched.length ? Math.min(...matched.map((t) => hay.indexOf(t))) : 0;
      const start = Math.max(0, firstIdx - 120);
      hits.push({
        channel_handle: handle,
        permalink: m.permalink,
        datetime: m.datetime,
        views: m.views,
        snippet: (start > 0 ? '…' : '') + m.text.slice(start, start + 320),
        matched,
      });
      if (hits.length >= cap) break;
    }
  }

  hits.sort((a, b) => b.datetime.localeCompare(a.datetime));
  return {
    generated_at: new Date().toISOString(),
    query: tokens,
    channels: diagnostics.sort((a, b) => a.handle.localeCompare(b.handle)),
    count: hits.length,
    hits,
  };
}
