/**
 * URLhaus — abuse.ch malware URL intelligence.
 *
 * API: https://urlhaus-api.abuse.ch/v1/
 * Requires Auth-Key header (free from auth.abuse.ch).
 *
 * Endpoints:
 *   POST /v1/url/        — query URL info (body: url=<url>)
 *   POST /v1/host/       — query host info (body: host=<host>)
 *   POST /v1/payload/    — query payload (body: md5_hash= or sha256_hash=)
 *   POST /v1/tag/        — query tag (body: tag=<tag>)
 *   POST /v1/signature/  — query signature (body: signature=<sig>)
 *   GET  /v1/urls/recent/ — recent URLs (optional ?limit=N)
 */

export interface UrlHausUrlEntry {
  id: string;
  urlhaus_reference: string;
  url: string;
  url_status: 'online' | 'offline' | 'unknown';
  host: string;
  date_added: string;
  last_online: string | null;
  threat: string;
  blacklists: { spamhaus_dbl: string; surbl: string };
  reporter: string;
  larted: string;
  takedown_time_seconds: number | null;
  tags: string[];
  payloads: Array<{
    firstseen: string;
    filename: string | null;
    file_type: string;
    response_size: string;
    response_md5: string;
    response_sha256: string;
    urlhaus_download: string;
    signature: string | null;
    virustotal: { result: string; percent: string; link: string } | null;
  }>;
}

export interface UrlHausHostResult {
  query_status: string;
  host?: string;
  firstseen?: string;
  url_count?: string;
  blacklists?: { spamhaus_dbl: string; surbl: string };
  urls?: Array<{
    id: string;
    urlhaus_reference: string;
    url: string;
    url_status: string;
    date_added: string;
    threat: string;
    reporter: string;
    larted: string;
    takedown_time_seconds: number | null;
    tags: string[];
  }>;
}

export interface UrlHausPayloadResult {
  query_status: string;
  md5_hash?: string;
  sha256_hash?: string;
  file_type?: string;
  file_size?: string;
  signature?: string | null;
  firstseen?: string;
  lastseen?: string | null;
  url_count?: number;
  urlhaus_download?: string;
  virustotal?: { result: string; percent: string; link: string } | null;
  urls?: Array<{
    url: string;
    url_status: string;
    urlhaus_reference: string;
    filename: string | null;
    firstseen: string;
    lastseen: string | null;
  }>;
}

export interface UrlHausTagResult {
  query_status: string;
  firstseen?: string;
  lastseen?: string | null;
  url_count?: string;
  urls?: Array<{
    url_id: string;
    url: string;
    url_status: string;
    dateadded: string;
    reporter: string;
    threat: string;
    urlhaus_reference: string;
  }>;
}

export interface UrlHausSignatureResult {
  query_status: string;
  firstseen?: string;
  lastseen?: string | null;
  url_count?: string;
  payload_count?: string;
  urls?: Array<{
    url_id: string;
    url: string;
    url_status: string;
    firstseen: string;
    lastseen: string | null;
    filename: string | null;
    file_type: string;
    file_size: string;
    md5_hash: string;
    sha256_hash: string;
    virustotal: { result: string; percent: string; link: string } | null;
    urlhaus_reference: string;
    urlhaus_download: string;
  }>;
}

export interface UrlHausRecentResult {
  query_status: string;
  urls?: Array<{
    id: string;
    urlhaus_reference: string;
    url: string;
    url_status: string;
    host: string;
    date_added: string;
    threat: string;
    blacklists: { spamhaus_dbl: string; surbl: string };
    reporter: string;
    larted: string;
    tags: string[];
  }>;
}

const BASE = 'https://urlhaus-api.abuse.ch/v1';

interface EnvWithUrlHaus {
  URLHAUS_API_KEY?: string;
}

async function urlHausPost<T>(
  env: EnvWithUrlHaus,
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const key = env.URLHAUS_API_KEY;
  if (!key) throw new Error('URLHAUS_API_KEY not set');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Auth-Key': key },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`urlhaus returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function urlHausGet<T>(
  env: EnvWithUrlHaus,
  path: string,
): Promise<T> {
  const key = env.URLHAUS_API_KEY;
  if (!key) throw new Error('URLHAUS_API_KEY not set');
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Auth-Key': key },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`urlhaus returned ${res.status}`);
  return res.json() as Promise<T>;
}

export async function urlHausLookupUrl(env: EnvWithUrlHaus, url: string) {
  return urlHausPost<UrlHausUrlResult>(env, '/url/', { url });
}

export async function urlHausLookupHost(env: EnvWithUrlHaus, host: string) {
  return urlHausPost<UrlHausHostResult>(env, '/host/', { host });
}

export async function urlHausLookupPayload(env: EnvWithUrlHaus, params: { md5_hash?: string; sha256_hash?: string }) {
  const body: Record<string, string> = {};
  if (params.md5_hash) body.md5_hash = params.md5_hash;
  if (params.sha256_hash) body.sha256_hash = params.sha256_hash;
  return urlHausPost<UrlHausPayloadResult>(env, '/payload/', body);
}

export async function urlHausLookupTag(env: EnvWithUrlHaus, tag: string) {
  return urlHausPost<UrlHausTagResult>(env, '/tag/', { tag });
}

export async function urlHausLookupSignature(env: EnvWithUrlHaus, signature: string) {
  return urlHausPost<UrlHausSignatureResult>(env, '/signature/', { signature });
}

export async function urlHausRecentUrls(env: EnvWithUrlHaus, limit = 50) {
  return urlHausGet<UrlHausRecentResult>(env, `/urls/recent/limit/${Math.min(limit, 1000)}/`);
}
