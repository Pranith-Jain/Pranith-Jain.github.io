/**
 * Layer-2 IOC truth defence — live cross-check against threat-intel
 * providers (VirusTotal, AbuseIPDB, abuse.ch URLhaus/MalwareBazaar) before
 * a generated post reaches publish.
 *
 * Layer-1 (the placeholder filter in post-process.ts) catches the obvious
 * cases: RFC1918 IPs, example.com domains, all-zero hashes, the
 * cafebabe/deadbeef hash family. This layer catches the cases that LOOK
 * real (random-looking IP, plausible domain, valid-length hash) but
 * aren't backed by any upstream record — the hallucinated-but-shaped-
 * plausibly IOCs the model occasionally invents.
 *
 * Decision rule per IOC:
 *   - If ANY provider returns "exists" → keep, mark validated=true.
 *   - If providers all return explicit "not found" → drop.
 *   - If providers all error (timeout, auth, rate-limit, network) → keep.
 *     We don't trust our own check; better a false-keep than a false-drop.
 *   - If no provider supports this IOC type → skip (keep, validated=undef).
 *
 * Graceful when no API keys are set: returns the input unchanged with
 * skippedCount = iocs.length. The case-study pipeline still runs the
 * layer-1 placeholder filter — layer-2 is the bonus when keys are
 * provisioned.
 */

import type { PostIOC } from '../types';

export interface IocValidationEnv {
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  /** Shared free key across abuse.ch ThreatFox / URLhaus / MalwareBazaar. */
  ABUSECH_AUTH_KEY?: string;
}

export interface ValidatedIOC extends PostIOC {
  /**
   * `true` — at least one provider confirmed the indicator exists upstream.
   * `false` — every provider returned "not found"; the post-process
   *           filter dropped this IOC (won't appear in `iocs` output).
   * `undefined` — not validated (no provider supports the type, no API
   *               keys configured, or every provider errored). The IOC
   *               is kept; absence of evidence ≠ evidence of absence.
   */
  validated?: boolean;
}

export interface LiveValidationResult {
  iocs: ValidatedIOC[];
  /** Count of IOCs explicitly dropped because every provider said "not found". */
  droppedCount: number;
  /** Count of IOCs at least one provider confirmed exists. */
  validatedCount: number;
  /** Count of IOCs kept but not validated (provider error / no support / no keys). */
  skippedCount: number;
  /** Reasons for each dropped IOC, surfaced in the QA warnings list. */
  dropReasons: string[];
}

/** Hard cap on IOCs we'll spend API quota validating per post. */
const MAX_VALIDATIONS = 20;
/** Per-IOC fetch budget. Below the publisher's 30s wall but well above
 *  the typical 200-400ms VT / abuse.ch round-trip. */
const PROVIDER_TIMEOUT_MS = 8000;

/** Inner provider response. `exists`/`absent` are explicit; `error` keeps
 *  the IOC because we don't trust our own check. `unsupported` means
 *  this provider doesn't speak this IOC type (e.g. VT for email). */
type ProviderProbe = 'exists' | 'absent' | 'error' | 'unsupported';

/**
 * VirusTotal lookup — the most universal probe. v3 returns 200 with the
 * object when known; 404 means the resource genuinely isn't in VT. The
 * endpoint set covers every IOC type we care about (IP, domain, URL,
 * hash).
 */
