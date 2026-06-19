/**
 * Telegram → IOC extraction.
 *
 * Sprint 2 of the Telegram Intelligence research plan (§16): promote the
 * leak scanner's findings into the cross-source IOC pipeline as a 25th
 * source. The leak scanner (`api/src/routes/telegram-leak-monitor.ts`)
 * stores each detected leak in D1 (`telegram_leak_entries`) but the
 * `message_text`, `domains_found`, and `file_url` columns are not yet
 * fed into the cross-source consensus at
 * `api/src/routes/ioc-correlation.ts`.
 *
 * This module owns the IOC extraction rules for Telegram messages:
 *   - MD5 / SHA-1 / SHA-256 file hashes (with the same all-hex / all-digit
 *     filter that the scanner uses, to reject obvious non-hashes).
 *   - IPv4 addresses (any /32 + the rare `ip:port` form).
 *   - Domains (from the `email:password` form's `domains_found` JSON
 *     column, plus URL-host extraction from the message text).
 *   - CVE identifiers.
 *   - Full URLs from `file_url` and the message text.
 *
 * The output is shaped to match `IocEntry` from `ioc-feed-parsers.ts` so
 * the correlation route can drop it in without any other shape change.
 *
 * The rules intentionally mirror those in `telegram-leak-monitor.ts` so
 * the two extraction paths produce the same IOCs for the same message.
 * If you change a regex here, change it there too.
 */

import type { IocEntry } from './ioc-feed-parsers';

// ─── Hash patterns (word-boundaried) ──────────────────────────────────────

const MD5_RE = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_RE = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_RE = /\b[a-fA-F0-9]{64}\b/g;

/**
 * Reject strings that are too uniformly digit / letter to be real
 * cryptographic hashes. Mirrors `looksLikeHash()` in
 * `telegram-leak-monitor.ts` so the two paths agree.
 */
function looksLikeHash(s: string, minDigits: number, minLetters: number): boolean {
  const digits = (s.match(/\d/g) || []).length;
  const letters = (s.match(/[a-fA-F]/g) || []).length;
  return digits >= minDigits && letters >= minLetters;
}

// ─── IP / IPv4 + IPv4:port ───────────────────────────────────────────────

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV4_PORT_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})\b/g;
const IPV4_RE_TEST = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV4_PARTS_TEST = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// ─── Domains / URLs / CVEs / emails ──────────────────────────────────────

const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;
const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Reserved / non-routable IPv4 ranges observed in leaked messages but
// not actionable for the IOC pipeline. We compare against CIDR ranges
// (start, end) inclusive rather than a small allow-list — that's the
// only way to cover RFC1918 fully. The list is intentionally narrow:
// only the ranges we actually want to filter out. Everything else
// (including 100.64.0.0/10 CGNAT, which is sometimes used as a
// stealer-C2 pivot) is allowed through.
const RESERVED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000_0000, 0x00ff_ffff], // 0.0.0.0/8       "this network"
  [0x0a00_0000, 0x0aff_ffff], // 10.0.0.0/8       RFC1918
  [0x7f00_0000, 0x7fff_ffff], // 127.0.0.0/8      loopback
  [0xa9fe_0000, 0xa9ff_ffff], // 169.254.0.0/16   link-local
  [0xac10_0000, 0xac1f_ffff], // 172.16.0.0/12    RFC1918
  [0xc0a8_0000, 0xc0a8_ffff], // 192.168.0.0/16   RFC1918
  [0xffff_ffff, 0xffff_ffff], // 255.255.255.255/32 broadcast
];

