import type { Context } from 'hono';
import type { Env } from '../env';
import { virustotal } from '../providers/virustotal';
import { hybridanalysis } from '../providers/hybridanalysis';
import type { ProviderEnv, ProviderResult } from '../providers/types';
import { compositeScore } from '../lib/scoring';

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
  let parsed: RequestBody;
  try {
    parsed = (await c.req.json()) as RequestBody;
  } catch {
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
    GREYNOISE_API_KEY: c.env.GREYNOISE_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    PULSEDIVE_API_KEY: c.env.PULSEDIVE_API_KEY ?? '',
  };
  const indicator = { type: 'hash' as const, value: hash };
  const signal = AbortSignal.timeout(5000);

  const [vt, ha] = await Promise.all([
    virustotal(indicator, env, signal).catch(
      (err: unknown): ProviderResult => ({
        source: 'virustotal',
        status: 'error',
        score: 0,
        verdict: 'unknown',
        raw_summary: {},
        tags: [],
        error: err instanceof Error ? err.message : String(err),
        fetched_at: new Date().toISOString(),
        cached: false,
      })
    ),
    hybridanalysis(indicator, env, signal).catch(
      (err: unknown): ProviderResult => ({
        source: 'hybridanalysis',
        status: 'error',
        score: 0,
        verdict: 'unknown',
        raw_summary: {},
        tags: [],
        error: err instanceof Error ? err.message : String(err),
        fetched_at: new Date().toISOString(),
        cached: false,
      })
    ),
  ]);

  const composite = compositeScore('hash', [vt, ha]);
  return c.json({
    hash,
    hash_type: hashType,
    providers: [vt, ha],
    score: composite.score,
    verdict: composite.verdict,
    confidence: composite.confidence,
  });
}