async function probeVT(ioc: PostIOC, key: string, signal: AbortSignal): Promise<ProviderProbe> {
  const base = 'https://www.virustotal.com/api/v3';
  let url: string;
  switch (ioc.type) {
    case 'ipv4':
    case 'ipv6':
      url = `${base}/ip_addresses/${encodeURIComponent(ioc.value)}`;
      break;
    case 'domain':
      url = `${base}/domains/${encodeURIComponent(ioc.value)}`;
      break;
    case 'url': {
      const b64 = btoa(ioc.value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      url = `${base}/urls/${b64}`;
      break;
    }
    case 'sha256':
    case 'sha1':
    case 'md5':
      url = `${base}/files/${encodeURIComponent(ioc.value)}`;
      break;
    default:
      return 'unsupported';
  }
  try {
    const r = await fetch(url, { headers: { 'x-apikey': key, accept: 'application/json' }, signal });
    if (r.status === 200) return 'exists';
    if (r.status === 404) return 'absent';
    return 'error';
  } catch {
    return 'error';
  }
}

/**
 * AbuseIPDB lookup for IPv4/IPv6. The /check endpoint returns 200 with
 * `data.totalReports`. An IP with `totalReports === 0` AND a freshly-
 * created record (no `lastReportedAt`) is treated as "absent" — the IP
 * exists on the internet but has zero abuse history. AbuseIPDB never
 * returns 404 for valid IPs, so this is the closest signal we get.
 */
async function probeAbuseIPDB(ioc: PostIOC, key: string, signal: AbortSignal): Promise<ProviderProbe> {
  if (ioc.type !== 'ipv4' && ioc.type !== 'ipv6') return 'unsupported';
  const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ioc.value)}&maxAgeInDays=365`;
  try {
    const r = await fetch(url, { headers: { Key: key, accept: 'application/json' }, signal });
    if (!r.ok) return 'error';
    const j = (await r.json()) as { data?: { totalReports?: number; lastReportedAt?: string | null } };
    const reports = Number(j.data?.totalReports ?? 0);
    return reports > 0 ? 'exists' : 'absent';
  } catch {
    return 'error';
  }
}

/**
 * MalwareBazaar lookup for file hashes. POST-only API; `hash=<value>`
 * with the shared abuse.ch auth key. Returns `query_status: "ok"` when
 * found, `query_status: "hash_not_found"` when absent.
 */
async function probeMalwareBazaar(ioc: PostIOC, key: string, signal: AbortSignal): Promise<ProviderProbe> {
  if (ioc.type !== 'sha256' && ioc.type !== 'sha1' && ioc.type !== 'md5') return 'unsupported';
  try {
    const body = new URLSearchParams({ query: 'get_info', hash: ioc.value });
    const r = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: {
        'Auth-Key': key,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal,
    });
    if (!r.ok) return 'error';
    const j = (await r.json()) as { query_status?: string };
    if (j.query_status === 'ok') return 'exists';
    if (j.query_status === 'hash_not_found' || j.query_status === 'no_results') return 'absent';
    return 'error';
  } catch {
    return 'error';
  }
}

/**
 * URLhaus lookup for malicious URLs. POST-only API; `url=<value>` with
 * the shared abuse.ch auth key. Returns `query_status: "ok"` when known
 * malicious, `query_status: "no_results"` when not in their dataset.
 */
async function probeUrlhaus(ioc: PostIOC, key: string, signal: AbortSignal): Promise<ProviderProbe> {
  if (ioc.type !== 'url') return 'unsupported';
  try {
    const body = new URLSearchParams({ url: ioc.value });
    const r = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: {
        'Auth-Key': key,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal,
    });
    if (!r.ok) return 'error';
    const j = (await r.json()) as { query_status?: string };
    if (j.query_status === 'ok') return 'exists';
    if (j.query_status === 'no_results' || j.query_status === 'invalid_url') return 'absent';
    return 'error';
  } catch {
    return 'error';
  }
}

/** Run every supported probe against one IOC in parallel within the
 *  shared timeout budget. Returns the verdict + which providers agreed. */
async function probeOne(
  ioc: PostIOC,
  env: IocValidationEnv
): Promise<{
  keep: boolean;
  validated: boolean | undefined;
  probes: Array<{ provider: string; result: ProviderProbe }>;
}> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  const checks: Array<Promise<{ provider: string; result: ProviderProbe }>> = [];
  if (env.VT_API_KEY) {
    checks.push(probeVT(ioc, env.VT_API_KEY, ctrl.signal).then((r) => ({ provider: 'vt', result: r })));
  }
  if (env.ABUSEIPDB_API_KEY) {
    checks.push(
      probeAbuseIPDB(ioc, env.ABUSEIPDB_API_KEY, ctrl.signal).then((r) => ({ provider: 'abuseipdb', result: r }))
    );
  }
  if (env.ABUSECH_AUTH_KEY) {
    checks.push(
      probeMalwareBazaar(ioc, env.ABUSECH_AUTH_KEY, ctrl.signal).then((r) => ({ provider: 'malwarebazaar', result: r }))
    );
    checks.push(probeUrlhaus(ioc, env.ABUSECH_AUTH_KEY, ctrl.signal).then((r) => ({ provider: 'urlhaus', result: r })));
  }

  if (checks.length === 0) {
    clearTimeout(timeout);
    return { keep: true, validated: undefined, probes: [] };
  }

  const probes = await Promise.all(checks);
  clearTimeout(timeout);

  // Only providers that ACTIVELY support this IOC type vote. An
  // "unsupported" result means the provider didn't try.
  const voting = probes.filter((p) => p.result !== 'unsupported');
  if (voting.length === 0) return { keep: true, validated: undefined, probes };
  if (voting.some((p) => p.result === 'exists')) return { keep: true, validated: true, probes };
  if (voting.every((p) => p.result === 'absent')) return { keep: false, validated: false, probes };
  // Mixed error / absent — be conservative, keep but flag unvalidated.
  return { keep: true, validated: undefined, probes };
}

/**
 * Validate a list of IOCs against live threat-intel providers. Returns
 * the kept IOCs (possibly fewer than input) plus counters for the QA
 * warnings list.
 *
 * Pure-ish: takes an env and uses global fetch. No KV / no D1 / no
 * `caches`. Tests stub fetch via `vi.stubGlobal('fetch', …)`.
 */
export async function validateIocsLive(iocs: PostIOC[], env: IocValidationEnv): Promise<LiveValidationResult> {
  // Fast path: no keys configured at all → skip entirely.
  if (!env.VT_API_KEY && !env.ABUSEIPDB_API_KEY && !env.ABUSECH_AUTH_KEY) {
    return {
      iocs: iocs.slice(),
      droppedCount: 0,
      validatedCount: 0,
      skippedCount: iocs.length,
      dropReasons: [],
    };
  }

  const toValidate = iocs.slice(0, MAX_VALIDATIONS);
  const unchanged = iocs.slice(MAX_VALIDATIONS); // beyond cap — keep as-is, skipped

  // Concurrency pool of 4 — enough to hide network latency without
  // hammering any single provider.
  const CONCURRENCY = 4;
  const results: Array<{ ioc: PostIOC; keep: boolean; validated: boolean | undefined }> = new Array(toValidate.length);
  let i = 0;
  async function worker() {
    while (i < toValidate.length) {
      const idx = i++;
      const ioc = toValidate[idx]!;
      const r = await probeOne(ioc, env);
      results[idx] = { ioc, keep: r.keep, validated: r.validated };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toValidate.length) }, worker));

  const kept: ValidatedIOC[] = [];
  const dropReasons: string[] = [];
  let droppedCount = 0;
  let validatedCount = 0;
  let skippedCount = unchanged.length;
  for (const r of results) {
    if (!r) continue;
    if (!r.keep) {
      droppedCount += 1;
      dropReasons.push(`${r.ioc.type}:${r.ioc.value} (no provider record)`);
      continue;
    }
    if (r.validated === true) validatedCount += 1;
    else skippedCount += 1;
    kept.push({ ...r.ioc, validated: r.validated });
  }
  for (const ioc of unchanged) kept.push({ ...ioc });

  return { iocs: kept, droppedCount, validatedCount, skippedCount, dropReasons };
}
