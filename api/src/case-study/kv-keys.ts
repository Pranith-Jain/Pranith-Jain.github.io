import type { CaseStudyType } from './types';

export const kv = {
  candidate: (type: CaseStudyType, stableKey: string) => `candidates:${type}:${stableKey}`,
  candidatesPrefix: (type: CaseStudyType) => `candidates:${type}:`,
  candidatesAllPrefix: 'candidates:',
  approved: (stableKey: string) => `approved:${stableKey}`,
  approvedPrefix: 'approved:',
  scheduleUpcoming: 'schedule:upcoming',
  post: (slug: string) => `posts:${slug}`,
  postsIndex: 'posts:index',
  /** Draft pipeline — populated when BLOG_APPROVAL_REQUIRED is on. The
   *  post body is identical to the published one; promotion is a one-write
   *  copy from `draft:<slug>` to `posts:<slug>` plus an index update. */
  draft: (slug: string) => `drafts:${slug}`,
  draftsIndex: 'drafts:index',
  metaRss: 'meta:rss',
  dedup: (stableKey: string) => `meta:dedup:${stableKey}`,
  failed: (slotId: string) => `failed:${slotId}`,
  socialTwitter: (slug: string) => `social:${slug}:twitter`,
  socialLinkedin: (slug: string) => `social:${slug}:linkedin`,
  social: (slug: string) => `social:${slug}`,
  /** Standalone social content generated from a candidate (no blog post). */
  socialCandidate: (key: string) => `social:standalone:${key}`,
  socialCandidateTwitter: (key: string) => `social:standalone:${key}:twitter`,
  socialCandidateLinkedin: (key: string) => `social:standalone:${key}:linkedin`,
  /** Manual-posting status/schedule for a post's social copy. Separate key
   *  so it never collides with the generated-content `social:*` keys. */
  socialSchedule: (slug: string) => `social-schedule:${slug}`,
};
