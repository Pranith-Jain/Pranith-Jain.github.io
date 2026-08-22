/**
 * Sample submission bridge — upload a suspicious file for multi-engine
 * analysis / detonation (Fleet-parity sandbox submission).
 *
 * Providers:
 *  - VirusTotal v3 files endpoint (existing VT_API_KEY): multi-engine static
 *    scan, ≤32MB, analysis-id polling.
 *  - Hybrid Analysis v2 submit/file (optional HYBRID_ANALYSIS_API_KEY): real
 *    dynamic detonation; state polled by sha256 summary/state endpoints.
 *
 * Degradation: each provider reports `configured:false` with a setup hint
 * when its key is absent, mirroring the velociraptor connector pattern.
 */

const MAX_SAMPLE_BYTES = 32 * 1024 * 1024; // VT free-tier cap

export interface SubmissionEnv {
  VT_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
}

function decodeBase64(b64: string): { bytes: Uint8Array | null; approxBytes: number } {
  const clean = b64.replace(/\s+/g, '');
  const approx = Math.floor((clean.length * 3) / 4);
  if (approx > MAX_SAMPLE_BYTES) return { bytes: null, approxBytes: approx };
  try {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, approxBytes: approx };
  } catch {
    return { bytes: null, approxBytes: approx };
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Provider capability descriptor ─────────────────────────────────────────

export function submissionProviders(
  env: SubmissionEnv
): Array<{ id: string; kind: string; configured: boolean; hint?: string }> {
  return [
    {
      id: 'virustotal',
      kind: 'multi_engine_static',
      configured: Boolean(env.VT_API_KEY),
      ...(env.VT_API_KEY ? {} : { hint: 'wrangler secret put VT_API_KEY' }),
    },
    {
      id: 'hybridanalysis',
      kind: 'dynamic_detonation',
      configured: Boolean(env.HYBRID_ANALYSIS_API_KEY),
      ...(env.HYBRID_ANALYSIS_API_KEY ? {} : { hint: 'wrangler secret put HYBRID_ANALYSIS_API_KEY' }),
    },
  ];
}

// ── VirusTotal ─────────────────────────────────────────────────────────────

export interface VtUploadResult {
  provider: 'virustotal';
  configured: true;
  analysisId: string;
  sha256: string;
  status: 'queued';
  link: string;
}

async function vtUpload(apiKey: string, bytes: Uint8Array, filename: string): Promise<VtUploadResult> {
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as ArrayBuffer]), filename || 'sample.bin');
  const res = await fetch('https://www.virustotal.com/api/v3/files', {
    method: 'POST',
    headers: { 'x-apikey': apiKey },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401) throw new Error('virustotal 401: invalid API key');
  if (!res.ok) throw new Error(`virustotal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: { id?: string } };
  const sha256 = await sha256Hex(bytes);
  return {
    provider: 'virustotal',
    configured: true,
    analysisId: data.data?.id ?? '',
    sha256,
    status: 'queued',
    link: `https://www.virustotal.com/gui/file/${sha256}`,
  };
}

export interface VtAnalysisStatus {
  provider: 'virustotal';
  analysisId: string;
  status: 'queued' | 'completed' | string;
  stats?: Record<string, number>;
  sha256?: string;
  link?: string;
}

