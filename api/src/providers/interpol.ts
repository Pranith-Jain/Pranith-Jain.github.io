import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'domain', 'email']);

interface InterpolNotice {
  entity_id?: string;
  name?: string;
  forename?: string;
  date_of_birth?: string;
  nationality?: string[];
  sex?: string;
  issuing_country?: string;
  arrest_warrant?: string;
  charge?: string;
  charge_translation?: string;
  url?: string;
}

interface InterpolResponse {
  total?: number;
  query?: Record<string, unknown>;
  _embedded?: {
    notices?: InterpolNotice[];
  };
}

export const interpol: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'interpol',
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
    const searchParam =
      indicator.type === 'email' ? (indicator.value.split('@')[0] ?? indicator.value) : indicator.value;

    const res = await fetch(
      `https://ws-public.interpol.int/notices/v1/red?name=${encodeURIComponent(searchParam)}&resultPerPage=10`,
      {
        headers: { Accept: 'application/json' },
        signal,
      }
    );

    if (res.status === 429) return base('error', toProviderError(classifyResponseError(res)));
    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as InterpolResponse;
    const total = json.total ?? 0;
    const notices = json._embedded?.notices ?? [];

    if (total === 0 || notices.length === 0) {
      return base('ok', {
        verdict: 'clean',
        tags: ['no-interpol-match'],
        raw_summary: { total: 0, message: 'no Interpol Red Notice match' },
      });
    }

    const tags: string[] = ['interpol-red-notice'];
    const countries = new Set<string>();

    for (const n of notices.slice(0, 5)) {
      if (n.nationality) n.nationality.forEach((c) => countries.add(c));
      if (n.issuing_country) countries.add(n.issuing_country);
    }
    countries.forEach((c) => tags.push(`country:${c}`));

    const verdict: Verdict = 'malicious';
    const score = 90;

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        total_matches: total,
        matches: notices.slice(0, 5).map((n) => ({
          name: `${n.forename ?? ''} ${n.name ?? ''}`.trim(),
          entity_id: n.entity_id,
          date_of_birth: n.date_of_birth,
          nationality: n.nationality,
          sex: n.sex,
          issuing_country: n.issuing_country,
          charge: n.charge_translation ?? n.charge,
          url: n.url,
        })),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
