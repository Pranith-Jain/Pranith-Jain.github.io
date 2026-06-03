import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Phishing-kit hunting wordlists.
 *
 * Source: spmedia's "PhishingSecLists"
 * (https://github.com/spmedia/PhishingSecLists, MIT) — fuzzing wordlists used
 * to hunt exposed credential dumps, admin panels, and webshells on phishing
 * infrastructure (Gobuster / ffuf style). Complements the open-directory /
 * exposed-host hunting elsewhere in the app: these are the filenames threat
 * actors use to stash stolen creds and campaign data.
 *
 * Two small text files, one entry per line. Live fetch + 6h cache.
 */

const RAW_BASE = 'https://raw.githubusercontent.com/spmedia/PhishingSecLists/main';

const CACHE_KEY = 'https://phishing-wordlists-cache.internal/v1';
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEGRADED_TTL_SECONDS = 120;
const FETCH_TIMEOUT_MS = 15_000;
/** Cap lines returned per list — the viewer filters client-side. */
const MAX_LINES = 8000;

interface WordlistDef {
  id: string;
  file: string;
  label: string;
  blurb: string;
}

const LISTS: WordlistDef[] = [
  {
    id: 'wizard',
    file: 'Wizard.txt',
    label: 'Wizard',
    blurb:
      'Filenames & directories where threat actors store credentials, admin panels, APIs, and campaign data. Multi-language (EN, RU, ZH, ES, TH, HI, …).',
  },
  {
    id: 'shells',
    file: 'Shells.txt',
    label: 'Shells',
    blurb: 'Common webshell filenames — for spotting attacker-dropped shells on compromised / phishing hosts.',
  },
];

export interface Wordlist {
  id: string;
  label: string;
  blurb: string;
  line_count: number;
  truncated: boolean;
  lines: string[];
  ok: boolean;
}

export interface PhishingWordlistsResponse {
  generated_at: string;
  source_url: string;
  lists: Wordlist[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetchResilient(
      url,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain,*/*' },
        cf: { cacheTtl: 3600, cacheEverything: true },
        redirect: 'follow',
      },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

export async function fetchPhishingWordlists(): Promise<PhishingWordlistsResponse> {
  const texts = await Promise.all(LISTS.map((l) => fetchText(`${RAW_BASE}/${l.file}`)));
  const lists: Wordlist[] = LISTS.map((def, i) => {
    const text = texts[i];
    if (!text) {
      return { id: def.id, label: def.label, blurb: def.blurb, line_count: 0, truncated: false, lines: [], ok: false };
    }
    const all = parseLines(text);
    return {
      id: def.id,
      label: def.label,
      blurb: def.blurb,
      line_count: all.length,
      truncated: all.length > MAX_LINES,
      lines: all.slice(0, MAX_LINES),
      ok: true,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source_url: 'https://github.com/spmedia/PhishingSecLists',
    lists,
  };
}

export async function phishingWordlistsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchPhishingWordlists();
  const allFailed = body.lists.every((l) => !l.ok);
  const ttl = allFailed ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
