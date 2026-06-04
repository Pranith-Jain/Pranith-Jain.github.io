import type { KVNamespace } from '@cloudflare/workers-types';
import type { SocialSchedule, SocialScheduleEntry } from '../types';
import { kv } from '../kv-keys';

export type SocialPlatform = 'twitter' | 'linkedin';

export function isSocialPlatform(v: string): v is SocialPlatform {
  return v === 'twitter' || v === 'linkedin';
}

export async function getSocialSchedule(ns: KVNamespace, slug: string): Promise<SocialSchedule | null> {
  return (await ns.get(kv.socialSchedule(slug), 'json')) as SocialSchedule | null;
}

/** Set/merge one platform's schedule entry (scheduledAt and/or status). */
export async function upsertSocialSchedule(
  ns: KVNamespace,
  slug: string,
  platform: SocialPlatform,
  patch: Partial<SocialScheduleEntry>,
  now: Date = new Date()
): Promise<SocialSchedule> {
  const cur: SocialSchedule = (await getSocialSchedule(ns, slug)) ?? { slug, updatedAt: now.toISOString() };
  const prev: SocialScheduleEntry = cur[platform] ?? { status: 'pending' };
  const entry: SocialScheduleEntry = { ...prev, ...patch };
  const updated: SocialSchedule = { ...cur, slug, updatedAt: now.toISOString(), [platform]: entry };
  await ns.put(kv.socialSchedule(slug), JSON.stringify(updated));
  return updated;
}

/** Mark one platform posted (status=posted, postedAt=now). */
export async function markSocialPosted(
  ns: KVNamespace,
  slug: string,
  platform: SocialPlatform,
  now: Date = new Date()
): Promise<SocialSchedule> {
  return upsertSocialSchedule(ns, slug, platform, { status: 'posted', postedAt: now.toISOString() }, now);
}
