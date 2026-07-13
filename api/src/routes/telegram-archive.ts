import type { Env } from '../env';
import { RANSOMWARE_RECENT_CACHE_KEY } from './ransomware-recent';
import { CVE_RECENT_CACHE_KEY } from './cve-recent';
import { MALWARE_SAMPLES_CACHE_KEY } from './malware-samples';
import { LIVE_IOCS_CACHE_KEY } from './live-iocs';
import { VICTIM_RELEAKS_CACHE_KEY } from './victim-releaks';
import { DETECTIONS_CACHE_KEY } from './detections';

/**
 * Telegram CTI archive.
 *
 * Hourly cron job: reads the ALREADY-EDGE-CACHED feeds (zero extra upstream
 * cost, zero KV reads for the source data), dedups every captured item
 * against one KV blob, and posts a single compact digest per category to a
 * dedicated Telegram channel. This is push-on-our-cron, so it can't be
 * abused like an external-pull feed — safe on the free tier.
 *
 * Fail-safe: with TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID unset it is a
 * no-op (never throws, never blocks the cron).
 */

const STATE_KEY = 'tg:archive:state:v1';
const SEEN_CAP = 1500; // per-category rolling id cap (one bounded JSON blob)
const MAX_LIST = 25; // max itemised lines per digest message
const MSG_CAP = 3800; // < Telegram's 4096 hard limit, leaves headroom

type SeenState = Record<string, string[]>;