async function vtAnalysis(apiKey: string, analysisId: string): Promise<VtAnalysisStatus> {
  const res = await fetch(`https://www.virustotal.com/api/v3/analyses/${encodeURIComponent(analysisId)}`, {
    headers: { 'x-apikey': apiKey },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`virustotal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    data?: {
      id?: string;
      attributes?: { status?: string; stats?: Record<string, number>; meta?: { file_info?: { sha256?: string } } };
    };
  };
  const attrs = data.data?.attributes;
  const sha256 = attrs?.meta?.file_info?.sha256;
  return {
    provider: 'virustotal',
    analysisId: data.data?.id ?? analysisId,
    status: attrs?.status ?? 'unknown',
    ...(attrs?.stats ? { stats: attrs.stats } : {}),
    ...(sha256 ? { sha256, link: `https://www.virustotal.com/gui/file/${sha256}` } : {}),
  };
}

// ── Hybrid Analysis ────────────────────────────────────────────────────────

export interface HaSubmitResult {
  provider: 'hybridanalysis';
  configured: true;
  jobId?: string;
  sha256: string;
  state: 'submitted' | 'existing_verdict' | string;
  verdict?: string;
  link: string;
}

const HA_ENVIRONMENT_ID = 160; // Windows 10 x64 (default detonation env)

async function haSubmit(apiKey: string, bytes: Uint8Array, filename: string): Promise<HaSubmitResult> {
  const sha256 = await sha256Hex(bytes);
  // HA requires a realistic UA and rejects default-library agents.
  const headers = { 'api-key': apiKey, 'user-agent': 'Fleet-Investigator/1.0' };
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as ArrayBuffer]), filename || 'sample.bin');
  form.append('environment_id', String(HA_ENVIRONMENT_ID));
  form.append('allow_community_submission', 'false');
  const res = await fetch('https://www.hybrid-analysis.com/api/v2/submit/file', {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 401) throw new Error('hybrid-analysis 401: invalid API key');
  if (!res.ok) throw new Error(`hybrid-analysis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { job_id?: string; state?: string; existing?: boolean };
  return {
    provider: 'hybridanalysis',
    configured: true,
    ...(data.job_id ? { jobId: data.job_id } : {}),
    sha256,
    state: data.existing === true ? 'existing_verdict' : (data.state ?? 'submitted'),
    link: `https://www.hybrid-analysis.com/search?query=${sha256}`,
  };
}

export interface HaStateResult {
  provider: 'hybridanalysis';
  sha256: string;
  state: string;
  verdict?: string;
  threatScore?: number;
  enginesDetected?: string;
  link: string;
}