function ipToInt(parts: number[]): number {
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isRoutableIpv4(s: string): boolean {
  if (!IPV4_PARTS_TEST.test(s)) return false;
  const parts = s.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts.some((p) => p < 0 || p > 255)) return false;
  const n = ipToInt(parts);
  for (const [start, end] of RESERVED_IPV4_RANGES) {
    if (n >= start && n <= end) return false;
  }
  return true;
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * A single D1 row from `telegram_leak_entries`. We only declare the
 * fields we read; the schema is owned by `migrations/0009…`.
 */
export interface TelegramLeakRow {
  id: number;
  channel_handle: string;
  message_link: string | null;
  message_text: string | null;
  leak_type: string;
  credential_count: number;
  file_url: string | null;
  domains_found: string | null;
  severity: string;
  discovered_at: string;
}

export interface ExtractOptions {
  /**
   * Maximum IOCs to return per leak entry. The leak scanner surfaces
   * messages with hundreds of credentials; without a cap a single row
   * could overwhelm the IOC pipeline. Default 50 — well over the typical
   * IOC count and below the per-row payload that would skew the
   * correlation weights.
   */
  perEntryCap?: number;
}

/**
 * Extract every IOC we recognize from a single leak row. Returns a
 * de-duplicated array (preserving first-seen order) ready to be added
 * to the correlation buckets.
 *
 * Order: hashes first (highest signal-to-noise), then CVEs, then
 * IPs / domains / URLs. The correlation engine doesn't care about
 * order, but the per-row cap is applied to the merged list, so the
 * most-actionable types land first.
 */
export function extractIocsFromLeak(row: TelegramLeakRow, opts: ExtractOptions = {}): IocEntry[] {
  const cap = opts.perEntryCap ?? 50;
  const out: IocEntry[] = [];
  const seen = new Set<string>();
  const context = `telegram:${row.channel_handle}`;
  const timestamp = row.discovered_at;

  function push(entry: IocEntry): boolean {
    const k = `${entry.type}:${entry.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    out.push(entry);
    return out.length >= cap;
  }

  const text = row.message_text ?? '';
  const fileUrl = row.file_url ?? '';

  // 1) Hashes (MD5 / SHA-1 / SHA-256).
  for (const m of text.match(MD5_RE) ?? []) {
    if (looksLikeHash(m, 3, 3) && push({ type: 'hash', value: m.toLowerCase(), context, timestamp })) return out;
  }
  for (const m of text.match(SHA1_RE) ?? []) {
    if (looksLikeHash(m, 4, 4) && push({ type: 'hash', value: m.toLowerCase(), context, timestamp })) return out;
  }
  for (const m of text.match(SHA256_RE) ?? []) {
    if (looksLikeHash(m, 6, 6) && push({ type: 'hash', value: m.toLowerCase(), context, timestamp })) return out;
  }

  // 2) CVEs.
  for (const m of text.match(CVE_RE) ?? []) {
    if (push({ type: 'cve', value: m.toUpperCase(), context, timestamp })) return out;
  }

  // 3) IPv4 + IPv4:port (port-form yields just the IP, port is dropped).
  for (const m of text.match(IPV4_PORT_RE) ?? []) {
    const ip = m.split(':')[0]!;
    if (isRoutableIpv4(ip) && push({ type: 'ipv4', value: ip, context, timestamp })) return out;
  }
  for (const m of text.match(IPV4_RE) ?? []) {
    if (isRoutableIpv4(m) && push({ type: 'ipv4', value: m, context, timestamp })) return out;
  }

  // 4) Domains from the pre-computed `domains_found` JSON column
  //    (extracted by `scanMessageForLeaks` from email:password lines —
  //    these are high-confidence). Plus email-extracted domains from
  //    the message text as a second pass.
  if (row.domains_found) {
    try {
      const arr = JSON.parse(row.domains_found);
      if (Array.isArray(arr)) {
        for (const d of arr) {
          if (typeof d === 'string' && d.length > 0) {
            if (push({ type: 'domain', value: d.toLowerCase(), context, timestamp })) return out;
          }
        }
      }
    } catch {
      /* invalid JSON in DB row — skip */
    }
  }
  for (const email of text.match(EMAIL_RE) ?? []) {
    const at = email.lastIndexOf('@');
    if (at < 0) continue;
    const d = email.slice(at + 1).toLowerCase();
    if (d && d.includes('.') && push({ type: 'domain', value: d, context, timestamp })) return out;
  }

  // 5) URLs (and their hosts).
  const urlTexts = [fileUrl, text].filter((s) => s.length > 0);
  for (const src of urlTexts) {
    for (const u of src.match(URL_RE) ?? []) {
      const clean = u.replace(/[.,;:!?)]+$/, '');
      if (push({ type: 'url', value: clean, context, timestamp })) return out;
      const host = hostOf(clean);
      if (!host) continue;
      if (IPV4_RE_TEST.test(host)) {
        if (isRoutableIpv4(host) && push({ type: 'ipv4', value: host, context, timestamp })) return out;
      } else {
        if (push({ type: 'domain', value: host, context, timestamp })) return out;
      }
    }
  }

  return out;
}

/**
 * Compute the source reliability for a single leak row. We use the
 * severity as a proxy (more credential / hash hits → higher reliability)
 * so the IOC pipeline can blend the Telegram observation with others
 * using the standard Admiralty tier mapping.
 *
 * This is intentionally a separate function from `extractIocsFromLeak`
 * so the caller can choose to apply the same reliability to every IOC
 * pulled from a single message, or vary it by IOC type.
 */
export function reliabilityForLeak(row: TelegramLeakRow): 'A' | 'B' | 'C' | 'D' {
  // The leak scanner's severity is computed from credential count + IOC
  // count + matched keyword count, so it's a reasonable proxy for the
  // "amount of corroboration in this one message".
  switch (row.severity) {
    case 'critical':
      return 'B'; // high-volume credential dump or ≥5 IOCs
    case 'high':
      return 'B';
    case 'medium':
      return 'C';
    default:
      return 'D';
  }
}

// ─── D1 integration helper ──────────────────────────────────────────────

/**
 * Minimal D1-shape contract — only the surface this module needs.
 * Exists so tests can supply an in-memory fake without depending on
 * `@cloudflare/workers-types`.
 */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results?: T[] }>;
    };
  };
}

export interface IngestResult {
  ok: boolean;
  /** Number of distinct D1 rows scanned. */
  rowsScanned: number;
  /** Total IOCs extracted across all rows. */
  iocsExtracted: number;
  /** Day window used for the SQL cutoff (e.g. 7 = last 7 days). */
  windowDays: number;
  /** Set when D1 is missing or the query throws. */
  error?: string;
}

/**
 * Pull `telegram_leak_entries` from the last `windowDays` and produce a
 * flat list of `IocEntry` objects ready to be added to the cross-source
 * correlation buckets. The function is the single source of truth for
 * the telegram → IOC pipeline; the correlation route just maps the
 * entries into its existing `add()` calls.
 *
 * Returns an empty result on any failure — the correlation route should
 * never 500 because the Telegram query is unavailable.
 */
export async function ingestTelegramLeaksFromD1(
  db: D1Like | null | undefined,
  windowDays: number = 7,
  perEntryCap: number = 50
): Promise<{ entries: IocEntry[]; meta: IngestResult }> {
  if (!db) {
    return {
      entries: [],
      meta: { ok: false, rowsScanned: 0, iocsExtracted: 0, windowDays },
    };
  }
  try {
    const stmt = db.prepare(
      `SELECT id, channel_handle, message_link, message_text, leak_type,
              credential_count, file_url, domains_found, severity, discovered_at
         FROM telegram_leak_entries
        WHERE discovered_at >= datetime('now', ? || ' days')
        ORDER BY discovered_at DESC
        LIMIT 1000`
    );
    const { results } = await stmt.bind(`-${windowDays}`).all<TelegramLeakRow>();
    const rows = results ?? [];
    const out: IocEntry[] = [];
    for (const row of rows) {
      const extracted = extractIocsFromLeak(row, { perEntryCap });
      for (const e of extracted) out.push(e);
    }
    return {
      entries: out,
      meta: { ok: true, rowsScanned: rows.length, iocsExtracted: out.length, windowDays },
    };
  } catch (err) {
    return {
      entries: [],
      meta: {
        ok: false,
        rowsScanned: 0,
        iocsExtracted: 0,
        windowDays,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
