import type { ProviderAdapter, ProviderResult, Verdict } from './types';
import { classifyResponseError, classifyThrownError, toProviderError } from '../lib/provider-errors';

const supports = new Set(['ipv4', 'domain', 'email']);

interface FbiWantedItem {
  title?: string;
  uid?: string;
  description?: string;
  subjects?: string[];
  field_offices?: string[];
  nationality?: string;
  sex?: string;
  race?: string;
  hair?: string;
  eyes?: string;
  height?: number;
  weight?: number;
  build?: string;
  alias?: string[];
  ncic?: string;
  caution?: string;
  reward_text?: string;
  dates_of_birth_used?: string[];
  place_of_birth?: string;
  languages?: string[];
  occupations?: string[];
  scars_and_marks?: string;
  suspects?: string;
  status?: string;
  url?: string;
}

interface FbiWantedResponse {
  total?: number;
  page?: number;
  items?: FbiWantedItem[];
}

export const fbiWanted: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'fbi-wanted',
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
    const res = await fetch(
      `https://api.fbi.gov/wanted/v1/list?title=${encodeURIComponent(indicator.value)}&pageSize=10`,
      {
        headers: { Accept: 'application/json' },
        signal,
      }
    );

    if (!res.ok) return base('error', toProviderError(classifyResponseError(res)));

    const json = (await res.json()) as FbiWantedResponse;
    const total = json.total ?? 0;
    const items = json.items ?? [];

    if (total === 0 || items.length === 0) {
      return base('ok', {
        verdict: 'clean',
        tags: ['no-fbi-match'],
        raw_summary: { total: 0, message: 'no FBI wanted match' },
      });
    }

    const tags: string[] = [];
    const fieldOffices = new Set<string>();

    for (const item of items.slice(0, 5)) {
      if (item.field_offices) item.field_offices.forEach((o) => fieldOffices.add(o));
      if (item.nationality) tags.push(`nationality:${item.nationality}`);
      if (item.status) tags.push(`status:${item.status}`);
      if (item.reward_text) tags.push('has-reward');
    }

    let verdict: Verdict = 'suspicious';
    let score = 60;

    if (total > 0) {
      const hasViolent = items.some(
        (i) =>
          i.description?.toLowerCase().includes('violent') ||
          i.description?.toLowerCase().includes('murder') ||
          i.description?.toLowerCase().includes('terrorism')
      );
      if (hasViolent) {
        verdict = 'malicious';
        score = 100;
      }
    }

    return base('ok', {
      score,
      verdict,
      tags: [...new Set(tags)].slice(0, 7),
      raw_summary: {
        total_matches: total,
        matches: items.slice(0, 5).map((i) => ({
          title: i.title,
          uid: i.uid,
          nationality: i.nationality,
          sex: i.sex,
          reward_text: i.reward_text,
          status: i.status,
          url: i.url,
          description: i.description?.slice(0, 200),
        })),
      },
    });
  } catch (err) {
    return base('error', toProviderError(classifyThrownError(err)));
  }
};
