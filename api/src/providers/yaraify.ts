import type { ProviderAdapter, ProviderResult } from './types';

const supports = new Set(['hash']);
const API_URL = 'https://yaraify-api.abuse.ch/api/v1/';

export const yaraify: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'yaraify',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');
  if (!env.ABUSECH_AUTH_KEY) return base('error', { error: 'no_abusech_key' });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Auth-Key': env.ABUSECH_AUTH_KEY },
      body: new URLSearchParams({ query: `get_file_report`, hash: indicator.value.toLowerCase() }),
      signal,
    });

    if (!res.ok) return base('error', { error: `${res.status}` });

    const data = (await res.json()) as {
      query_status?: string;
      md5?: string;
      sha1?: string;
      sha256?: string;
      first_seen?: string;
      last_seen?: string;
      detections?: number;
      yara_rules?: Array<{ rule_name: string; author: string }>;
      clamav?: string[];
      crowdsourced_yara_rules?: string[];
      vendors?: Record<string, { detected: boolean }>;
    };

    if (data.query_status === 'hash_not_found') {
      return base('ok', { score: 0, verdict: 'clean', raw_summary: { found: false } });
    }

    const detections = data.detections ?? 0;
    const yaraCount = (data.yara_rules ?? []).length + (data.crowdsourced_yara_rules ?? []).length;
    const clamMatches = data.clamav ?? [];
    const vendorDetections = data.vendors ? Object.values(data.vendors).filter((v) => v.detected).length : 0;
    const totalSignals = detections + yaraCount + clamMatches.length + vendorDetections;

    const score = Math.min(100, Math.round(totalSignals * 15));
    const verdict = score >= 50 ? 'malicious' : score >= 15 ? 'suspicious' : 'clean';
    const tags: string[] = [];
    if (detections > 0) tags.push(`${detections}-detections`);
    if (yaraCount > 0) tags.push(`${yaraCount}-yara-rules`);
    if (clamMatches.length > 0) tags.push(`${clamMatches.length}-clamav`);
    if (vendorDetections > 0) tags.push(`${vendorDetections}-vendor-detections`);

    return base('ok', {
      score,
      verdict,
      tags,
      raw_summary: {
        first_seen: data.first_seen,
        last_seen: data.last_seen,
        detections,
        yara_rules: yaraCount,
        clamav: clamMatches.length,
        vendor_detections: vendorDetections,
      },
    });
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