interface Category {
  cat: string;
  cacheKey: string;
  emoji: string;
  label: string;
  /** → [{ id, line }] newest-first. id must be stable for dedup. */
  extract: (body: unknown) => Array<{ id: string; line: string }>;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function s(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

const SEV_EMOJI: Record<string, string> = {
  critical: '🟥',
  high: '🟧',
  medium: '🟨',
  low: '⬜',
};

const CATEGORIES: Category[] = [
  {
    cat: 'detections',
    cacheKey: DETECTIONS_CACHE_KEY,
    emoji: '🚨',
    label: 'Detections fired',
    extract: (b) =>
      arr(rec(b).detections)
        .map(rec)
        .map((d) => {
          const rid = s(d, 'rule_id');
          const name = s(d, 'rule_name') || rid;
          const sev = s(d, 'severity') || 'medium';
          const gk = s(d, 'group_key');
          const cnt = s(d, 'match_count');
          // id includes count so a strengthening detection (more sources)
          // re-posts; bounded by SEEN_CAP like every other category.
          return {
            id: `${rid}|${gk}|${cnt}`.toLowerCase(),
            line:
              `${SEV_EMOJI[sev] ?? '🟨'} <b>${esc(name)}</b>` +
              (gk ? ` — <code>${esc(gk.slice(0, 60))}</code>` : '') +
              (cnt ? ` ×${esc(cnt)}` : ''),
          };
        })
        .filter((x) => x.id && x.id !== '||'),
  },
  {
    cat: 'ransomware',
    cacheKey: RANSOMWARE_RECENT_CACHE_KEY,
    emoji: '🦠',
    label: 'Ransomware victims',
    extract: (b) =>
      arr(rec(b).victims)
        .map(rec)
        .map((v) => {
          const group = s(v, 'group') || '?';
          const victim = s(v, 'victim') || '?';
          const day = s(v, 'discovered').slice(0, 10);
          return {
            id: `${group}|${victim}|${day}`.toLowerCase(),
            line: `<b>${esc(group)}</b> → ${esc(victim)} (${esc(day)})`,
          };
        }),
  },
  {
    cat: 'cve',
    cacheKey: CVE_RECENT_CACHE_KEY,
    emoji: '🐛',
    label: 'CVE / KEV',
    extract: (b) =>
      arr(rec(b).cves)
        .map(rec)
        .map((c) => {
          const id = s(c, 'id');
          const sev = s(c, 'severity');
          const score = s(c, 'score');
          const kev = c.kev === true ? ' <b>KEV</b>' : '';
          return { id: id.toLowerCase(), line: `${esc(id)} — ${esc(sev)}${score ? ` ${esc(score)}` : ''}${kev}` };
        })
        .filter((x) => x.id),
  },
  {
    cat: 'malware',
    cacheKey: MALWARE_SAMPLES_CACHE_KEY,
    emoji: '🧪',
    label: 'Malware samples',
    extract: (b) =>
      arr(rec(b).samples)
        .map(rec)
        .map((m) => {
          const sha = s(m, 'sha256');
          const sig = s(m, 'signature') || 'unclassified';
          return { id: sha.toLowerCase(), line: `<b>${esc(sig)}</b> <code>${esc(sha.slice(0, 16))}…</code>` };
        })
        .filter((x) => x.id),
  },
  {
    cat: 'releaks',
    cacheKey: VICTIM_RELEAKS_CACHE_KEY,
    emoji: '♻️',
    label: 'Victim re-leaks',
    extract: (b) =>
      arr(rec(b).releaks)
        .map(rec)
        .map((r) => {
          const name = (arr(r.raw_names)[0] as string) || s(r, 'key');
          const gc = s(r, 'group_count');
          return {
            id: `${s(r, 'key')}|${gc}`.toLowerCase(),
            line: `<b>${esc(name)}</b> — claimed by ${esc(gc)} groups`,
          };
        })
        .filter((x) => x.id),
  },
];

/** IOCs are very high-volume → one summary line + a small sample, not a dump. */
function iocDigest(body: unknown, seen: Set<string>): { newIds: string[]; text: string } | null {
  const items = arr(rec(body).items).map(rec);
  const fresh: { id: string; v: string; kind: string; src: string }[] = [];
  for (const it of items) {
    const value = s(it, 'value');
    const kind = s(it, 'kind');
    if (!value) continue;
    const id = `${kind}:${value}`.toLowerCase();
    if (seen.has(id)) continue;
    fresh.push({ id, v: value, kind, src: s(it, 'source') });
  }
  if (fresh.length === 0) return null;
  const byKind = new Map<string, number>();
  const bySrc = new Map<string, number>();
  for (const f of fresh) {
    byKind.set(f.kind || '?', (byKind.get(f.kind || '?') ?? 0) + 1);
    if (f.src) bySrc.set(f.src, (bySrc.get(f.src) ?? 0) + 1);
  }
  const kinds = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${esc(k)} ${n}`)
    .join(', ');
  const srcs = [...bySrc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, n]) => `${esc(k)} ${n}`)
    .join(', ');
  const sample = fresh
    .slice(0, 8)
    .map((f) => `<code>${esc(f.v.slice(0, 80))}</code>`)
    .join('\n');
  const text =
    `🌐 <b>IOCs</b> — ${fresh.length} new\n` +
    `by type: ${kinds}\n` +
    (srcs ? `top sources: ${srcs}\n` : '') +
    `\n${sample}` +
    (fresh.length > 8 ? `\n…+${fresh.length - 8} more` : '');
  return { newIds: fresh.map((f) => f.id), text: text.slice(0, MSG_CAP) };
}

/** Targets = TELEGRAM_CHANNEL_ID split on comma / whitespace / newline. */
function targets(env: Env): string[] {
  return (env.TELEGRAM_CHANNEL_ID ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function sendTo(env: Env, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Telegram's sendMessage endpoint is normally <500ms; cap at 8s so
      // a flapping connection can't pin the request past the Worker's
      // CPU budget. Same ceiling as the other Telegram calls in the
      // codebase for consistency.
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: true,
      }),
    });
    return r.ok; // 429 / 5xx → false
  } catch (_catchErr) {
    console.error('sendTo failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return false;
  }
}

/**
 * Broadcast one message to every target chat (channel or group). Returns
 * true if it reached at least one — a single throttled/removed chat must
 * not block the others or lose the item. Small inter-send delay keeps us
 * well under Telegram's per-chat (~20/min) and global (~30/s) limits.
 */
async function tgSend(env: Env, text: string): Promise<boolean> {
  const chats = targets(env);
  let anyOk = false;
  for (let i = 0; i < chats.length; i += 1) {
    if (await sendTo(env, chats[i]!, text)) anyOk = true;
    if (i < chats.length - 1) await new Promise((r) => setTimeout(r, 250));
  }
  return anyOk; // false only if EVERY target failed → caller stops, retries next run
}

export async function runTelegramArchive(env: Env): Promise<{ posted: number; skipped?: string }> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    return { posted: 0, skipped: 'not_configured' };
  }
  const cache = (caches as unknown as { default: Cache }).default;
  let state: SeenState = {};
  try {
    state = ((await env.CASE_STUDIES.get(STATE_KEY, 'json')) as SeenState) ?? {};
  } catch (_catchErr) {
    console.error('runTelegramArchive failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    state = {};
  }
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  let posted = 0;
  let stop = false;

  // Itemised categories
  for (const c of CATEGORIES) {
    if (stop) break;
    const hit = await cache.match(c.cacheKey);
    if (!hit) continue;
    let body: unknown;
    try {
      body = await hit.json();
    } catch (_catchErr) {
      console.error('runTelegramArchive failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      continue;
    }
    const seen = new Set(state[c.cat] ?? []);
    const all = c.extract(body);
    const fresh = all.filter((x) => x.id && !seen.has(x.id));
    if (fresh.length === 0) continue;
    const shown = fresh.slice(0, MAX_LIST);
    let text = `${c.emoji} <b>${esc(c.label)}</b> — ${fresh.length} new · ${esc(ts)}\n\n${shown.map((x) => `• ${x.line}`).join('\n')}`;
    if (fresh.length > shown.length) text += `\n…+${fresh.length - shown.length} more`;
    text = text.slice(0, MSG_CAP);
    if (await tgSend(env, text)) {
      posted += 1;
      state[c.cat] = [...fresh.map((x) => x.id), ...(state[c.cat] ?? [])].slice(0, SEEN_CAP);
    } else {
      stop = true; // rate-limited / down — bail; next hour catches up, state unchanged
    }
  }

  // IOC summary (separate: volume-summarised, not itemised)
  if (!stop) {
    const hit = await cache.match(LIVE_IOCS_CACHE_KEY);
    if (hit) {
      let body: unknown;
      try {
        body = await hit.json();
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        body = null;
      }
      if (body) {
        const seen = new Set(state['ioc'] ?? []);
        const dg = iocDigest(body, seen);
        if (dg && (await tgSend(env, `${dg.text}\n\n<i>${esc(ts)}</i>`))) {
          posted += 1;
          state['ioc'] = [...dg.newIds, ...(state['ioc'] ?? [])].slice(0, SEEN_CAP);
        }
      }
    }
  }

  if (posted > 0) {
    try {
      await env.CASE_STUDIES.put(STATE_KEY, JSON.stringify(state));
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* KV write failed — items may repost next run; acceptable, non-fatal */
    }
  }
  console.log(JSON.stringify({ job: 'telegram-archive', posted, ts }));
  return { posted };
}
