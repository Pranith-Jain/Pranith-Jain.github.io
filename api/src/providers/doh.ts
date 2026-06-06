import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import {
  classifyResponseError,
  classifyThrownError,
  toProviderError,
  type ProviderErrorInfo,
} from '../lib/provider-errors';

const supports = new Set(['domain']);

export const doh: ProviderAdapter = async (indicator, _env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'doh',
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

  try {
    // allSettled so one record-type timeout doesn't nuke the whole DNS
    // report. Each lookup is independent — partial success is still
    // useful (e.g. A-record NXDOMAIN is enough to flag the domain).
    const settled = await Promise.allSettled([
      query(indicator.value, 'A', signal),
      query(indicator.value, 'MX', signal),
      query(indicator.value, 'NS', signal),
      query(indicator.value, 'TXT', signal),
      query(`_dmarc.${indicator.value}`, 'TXT', signal),
    ]);

    const okLookups: DohResponse[] = [];
    const partialErrors: ProviderErrorInfo[] = [];
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        if (s.value.ok) okLookups.push(s.value.response);
        else partialErrors.push(s.value.error);
      } else {
        partialErrors.push(classifyThrownError(s.reason));
      }
    }

    // Total DoH failure — every lookup either 4xx/5xx'd or threw. We
    // can't tell the user anything about this domain, and we want them
    // to see "rate-limited" / "upstream 5xx" specifically (not the
    // pre-refactor generic 'doh_unavailable').
    if (okLookups.length === 0) {
      const first = partialErrors[0];
      const info: ProviderErrorInfo = first
        ? first
        : { error: 'doh_unavailable', code: 'upstream_5xx', tags: ['upstream-5xx'] };
      return base('error', toProviderError(info));
    }

    const a: DohResponse = okLookups[0]!;
    const mx: DohResponse | undefined = okLookups[1];
    const ns: DohResponse | undefined = okLookups[2];
    const txt: DohResponse | undefined = okLookups[3];
    const dmarc: DohResponse | undefined = okLookups[4];

    const tags: string[] = [];
    let score = 0;
    let verdict: Verdict = 'clean';

    if (a.Status === 3) {
      tags.push('nxdomain');
      score = 60;
      verdict = 'suspicious';
    }
    if (a.Status === 0 && !a.Answer) {
      tags.push('no-a-record');
      score = Math.max(score, 25);
    }
    if (!mx?.Answer) tags.push('no-mx');
    if (!ns?.Answer) tags.push('no-ns');

    const spf = (txt?.Answer ?? []).some((r) => /v=spf1/i.test(r.data ?? ''));
    const hasDmarc = !!dmarc?.Answer?.length;
    if (!spf) tags.push('no-spf');
    if (!hasDmarc) tags.push('no-dmarc');

    // Partial failure note — the verdict still reflects what we did
    // learn, but the operator can see "3 of 5 lookups failed" in
    // error_tags if any of the parallel queries 429'd.
    const partialErrorTags = partialErrors.flatMap((e) => e.tags);

    return base('ok', {
      score,
      verdict,
      tags: [...tags, ...partialErrorTags],
      raw_summary: {
        nxdomain: a.Status === 3,
        has_a: !!a.Answer,
        has_mx: !!mx?.Answer,
        has_ns: !!ns?.Answer,
        spf,
        dmarc: hasDmarc,
        ...(partialErrors.length > 0
          ? { partial_failure: `${partialErrors.length}/${settled.length} DoH lookups failed` }
          : {}),
        ...(partialErrors.length > 0 ? { partial_error_tags: [...new Set(partialErrorTags)] } : {}),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};

interface DohResponse {
  Status: number;
  Answer?: { data?: string }[];
}

type QueryResult = { ok: true; response: DohResponse } | { ok: false; error: ProviderErrorInfo };

async function query(name: string, type: string, signal: AbortSignal): Promise<QueryResult> {
  let r: Response;
  try {
    r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal,
    });
  } catch (err) {
    return { ok: false, error: classifyThrownError(err) };
  }
  if (!r.ok) return { ok: false, error: classifyResponseError(r) };
  try {
    return { ok: true, response: (await r.json()) as DohResponse };
  } catch (err) {
    return { ok: false, error: classifyThrownError(err) };
  }
}
