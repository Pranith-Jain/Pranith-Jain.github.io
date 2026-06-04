// api/src/case-study/types.ts

export type CaseStudyType =
  | 'cve'
  | 'actor'
  | 'malware'
  | 'ransom'
  | 'breach'
  | 'scam'
  | 'aisec'
  | 'intel'
  | 'osint'
  | 'methodology'
  | 'trend'
  | 'briefing'
  | 'analysis'; // Thought leadership / framework pieces

export type CandidateStatus = 'pending' | 'approved' | 'skipped' | 'published';

export interface Candidate {
  key: string; // stable key, e.g. "cve-2026-1234"
  type: CaseStudyType;
  title: string;
  rationale: string; // one-line why-this-matters
  score: number; // 0..1
  evidence: Record<string, unknown>; // type-specific snapshot
  discoveredAt: string; // ISO 8601
  status: CandidateStatus;
}

export interface Slot {
  slotAt: string; // ISO 8601
  candidateId: string; // stable key
  /**
   * `draft` is the new terminal state for the approval-gate flow: the
   * publisher generated the post but it's awaiting an admin click before
   * it goes public. Once approved it moves to `published`; once rejected
   * the slot stays at `draft` until the admin explicitly clears it.
   */
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'draft';
  publishedSlug?: string;
  error?: string;
}

export interface PostIOC {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'sha256' | 'sha1' | 'md5' | 'email';
  value: string;
}

export interface PostSource {
  url: string;
  title: string;
}

export interface QualityScore {
  total: number;
  breakdown: {
    length: number;
    sections: number;
    depth: number;
    technical: number;
    references: number;
    fillerPenalty: number;
  };
}

/** Deterministic content-QA verdict. `passed: false` gates a publish. */
export interface QaVerdict {
  passed: boolean;
  /** 0-100 — mirrors QualityScore.total at QA time. */
  score: number;
  /** Human-readable QA failures (empty when passed). */
  issues: string[];
}

export interface Post {
  slug: string;
  type: CaseStudyType;
  title: string;
  excerpt: string;
  publishedAt: string; // ISO 8601
  candidateId: string;
  body: string; // markdown
  hero: string; // inline SVG
  iocs: PostIOC[];
  tags: string[];
  sources: PostSource[];
  quality?: QualityScore;
  qa?: QaVerdict;
  /**
   * Optional approval gate metadata. Absent for legacy auto-published
   * posts (treated as `published`). New posts go through `draft` first
   * when `BLOG_APPROVAL_REQUIRED=true` is set on the worker.
   */
  status?: 'draft' | 'published';
  /** ISO 8601 timestamp set when an admin approves a draft. */
  approvedAt?: string;
}

export interface PostIndexEntry {
  slug: string;
  title: string;
  type: CaseStudyType;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

export interface DedupRecord {
  lastSeenAt: string;
  publishedSlug?: string;
  /** ISO 8601. When in the future, discovery hard-suppresses this key
   *  (set by admin Skip / Clear-all). Distinct from the 60-day published
   *  republish-block, which is keyed off `publishedSlug`. */
  suppressedUntil?: string;
}

export interface FailureRecord {
  slotId: string;
  candidateId: string;
  error: string;
  rawOutput?: string;
  failedAt: string;
  retries: number;
}

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}
