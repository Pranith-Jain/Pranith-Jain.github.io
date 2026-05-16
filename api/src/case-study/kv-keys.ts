import type { CaseStudyType } from './types';

export const kv = {
  candidate: (type: CaseStudyType, stableKey: string) => `candidates:${type}:${stableKey}`,
  candidatesPrefix: (type: CaseStudyType) => `candidates:${type}:`,
  approved: (stableKey: string) => `approved:${stableKey}`,
  approvedPrefix: 'approved:',
  scheduleUpcoming: 'schedule:upcoming',
  post: (slug: string) => `posts:${slug}`,
  postsIndex: 'posts:index',
  metaRss: 'meta:rss',
  dedup: (stableKey: string) => `meta:dedup:${stableKey}`,
  failed: (slotId: string) => `failed:${slotId}`,
  socialTwitter: (slug: string) => `social:${slug}:twitter`,
  socialLinkedin: (slug: string) => `social:${slug}:linkedin`,
  social: (slug: string) => `social:${slug}`,
};
