import type { Context } from 'hono';
import type { Env } from '../env';
import { virustotal } from '../providers/virustotal';
import { hybridanalysis } from '../providers/hybridanalysis';
import { malwarebazaar } from '../providers/malwarebazaar';
import { threatfox } from '../providers/threatfox';
import { otx } from '../providers/otx';
import { hashlookup } from '../providers/hashlookup';
import { tweetfeed } from '../providers/tweetfeed';
import type { ProviderAdapter, ProviderEnv, ProviderResult } from '../providers/types';
import { compositeScore } from '../lib/scoring';

const MAX_BODY_BYTES = 4 * 1024; // body is just `{"hash":"<64hex>"}` — 4KB is generous

interface RequestBody {
  hash?: string;
}

function detectHashType(hash: string): 'md5' | 'sha1' | 'sha256' | null {
  if (/^[a-fA-F0-9]{32}$/.test(hash)) return 'md5';
  if (/^[a-fA-F0-9]{40}$/.test(hash)) return 'sha1';
  if (/^[a-fA-F0-9]{64}$/.test(hash)) return 'sha256';
  return null;
}

export async function fileAnalyzeHandler(c: Context<{ Bindings: Env }>) {
  // Read raw, length-check, then parse. Cheaper than letting Workers
  // buffer an unbounded request body before we get to discard it.
  const raw = await c.req.text();
  if (new Blob([raw]).size > MAX_BODY_BYTES) {
    return c.json({ error: 'body too large (max 4KB)' }, 413);
  }
  let parsed: RequestBody;
  try {
    parsed = JSON.parse(raw) as RequestBody;
  } catch (_catchErr) {
    console.error('fileAnalyzeHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const hash = parsed.hash?.trim().toLowerCase();
  if (!hash) return c.json({ error: 'missing hash' }, 400);
  const hashType = detectHashType(hash);
  if (!hashType) return c.json({ error: 'invalid hash (expected MD5/SHA-1/SHA-256)' }, 400);

  const env: ProviderEnv = {
    VT_API_KEY: c.env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: c.env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: c.env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: c.env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
  };
  const indicator = { type: 'hash' as const, value: hash };
  const signal = AbortSignal.timeout(8000);

  const safeCall = async (name: string, fn: ProviderAdapter): Promise<ProviderResult> => {
    try {
      return await fn(indicator, env, signal);
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      return {
        source: name as ProviderResult['source'],
        status: 'error',
        score: 0,
        verdict: 'unknown',
        raw_summary: {},
        tags: [],
        error: err instanceof Error ? err.message : String(err),
        fetched_at: new Date().toISOString(),
        cached: false,
      };
    }
  };

  const providers = await Promise.all([
    safeCall('virustotal', virustotal),
    safeCall('hybridanalysis', hybridanalysis),
    safeCall('malwarebazaar', malwarebazaar),
    safeCall('threatfox', threatfox),
    safeCall('otx', otx),
    safeCall('hashlookup', hashlookup),
    safeCall('tweetfeed', tweetfeed),
  ]);

  const composite = compositeScore('hash', providers);
  // no-store: hash lookups are global facts but the request value (an attacker
  // hash, or a sample under investigation) is sensitive context the user
  // typically doesn't want intermediaries to retain.
  return c.json(
    {
      hash,
      hash_type: hashType,
      providers,
      score: composite.score,
      verdict: composite.verdict,
      confidence: composite.confidence,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
