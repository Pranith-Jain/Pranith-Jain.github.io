/**
 * Parser for t.me/s/mythreatintel — a Spanish-language multi-source CTI
 * firehose that posts structured templates for CVE disclosures and
 * ransomware-victim claims.
 *
 * Message templates the channel uses (verified 2026-05-12):
 *
 *   🚨 ALERTA CVE 🚨
 *   🆔 CVE-2026-7255
 *   🕒 Publicada: 2026-05-12 06:16:29
 *   🛠 Modificada: 2026-05-12 06:16:29
 *   ⚠️ Severidad: N/D
 *   📊 CVSS v3.1: 6.5
 *   🧬 Vector: CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
 *   📝 Descripción: <text>
 *
 *   🚨🚨 ALERTA RANSOMWARE 🚨🚨
 *   🕒 Fecha: 2026-05-12 09:52:12
 *   🏢 Víctima: <name>
 *   💀 Grupo: <group>
 *   🌍 País: <country or N/D>
 *   🌐 Web: <url or empty>
 *   📝 Descripción: <text>
 *
 * Why this module: the same upstream HTML fetch (t.me/s/mythreatintel) feeds
 * three consumers — the Telegram message panel, the ransomware-recent
 * tracker, and the CVE feed augmentation. Centralising the parse here keeps
 * the three consumers in sync and lets the Cache API serve a single
 * fetched HTML to all of them.
 */

const MTI_URL = 'https://t.me/s/mythreatintel';
const FETCH_TIMEOUT_MS = 12_000;
const SHARED_CACHE_KEY = 'https://mythreatintel-html-cache.internal/v1';
const SHARED_CACHE_TTL_SECONDS = 300; // 5 minutes — channel posts roughly hourly

/**
 * One parsed CVE alert from the channel. Spanish description is preserved
 * as-is; consumers are responsible for English fallback (e.g., enriching
 * from NVD) when needed.
 */
export interface MtiCve {
  cve_id: string;
  published: string;
  modified?: string;
  severity?: string;
  cvss?: number;
  cvss_vector?: string;
  description?: string;
  /** Telegram permalink to the original message. */
  permalink: string;
}

export interface MtiVictim {
  victim: string;
  group: string;
  /** ISO 8601 date. Best-effort parse of the channel's `Fecha:` field. */
  discovered: string;
  country?: string;
  web?: string;
  description?: string;
  permalink: string;
}

/**
 * Fetch and cache the channel's HTML. Returns null on upstream failure so
 * consumers can degrade gracefully.
 */
async function fetchMtiHtml(): Promise<string | null> {
  // Cache layer: every consumer (telegram-feed, ransomware-recent,
  // cve-recent) calls this. The Cache API match-or-fetch pattern means
  // each consumer pays at most one upstream fetch per 5min window.
  try {
    const cache = caches.default;
    const cached = await cache.match(SHARED_CACHE_KEY);
    if (cached) return cached.text();
    const res = await fetch(MTI_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 pranithjain.qzz.io/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.text();
    const toCache = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': `public, max-age=${SHARED_CACHE_TTL_SECONDS}`,
      },
    });
    // Best-effort cache write; don't block on it.
    await cache.put(SHARED_CACHE_KEY, toCache);
    return body;
  } catch {
    return null;
  }
}

/** Telegram `tgme_widget_message` block walker. */
interface RawMsg {
  permalink: string;
  datetime: string;
  text: string;
}

function* iterateMessages(html: string): Generator<RawMsg> {
  // Each message: <div class="tgme_widget_message" data-post="handle/N"> ... <time datetime="..."> ... <div class="tgme_widget_message_text"> ...
  const msgRe = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(html)) !== null) {
    const block = m[0];
    const post = m[1];
    if (!block || !post) continue;
    const datetime = /<time[^>]*datetime="([^"]+)"/.exec(block)?.[1] ?? '';
    // Extract message text. Replace <br> with newlines, then strip tags.
    const textMatch = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block);
    if (!textMatch || !textMatch[1]) continue;
    const text = textMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#33;/g, '!')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/gi, '/')
      .trim();
    yield {
      permalink: `https://t.me/${post}`,
      datetime,
      text,
    };
  }
}

