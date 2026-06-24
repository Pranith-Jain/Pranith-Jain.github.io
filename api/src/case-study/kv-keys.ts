import type { CaseStudyType } from './types';

export const kv = {
  candidatesPrefix: (type: CaseStudyType) => `candidates:${type}:`,
  candidatesAllPrefix: 'candidates:',
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
  /** Single advisory index of {slug, platform} entries awaiting auto-post.
   *  The drip cron reads this one blob to find candidates, then confirms each
   *  against the authoritative per-slug schedule before posting. */
  socialAutopostQueue: 'social-autopost-queue',
  /** AI-generated illustration bytes for a post (name = 'hero' | 'body1' …).
   *  Served publicly via GET /api/v1/blog-image/:slug/:name. */
  postImage: (slug: string, name: string) => `post-img:${slug}:${name}`,
};
