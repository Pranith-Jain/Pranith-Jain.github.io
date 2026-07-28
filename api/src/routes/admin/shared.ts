import type { Env } from '../../env';
import type { Post } from '../../case-study/types';
import { getDraft } from '../../case-study/storage/drafts';
import { getSiteUrl } from '../../lib/site-config';
import { kv as csKvKeys } from '../../case-study/kv-keys';
import { CANDIDATE_TYPES } from '../../case-study/storage/candidates';

export const SLUG_RE = /^[a-z0-9-]+$/;
export const TYPES = CANDIDATE_TYPES;

export function validSlug(slug: string | undefined): slug is string {
  return !!slug && slug.length <= 200 && slug !== 'index' && SLUG_RE.test(slug);
}

export async function getPostOrDraft(env: Env, slug: string): Promise<Post | null> {
  const post = await env.CASE_STUDIES.get<Post>(csKvKeys.post(slug), 'json');
  if (post) return post;
  return getDraft(env.CASE_STUDIES, slug);
}

export async function fetchOgCardPng(
  env: Env,
  type: 'blog' | 'briefing',
  slug: string
): Promise<Uint8Array | undefined> {
  try {
    const fetcher = env.SELF ?? { fetch: globalThis.fetch };
    const origin = getSiteUrl(env).replace(/\/$/, '');
    const res = await fetcher.fetch(new Request(`${origin}/api/v1/og-image/${type}/${slug}.png`));
    if (!res.ok) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > 0 ? bytes : undefined;
  } catch (_catchErr) {
    console.error('fetchOgCardPng failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return undefined;
  }
}