/** Try to parse the channel's `Fecha: YYYY-MM-DD HH:MM:SS[.ffff]` into ISO. */
function fechaToIso(s: string): string | null {
  const trimmed = s
    .trim()
    .replace(' ', 'T')
    .replace(/\.\d+$/, '');
  // Assume UTC if no timezone in the source (channel doesn't emit one).
  const ts = Date.parse(`${trimmed}Z`);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

/**
 * Extract CVE alerts from the channel's HTML.
 * Returns newest-first (per Telegram's render order; channel is also newest-first).
 */
export async function fetchMythreatintelCves(): Promise<MtiCve[]> {
  const html = await fetchMtiHtml();
  if (!html) return [];
  const out: MtiCve[] = [];
  for (const msg of iterateMessages(html)) {
    if (!msg.text.includes('ALERTA CVE')) continue;
    const cveId = /CVE-\d{4}-\d{4,7}/.exec(msg.text)?.[0];
    if (!cveId) continue;
    const publishedRaw = /Publicada:\s*([\d:\s-]+\.?\d*)/i.exec(msg.text)?.[1];
    const modifiedRaw = /Modificada:\s*([\d:\s-]+\.?\d*)/i.exec(msg.text)?.[1];
    const severity = /Severidad:\s*([A-Za-z/]+)/i.exec(msg.text)?.[1]?.trim();
    const cvssStr = /CVSS\s*v?[\d.]*:\s*([\d.]+)/i.exec(msg.text)?.[1];
    const vector = /Vector:\s*(CVSS:[^\s\n]+)/i.exec(msg.text)?.[1];
    const descRaw = /Descripción:\s*([\s\S]*?)$/i.exec(msg.text)?.[1]?.trim();

    const published = publishedRaw ? fechaToIso(publishedRaw) : null;
    out.push({
      cve_id: cveId,
      published: published ?? msg.datetime,
      ...(modifiedRaw ? { modified: fechaToIso(modifiedRaw) ?? msg.datetime } : {}),
      ...(severity && severity !== 'N/D' ? { severity } : {}),
      ...(cvssStr ? { cvss: Number.parseFloat(cvssStr) } : {}),
      ...(vector ? { cvss_vector: vector } : {}),
      ...(descRaw && descRaw !== 'N/D' ? { description: descRaw.slice(0, 600) } : {}),
      permalink: msg.permalink,
    });
  }
  return out;
}

/** Reuse the sector classifier here so the ransomware merge can dedupe cleanly. */
import { classifySector, type Sector } from './sector-classifier';

/**
 * Extract ransomware-victim alerts from the channel's HTML.
 * Output matches the shape `routes/ransomware-recent.ts` already consumes
 * (victim / group / discovered / source_url / description / sector) so the
 * caller can merge with Ransomlook / ransomfeed.it / ransomwatch via the
 * existing mergeVictims() function.
 */
export interface MtiRansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  /** ISO-3166 country name from the channel's `País:` field, when present. */
  country?: string;
  sector?: Sector;
  /** Origin tag for the merged ransomware-recent payload. Always 'mti' here. */
  origin: 'mti';
}

export async function fetchMythreatintelRansomwareVictims(): Promise<MtiRansomwareVictim[]> {
  const html = await fetchMtiHtml();
  if (!html) return [];
  // 7-day cutoff matching the other fetchers in the ransomware-recent
  // merge. The MTI t.me channel carries historical ALERTA RANSOMWARE
  // messages going back months/years; without a cutoff the metrics
  // page could surface 2024 incidents under "last 7 days".
  const cutoffMs = Date.now() - 7 * 24 * 3600 * 1000;
  const out: MtiRansomwareVictim[] = [];
  for (const msg of iterateMessages(html)) {
    if (!msg.text.includes('ALERTA RANSOMWARE')) continue;
    const fecha = /Fecha:\s*([\d:\s-]+\.?\d*)/i.exec(msg.text)?.[1];
    const victim = /Víctima:\s*(.+?)(?:\n|💀|$)/i.exec(msg.text)?.[1]?.trim();
    const group = /Grupo:\s*(.+?)(?:\n|🌍|$)/i.exec(msg.text)?.[1]?.trim();
    const country = /País:\s*(.+?)(?:\n|🌐|$)/i.exec(msg.text)?.[1]?.trim();
    const web = /Web:\s*(.+?)(?:\n|📝|$)/i.exec(msg.text)?.[1]?.trim();
    const descMatch = /Descripción:\s*([\s\S]*?)$/i.exec(msg.text)?.[1]?.trim();

    if (!victim || !group) continue;
    const discovered = fecha ? fechaToIso(fecha) : null;
    if (!discovered) continue;
    const parsed = Date.parse(discovered);
    if (!Number.isFinite(parsed) || parsed < cutoffMs) continue;
    const cleanDesc = descMatch && descMatch !== 'N/D' ? descMatch.slice(0, 320) : undefined;
    out.push({
      victim,
      group: group.toLowerCase(),
      discovered,
      ...(country && country !== 'N/D' && country !== 'Non Disponibile' ? { country } : {}),
      ...(cleanDesc ? { description: cleanDesc } : {}),
      source_url: web && web.startsWith('http') ? web : msg.permalink,
      sector: classifySector(victim, cleanDesc),
      origin: 'mti' as const,
    });
  }
  return out;
}