/** Poll detonation state by the sample's sha256 (HA keys reports on hashes). */
async function haState(apiKey: string, sha256: string): Promise<HaStateResult> {
  const headers = { 'api-key': apiKey, 'user-agent': 'Fleet-Investigator/1.0', accept: 'application/json' };
  // State endpoint is cheap; fall back to summary only when finished-ish.
  const stateRes = await fetch(`https://www.hybrid-analysis.com/api/v2/report/${encodeURIComponent(sha256)}/state`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!stateRes.ok) {
    if (stateRes.status === 404) {
      return {
        provider: 'hybridanalysis',
        sha256,
        state: 'not_found',
        link: `https://www.hybrid-analysis.com/search?query=${sha256}`,
      };
    }
    throw new Error(`hybrid-analysis ${stateRes.status}: ${(await stateRes.text()).slice(0, 200)}`);
  }
  const stateData = (await stateRes.json()) as { state?: string } | Array<{ state?: string }>;
  const state = Array.isArray(stateData) ? (stateData[0]?.state ?? 'unknown') : (stateData.state ?? 'unknown');

  const out: HaStateResult = {
    provider: 'hybridanalysis',
    sha256,
    state,
    link: `https://www.hybrid-analysis.com/search?query=${sha256}`,
  };

  if (state === 'FINISHED') {
    const sumRes = await fetch(`https://www.hybrid-analysis.com/api/v2/report/${encodeURIComponent(sha256)}/summary`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (sumRes.ok) {
      const sum = (await sumRes.json()) as Array<{ verdict?: string; threat_score?: number; av_detect?: number }>;
      const s = Array.isArray(sum) ? sum[0] : undefined;
      if (s) {
        out.verdict = s.verdict;
        out.threatScore = s.threat_score;
        out.enginesDetected = typeof s.av_detect === 'number' ? `${s.av_detect}%` : undefined;
      }
    }
  }
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────

export type SubmitOutcome =
  | {
      ok: true;
      submitted: Array<Record<string, unknown>>;
      skipped: Array<{ provider: string; reason: string }>;
      sha256: string;
      elapsedMs: number;
    }
  | { ok: false; error: string };

/**
 * Submit one sample to every configured provider. A single provider failure
 * doesn't sink the submission — failures land in `skipped` with reasons.
 */
export async function submitSample(
  env: SubmissionEnv,
  input: { dataBase64: string; filename?: string },
  opts: { self?: Fetcher; providers?: string[] } = {}
): Promise<SubmitOutcome> {
  const started = Date.now();
  if (!input.dataBase64?.trim()) return { ok: false, error: 'dataBase64 is required' };
  const { bytes, approxBytes } = decodeBase64(input.dataBase64);
  if (!bytes) {
    return {
      ok: false,
      error:
        approxBytes > MAX_SAMPLE_BYTES
          ? `sample too large (~${approxBytes} bytes > ${MAX_SAMPLE_BYTES})`
          : 'dataBase64 is not valid base64',
    };
  }
  const filename = (input.filename ?? 'sample.bin').slice(0, 200);
  const want = new Set(opts.providers ?? ['virustotal', 'hybridanalysis']);
  // Provider results are heterogeneous (HA/VT shapes) but only carry
  // provider-name + opaque fields downstream, so a loose record array is
  // the honest type here.
  const submitted: Array<Record<string, unknown>> = [];
  const skipped: Array<{ provider: string; reason: string }> = [];
  let sha256 = '';

  // Hybrid Analysis first when configured — it's the detonation provider.
  if (want.has('hybridanalysis')) {
    if (!env.HYBRID_ANALYSIS_API_KEY) {
      skipped.push({ provider: 'hybridanalysis', reason: 'HYBRID_ANALYSIS_API_KEY not configured' });
    } else {
      try {
        const r = await haSubmit(env.HYBRID_ANALYSIS_API_KEY, bytes, filename);
        submitted.push({ ...r, provider: 'hybridanalysis' });
        sha256 = r.sha256;
      } catch (e) {
        skipped.push({ provider: 'hybridanalysis', reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  if (want.has('virustotal')) {
    if (!env.VT_API_KEY) {
      skipped.push({ provider: 'virustotal', reason: 'VT_API_KEY not configured' });
    } else {
      try {
        const r = await vtUpload(env.VT_API_KEY, bytes, filename);
        submitted.push({ ...r, provider: 'virustotal' });
        sha256 = sha256 || r.sha256;
      } catch (e) {
        skipped.push({ provider: 'virustotal', reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  if (submitted.length === 0 && skipped.length > 0) {
    return {
      ok: false,
      error: `no provider accepted the submission: ${skipped.map((s) => `${s.provider} (${s.reason})`).join('; ')}`,
    };
  }

  return { ok: true, submitted, skipped, sha256, elapsedMs: Date.now() - started };
}

export type StatusOutcome =
  | { ok: true; results: Array<{ provider: string } & Record<string, unknown>>; elapsedMs: number }
  | { ok: false; error: string };

/** Poll analysis status across providers for a sample (by analysis-id or sha256). */
export async function getSubmissionStatus(
  env: SubmissionEnv,
  input: { virustotalAnalysisId?: string; sha256?: string }
): Promise<StatusOutcome> {
  const started = Date.now();
  if (!input.virustotalAnalysisId && !input.sha256) {
    return { ok: false, error: 'virustotalAnalysisId or sha256 required' };
  }
  const results: Array<{ provider: string } & Record<string, unknown>> = [];
  const errors: string[] = [];

  if (input.virustotalAnalysisId) {
    if (!env.VT_API_KEY) errors.push('virustotal: VT_API_KEY not configured');
    else {
      try {
        const st = await vtAnalysis(env.VT_API_KEY, input.virustotalAnalysisId);
        results.push({ ...st, provider: 'virustotal' });
      } catch (e) {
        errors.push(`virustotal: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (input.sha256) {
    if (!env.HYBRID_ANALYSIS_API_KEY) errors.push('hybridanalysis: HYBRID_ANALYSIS_API_KEY not configured');
    else {
      try {
        const ha = await haState(env.HYBRID_ANALYSIS_API_KEY, input.sha256);
        results.push({ ...ha, provider: 'hybridanalysis' });
      } catch (e) {
        errors.push(`hybridanalysis: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (results.length === 0 && errors.length > 0) {
    return { ok: false, error: errors.join('; ') };
  }
  return { ok: true, results, elapsedMs: Date.now() - started };
}
